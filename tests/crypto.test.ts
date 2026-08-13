import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.INTEGRATION_TOKEN_KEY = randomBytes(32).toString("base64");
});

describe("crypto envelope", () => {
  test("round-trips plaintext", () => {
    const secret = "fake-refresh-token-123";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  test("produces the versioned v1 format", () => {
    const envelope = encryptSecret("value");
    expect(envelope.split(":")).toHaveLength(4);
    expect(envelope.startsWith("v1:")).toBe(true);
  });

  test("unique ciphertext per call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("rejects tampered ciphertext", () => {
    const [version, iv, ciphertext, tag] = encryptSecret("value").split(":");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[0] ^= 0xff;
    expect(() =>
      decryptSecret([version, iv, tampered.toString("base64"), tag].join(":"))
    ).toThrow();
  });

  test("rejects unknown envelope versions", () => {
    expect(() => decryptSecret("v9:a:b:c")).toThrow("Unrecognized secret envelope format.");
  });
});
