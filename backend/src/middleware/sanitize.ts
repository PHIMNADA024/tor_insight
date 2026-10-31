import type { NextFunction, Request, Response } from "express";

/**
 * Copied by assignment, "__proto__" would set the result's prototype instead of
 * being a key, letting values through that the checks below never see.
 */
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function stripDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDangerousKeys);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("$") || key.includes(".") || PROTOTYPE_KEYS.has(key)) continue;
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
