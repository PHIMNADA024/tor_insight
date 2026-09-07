import type { NextFunction, Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof Error && err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin not allowed" });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}
