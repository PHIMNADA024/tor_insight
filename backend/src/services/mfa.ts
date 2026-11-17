import crypto from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";

const TOTP_PERIOD_SECONDS = 30;

function encryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new Error("MFA_ENCRYPTION_KEY must be configured as 32 bytes of hexadecimal");
  }
  return Buffer.from(configured, "hex");
}

export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptMfaSecret(value: string): string {
  const [encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra.length > 0) {
    throw new Error("Invalid encrypted MFA secret");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createTotpSecret(email: string) {
  const secret = generateSecret({ length: 20 });
  return { secret, uri: createTotpUri(email, secret) };
}

export function createTotpUri(email: string, secret: string) {
  return generateURI({
    issuer: "TOR Insight",
    label: email,
    secret,
    algorithm: "sha1",
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
  });
}

export async function verifyTotp(secret: string, token: string, afterTimeStep?: number) {
  if (!/^\d{6}$/.test(token)) return undefined;
  const epoch = Math.floor(Date.now() / 1000);
  const currentTimeStep = Math.floor(epoch / TOTP_PERIOD_SECONDS);
  if (afterTimeStep !== undefined && afterTimeStep >= currentTimeStep) return undefined;
  const result = await verify({
    secret,
    token,
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    epoch,
    epochTolerance: [30, 0],
    afterTimeStep,
  });
  return result.valid
    ? { timeStep: currentTimeStep + result.delta }
    : undefined;
}