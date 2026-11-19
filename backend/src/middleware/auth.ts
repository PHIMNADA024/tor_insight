import type { NextFunction, Request, Response } from "express";
import { User } from "../models/user.js";
import { verifyAccessToken } from "../services/token.js";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    let decoded: ReturnType<typeof verifyAccessToken>;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = await User.findById(decoded.id).select("+passwordChangedAt");

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (user.status === "disabled") {
      return res.status(403).json({ message: "This account has been disabled" });
    }

    if ((user.tokenVersion ?? 0) !== decoded.tokenVersion) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }

    const now = new Date();
    const lastActivity = user.lastActivityAt?.getTime() ?? decoded.iat * 1000;
    if (now.getTime() - lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      return res.status(401).json({ message: "Session expired due to inactivity" });
    }

    const activityUpdate = await User.updateOne(
      { _id: user._id, status: "active", tokenVersion: decoded.tokenVersion },
      { $set: { lastActivityAt: now } },
      { timestamps: false },
    );
    if (activityUpdate.matchedCount !== 1) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}
