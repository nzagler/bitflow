import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(process.env.APP_ENCRYPTION_KEY ?? "bitflow-dev-key").digest();

export function encryptSecret(plainText: string) {
  if (!plainText) {
    return "";
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(cipherText: string) {
  if (!cipherText) {
    return "";
  }

  const raw = Buffer.from(cipherText, "base64");
  const iv = raw.subarray(0, 16);
  const tag = raw.subarray(16, 32);
  const encrypted = raw.subarray(32);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
