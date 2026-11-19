import type { NextFunction, Request, Response } from "express";

/**
 * API answers carry personal data and tokens: never let browsers or proxies
 * store them (V14.2.2, V14.3.2).
 */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  next();
}
