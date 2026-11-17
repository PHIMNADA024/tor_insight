import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../../src/services/passwordHash.js";

describe("full-length password hashing", () => {
  it("verifies at least 64-character Unicode passwords without bcrypt truncation", async () => {
    const password = "密碼🔐".repeat(24);
    expect([...password]).toHaveLength(72);
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash, "bcrypt_sha256")).toBe(true);
    expect(await verifyPassword(`${password}x`, hash, "bcrypt_sha256")).toBe(false);
  });

  it("continues to verify existing direct-bcrypt hashes during migration", async () => {
    const password = "legacy-correct-password";
    const legacyHash = await bcrypt.hash(password, 4);

    expect(await verifyPassword(password, legacyHash, "bcrypt")).toBe(true);
    expect(await verifyPassword("incorrect-password", legacyHash, "bcrypt")).toBe(false);
  });
});
