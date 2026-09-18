import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  REQUIRED_SERVER_ENV,
  assertServerEnv,
  describeMissingServerEnv,
  inngestDevModeRequested,
  missingServerEnv
} from "@/lib/config/env";

// A10. The point of this check is that a missing INNGEST_SIGNING_KEY currently
// fails silently: the serve endpoint simply starts accepting unsigned requests
// into the service-role execution path. Nothing looks broken.

function completeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { NODE_ENV: "production" };
  for (const { name } of REQUIRED_SERVER_ENV) {
    env[name] = "set";
  }
  return env;
}

describe("required production variables", () => {
  test("a complete environment starts", () => {
    expect(missingServerEnv(completeEnv())).toEqual([]);
    expect(() => assertServerEnv(completeEnv())).not.toThrow();
  });

  test.each(REQUIRED_SERVER_ENV.map(({ name }) => name))(
    "production refuses to start without %s",
    (name) => {
      const env = completeEnv();
      delete env[name];

      expect(missingServerEnv(env)).toContain(name);
      expect(() => assertServerEnv(env)).toThrow(name);
    }
  );

  test("an empty or whitespace value counts as missing", () => {
    // A host that sets a variable to "" is the same failure as not setting it,
    // and is the more likely one.
    const blank = { ...completeEnv(), INNGEST_SIGNING_KEY: "" };
    const spaces = { ...completeEnv(), INNGEST_SIGNING_KEY: "   " };

    expect(missingServerEnv(blank)).toEqual(["INNGEST_SIGNING_KEY"]);
    expect(missingServerEnv(spaces)).toEqual(["INNGEST_SIGNING_KEY"]);
  });

  test("development is not blocked by a partial environment", () => {
    // A hard failure in development would make the app unusable for anyone
    // working on a single feature.
    expect(() => assertServerEnv({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertServerEnv({})).not.toThrow();
  });

  test("both Inngest keys are required, not just the signing key", () => {
    // They are not interchangeable and a passing unsigned-POST test says
    // nothing about the event key.
    const names = REQUIRED_SERVER_ENV.map(({ name }) => name);
    expect(names).toContain("INNGEST_SIGNING_KEY");
    expect(names).toContain("INNGEST_EVENT_KEY");
  });

  test("the failure message names every missing variable and says why", () => {
    const message = describeMissingServerEnv(["INNGEST_SIGNING_KEY", "INTEGRATION_TOKEN_KEY"]);

    expect(message).toContain("INNGEST_SIGNING_KEY");
    expect(message).toContain("unsigned");
    expect(message).toContain("INTEGRATION_TOKEN_KEY");
    expect(message).toContain("KEY-RECOVERY.md");
  });
});

describe("the check is actually wired to server startup", () => {
  const source = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");

  test("instrumentation calls it", () => {
    expect(source).toContain("assertServerEnv()");
  });

  test("and skips the build, which has no reason to hold production secrets", () => {
    expect(source).toContain("phase-production-build");
  });

  test("and exits the process rather than lingering half-started", () => {
    // Verified locally against `next start` with NODE_ENV=production and both
    // Inngest keys absent: without the explicit exit, Next logs the failed
    // instrumentation hook, prints "Ready", and keeps serving nothing for as
    // long as you leave it. That is still silence by the standard A10 cares
    // about. With it, the process exits 1 in about a second.
    expect(source).toContain("process.exit(1)");
    expect(source).toContain("startup.required_env_missing");
  });
});

describe("the env example declares what production needs", () => {
  const example = readFileSync(new URL("../.env.local.example", import.meta.url), "utf8");

  test.each(REQUIRED_SERVER_ENV.map(({ name }) => name))("%s appears as a real key", (name) => {
    // "Appears as a key" rather than "is mentioned": both Inngest keys used to
    // exist only inside a comment, which is what A10 is about.
    expect(example).toMatch(new RegExp(`^${name}=`, "m"));
  });

  test("every variable application code reads is declared", () => {
    // Task 13 inventory rule: read-but-undeclared is a defect. The operator
    // builds the production environment from this file, so a variable missing
    // here is a variable missing in production. RETENTION_CLEANUP_ENABLED was
    // the first one found.
    const platformProvided = new Set(["NODE_ENV", "NEXT_PHASE", "NEXT_RUNTIME"]);
    const root = new URL("../", import.meta.url);
    const sources = ["app", "lib", "components", "hooks"]
      .flatMap((dir) =>
        (readdirSync(new URL(dir, root), { recursive: true }) as string[])
          .filter((file) => /\.(ts|tsx)$/.test(file))
          .map((file) => `${dir}/${file.replaceAll("\\", "/")}`)
      )
      .concat(["proxy.ts", "instrumentation.ts"]);

    const read = new Set(
      sources.flatMap((file) =>
        [...readFileSync(new URL(file, root), "utf8").matchAll(/process\.env\.([A-Z_]+)/g)].map(
          (match) => match[1]
        )
      )
    );

    const undeclared = [...read].filter(
      (name) => !platformProvided.has(name) && !new RegExp(`^#? ?${name}=`, "m").test(example)
    );

    expect(read.size).toBeGreaterThan(5);
    expect(undeclared).toEqual([]);
  });
});

describe("INNGEST_DEV cannot reach production", () => {
  // Dev mode skips signature verification, so INNGEST_DEV in production defeats
  // A10 even when INNGEST_SIGNING_KEY is correctly set. The unsigned-POST test
  // would catch it; this makes it a refused boot instead of a silent hole.
  test.each(["1", "true", "TRUE", " 1 ", "http://localhost:8288"])(
    "production refuses to start with INNGEST_DEV=%j",
    (value) => {
      expect(inngestDevModeRequested(value)).toBe(true);
      expect(() => assertServerEnv({ ...completeEnv(), INNGEST_DEV: value })).toThrow(
        "INNGEST_DEV"
      );
    }
  );

  test.each([undefined, "", "0", "false", "FALSE"])(
    "INNGEST_DEV=%j leaves the SDK in cloud mode and starts",
    (value) => {
      expect(inngestDevModeRequested(value)).toBe(false);
      expect(() => assertServerEnv({ ...completeEnv(), INNGEST_DEV: value })).not.toThrow();
    }
  );

  test("development keeps working with INNGEST_DEV=1", () => {
    expect(() => assertServerEnv({ NODE_ENV: "development", INNGEST_DEV: "1" })).not.toThrow();
  });
});
