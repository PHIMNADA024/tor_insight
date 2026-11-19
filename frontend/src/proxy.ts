import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isDev = process.env.NODE_ENV === "development";

/**
 * Origins the browser may call with fetch. Pages fall back to localhost:4000
 * or localhost:5050 when NEXT_PUBLIC_API_URL is unset, so both are allowed then.
 */
const apiOrigins = process.env.NEXT_PUBLIC_API_URL
  ? [new URL(process.env.NEXT_PUBLIC_API_URL).origin]
  : ["http://localhost:4000", "http://localhost:5050"];

/**
 * Sec-Fetch-Dest values a page may be requested with: a navigation
 * ("document") or a fetch by the app itself ("empty"). A page loaded as a
 * script, stylesheet, image, frame or object is in the wrong context.
 */
const PAGE_DESTINATIONS = new Set(["document", "empty"]);

/**
 * HTTP to HTTPS redirect for pages (ASVS V4.1.2). People open the site in a
 * browser, so a page asked for over http is sent to the same URL on https.
 * The API does the opposite and refuses http (backend requireHttps), since a
 * redirect there would hide a client that sends credentials unencrypted.
 *
 * On in production unless HTTPS_REDIRECT=false, and never for localhost, so a
 * production build can still be tried locally over http.
 */
function httpsRedirectEnabled() {
  if (process.env.HTTPS_REDIRECT === "true") return true;
  if (process.env.HTTPS_REDIRECT === "false") return false;
  return process.env.NODE_ENV === "production";
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The https URL to send a plain-http request to, or null if none is needed.
 * Behind a proxy that terminates TLS the app itself is reached over http, so
 * the scheme and host the browser used come from the X-Forwarded-* headers.
 */
function httpsRedirectUrl(request: NextRequest): string | null {
  const firstValue = (name: string) => request.headers.get(name)?.split(",")[0]?.trim();
  const protocol = (firstValue("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "")).toLowerCase();
  if (protocol !== "http") return null;

  const host = firstValue("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (!hostname || LOOPBACK_HOSTS.has(hostname)) return null;

  return `https://${hostname}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** A per-response CSP (ASVS V3.4.3): scripts run only with this response's nonce. */
function contentSecurityPolicy(nonce: string) {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets Next.js's nonced scripts load its chunks. React
    // needs 'unsafe-eval' in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Components set style attributes (charts, colour dots), which a nonce
    // can't cover. Inline styles can't run script.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // next/font serves the font files from this site.
    "font-src 'self'",
    `connect-src 'self' ${apiOrigins.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Upgrading would break an http API on localhost, so only once the API is on https.
  if (!isDev && apiOrigins.every((origin) => origin.startsWith("https://"))) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  // No /.git, /.env or other dotfile path is ever served (ASVS V13.4.1).
  // /.well-known/ stays reachable for standard files such as ACME challenges.
  if (request.nextUrl.pathname.split("/").some((s) => s.startsWith(".") && s !== ".well-known")) {
    return new NextResponse(null, { status: 404 });
  }

  if (httpsRedirectEnabled()) {
    const secureUrl = httpsRedirectUrl(request);
    // 308 keeps the method and body, so a form posted over http isn't turned into a GET.
    if (secureUrl) return NextResponse.redirect(secureUrl, 308);
  }

  const destination = request.headers.get("sec-fetch-dest");
  if (destination && !PAGE_DESTINATIONS.has(destination)) {
    return new NextResponse(null, { status: 403 });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // Next.js reads the nonce from the request's CSP header and adds it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: static files, images and public assets don't run script.
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      // Prefetches return data for a page, not a page, so they skip the nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
