import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

export function signAccessToken(payload: { id: string; role: string; tokenVersion?: number }) {
  return jwt.sign({ ...payload, tokenVersion: payload.tokenVersion ?? 0, purpose: "access" }, JWT_SECRET!, {
    algorithm: "HS256",
    expiresIn: "8h",
  });
}

export function verifyAccessToken(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] });
  if (typeof decoded === "string" ||
    typeof decoded.id !== "string" ||
    typeof decoded.role !== "string" ||
    decoded.purpose !== "access" ||
    !Number.isInteger(decoded.tokenVersion) ||
    typeof decoded.iat !== "number") {
    throw new Error("Invalid access token claims");
  }
  return decoded as jwt.JwtPayload & { id: string; role: string; tokenVersion: number; iat: number };
}

export function signMfaSetupToken(payload: { id: string; tokenVersion: number }) {
  return jwt.sign({ ...payload, purpose: "mfa_setup" }, JWT_SECRET!, {
    algorithm: "HS256",
    expiresIn: "10m",
  });
}

export function verifyMfaSetupToken(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] });
  if (typeof decoded === "string" ||
    typeof decoded.id !== "string" ||
    decoded.purpose !== "mfa_setup" ||
    !Number.isInteger(decoded.tokenVersion)) {
    throw new Error("Invalid MFA setup token");
  }
  return decoded as jwt.JwtPayload & { id: string; tokenVersion: number };
}