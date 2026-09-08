import type { NextFunction, Request, Response } from "express";

function stripDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      result[key] = stripDangerousKeys(val);
    }
    return result;
  }

  return value;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = stripDangerousKeys(req.body);
  }
  next();
}
