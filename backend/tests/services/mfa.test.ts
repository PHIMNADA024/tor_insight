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
    expect(() => decryptMfaSecret(`${encrypted.slice(0, -1)}A`)).toThrow();
  });

  it("accepts a current TOTP time step once and prevents replay", async () => {
    const secret = createTotpSecret("person@example.test").secret;
    const code = await generate({ secret });
    const verified = await verifyTotp(secret, code);

    expect(verified).toBeDefined();
    expect(await verifyTotp(secret, code, verified!.timeStep)).toBeUndefined();
  });
});
