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
