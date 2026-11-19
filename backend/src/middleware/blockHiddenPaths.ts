import type { NextFunction, Request, Response } from "express";

/**
 * 404 for any path with a segment starting with "." such as /.git/config or
 * /.env (ASVS V13.4.1). The API serves no files, so this should never match a
 * real route; it makes sure that source-control metadata or an env file can't
 * be read through the server even if one ends up on the host. /.well-known/ is
 * left alone because it is the standard place for things like ACME challenges.
 */
export function blockHiddenPaths(req: Request, res: Response, next: NextFunction) {
  const segments = req.path.split("/");
  if (segments.some((segment) => segment.startsWith(".") && segment !== ".well-known")) {
    return res.status(404).json({ message: "Not found" });
  }
  next();
}
