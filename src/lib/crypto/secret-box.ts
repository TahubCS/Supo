import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

// Encrypts third-party credentials (OAuth tokens) at rest with AES-256-GCM.
// `context` is bound as additional authenticated data, so a value sealed for
// one purpose (say, a refresh token) cannot be opened as another.
//
// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url. The version prefix
// lets a future key rotation recognise values sealed with the current key.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function integrationsEncryptionKey(): Buffer {
  const raw = env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function sealSecret(plaintext: string, context: string, key = integrationsEncryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function openSecret(sealed: string, context: string, key = integrationsEncryptionKey()): string {
  const [version, iv, tag, ciphertext, extra] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || extra !== undefined) {
    throw new Error("Unsupported secret format");
  }
  // Pinning the tag length rejects truncated tags, which GCM would otherwise accept.
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
