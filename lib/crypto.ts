import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope: v1:<iv>:<ciphertext>:<authTag> (base64 segments).
// The version prefix exists so INTEGRATION_TOKEN_KEY can be rotated later by
// introducing v2 while still decrypting v1 rows. The key must be backed up —
// regenerating it makes every stored secret unreadable.

const ENVELOPE_VERSION = "v1";

function getEncryptionKey(): Buffer {
  const raw = process.env.INTEGRATION_TOKEN_KEY;
  if (!raw) {
    throw new Error("Missing INTEGRATION_TOKEN_KEY environment variable.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_TOKEN_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    ciphertext.toString("base64"),
    tag.toString("base64")
  ].join(":");
}

export function decryptSecret(envelope: string): string {
  const [version, ivB64, ciphertextB64, tagB64] = envelope.split(":");
  if (version !== ENVELOPE_VERSION || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error("Unrecognized secret envelope format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}
