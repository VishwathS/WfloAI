import { lookup as dnsLookup } from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";
import { HTTP_LIMITS } from "@/lib/http/constants";

export const BLOCKED_ADDRESS_MESSAGE =
  "Requests to private or internal addresses aren't allowed.";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  return BLOCKED_HOSTNAMES.has(lower) || lower.endsWith(".localhost");
}

// Only plain public unicast addresses are allowed. ipaddr.js classifies
// loopback, private, link-local, CGNAT, multicast, reserved, unspecified,
// unique-local, and the IPv6 transition ranges as non-"unicast"; IPv4-mapped
// IPv6 is unmapped and re-checked. Unparseable input is blocked.
export function isBlockedIpAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return true;
  }
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    }
  }
  return parsed.range() !== "unicast";
}

// Rejects a URL before any connection is attempted. The connect-time lookup
// guard below is the authoritative check; this exists for fast, clear errors
// on obvious cases (IP literals, localhost, embedded credentials).
export function assertUrlAllowed(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("That URL doesn't look right — it must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials (user:password@) aren't allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new Error(BLOCKED_ADDRESS_MESSAGE);
  }
  if (ipaddr.isValid(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error(BLOCKED_ADDRESS_MESSAGE);
  }
}

// Validates every DNS answer and hands net.connect a vetted address, so the
// socket can only ever be opened to an address that passed the check — no
// resolve-then-connect gap for DNS rebinding to exploit.
function guardedLookup(
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
  if (isBlockedHostname(hostname)) {
    callback(new Error(BLOCKED_ADDRESS_MESSAGE), "", 0);
    return;
  }
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err, "", 0);
      return;
    }
    if (!addresses.length || addresses.some((entry) => isBlockedIpAddress(entry.address))) {
      callback(new Error(BLOCKED_ADDRESS_MESSAGE), "", 0);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  });
}

let dispatcher: Agent | null = null;

export function getGuardedDispatcher(): Agent {
  if (!dispatcher) {
    dispatcher = new Agent({
      connect: {
        timeout: HTTP_LIMITS.CONNECT_TIMEOUT_MS,
        lookup: guardedLookup
      }
    });
  }
  return dispatcher;
}
