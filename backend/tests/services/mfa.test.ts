import { generate } from "otplib";
import {
  createTotpSecret,
  decryptMfaSecret,
  encryptMfaSecret,
  verifyTotp,
} from "../../src/services/mfa.js";

describe("TOTP MFA utilities", () => {
  it("encrypts authenticator secrets at rest and detects tampering", () => {
    const secret = createTotpSecret("person@example.test").secret;
    const encrypted = encryptMfaSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted)).toBe(secret);

    const [iv, tag, ciphertext] = encrypted.split(".");

    const flipFirstByte = (part: string) => {
      const bytes = Buffer.from(part, "base64url");
      bytes[0] ^= 0xff;
      return bytes.toString("base64url");
    };

    // Tampered ciphertext, auth tag, and IV must each fail authentication.
    expect(() => decryptMfaSecret([iv, tag, flipFirstByte(ciphertext)].join("."))).toThrow();
    expect(() => decryptMfaSecret([iv, flipFirstByte(tag), ciphertext].join("."))).toThrow();
    expect(() => decryptMfaSecret([flipFirstByte(iv), tag, ciphertext].join("."))).toThrow();
  });

  it("accepts a current TOTP time step once and prevents replay", async () => {
    const secret = createTotpSecret("person@example.test").secret;
    const code = await generate({ secret });
    const verified = await verifyTotp(secret, code);

    expect(verified).toBeDefined();
    expect(await verifyTotp(secret, code, verified!.timeStep)).toBeUndefined();
  });
});
