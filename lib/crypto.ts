import crypto from "crypto";

// Encrypts secrets we hold on a user's behalf (Supabase OAuth tokens, DB
// password) before they touch the database -- see
// db/migrations/0003_connected_backends.sql. AES-256-GCM with a random IV
// per value; the key never leaves this process.
//
// BACKEND_ENCRYPTION_KEY must be a 32-byte key, base64-encoded. Generate
// one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
function getKey(): Buffer {
  const raw = process.env.BACKEND_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing BACKEND_ENCRYPTION_KEY. Set it in Vercel -> Project -> Settings -> Environment Variables (32-byte base64 key)."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BACKEND_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

/** Returns "iv:authTag:ciphertext", each base64, colon-joined. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
