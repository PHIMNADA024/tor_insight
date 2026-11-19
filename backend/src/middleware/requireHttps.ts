import type { NextFunction, Request, Response } from "express";

/**
 * Refuses API requests that arrived over plain HTTP (V4.1.2).
 *
 * The API is called by the frontend, not opened by people in a browser, so it
 * must not redirect to HTTPS: a redirect would hide a misconfigured client that
 * keeps sending passwords and tokens unencrypted, because every request would
 * still "work". Refusing makes the mistake visible straight away. Only the
 * frontend, which people do open in a browser, redirects (frontend/src/proxy.ts).
 *
 * Requests addressed to localhost are let through, as in the frontend's
 * redirect, so a production build can still be run and tried locally over
 * http. Real clients reach the API by its public host name, so they are still
 * held to HTTPS.
 *
 * Behind a proxy that terminates TLS, set TRUST_PROXY so that req.secure and
 * req.hostname are read from the proxy's X-Forwarded-* headers.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction) {
  if (req.secure || LOOPBACK_HOSTS.has(req.hostname.toLowerCase())) return next();
  return res.status(403).json({ message: "HTTPS is required" });
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** On in production unless REQUIRE_HTTPS=false; elsewhere only with REQUIRE_HTTPS=true. */
export function httpsRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.REQUIRE_HTTPS === "true") return true;
  if (env.REQUIRE_HTTPS === "false") return false;
  return env.NODE_ENV === "production";
}

/**
 * Express "trust proxy" from TRUST_PROXY: a number of proxy hops ("1"), or a
 * list of trusted addresses or names ("loopback, 10.0.0.0/8"). Undefined when
 * unset, so X-Forwarded-* headers are ignored unless a proxy is configured.
 */
export function trustProxySetting(value: string | undefined): number | string | undefined {
  if (!value?.trim()) return undefined;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
}
