/**
 * Outgoing requests to URLs that come from data (feeds, stored TOR links),
 * not from our own code. Without these checks a bad link could make the
 * server call itself, the database or a cloud metadata address (SSRF).
 *
 * Only HTTPS to the government procurement sites is allowed, and every
 * redirect is checked again, so an allowed site can't bounce us elsewhere.
 */
import { NonRetryableError } from "./http.js";

/** Sites we collect from. A subdomain matches only with a dot before it. */
const ALLOWED_HOSTS = ["egp2.bangkok.go.th", "gprocurement.go.th"];

const MAX_REDIRECTS = 3;

export class BlockedUrlError extends NonRetryableError {}

/**
 * The most we read from an outside site in one response (V5.2.1), so a huge
 * or endless file can't exhaust memory. PDFs use MAX_PDF_BYTES in genai.ts.
 */
export const DOWNLOAD_LIMITS = {
  /** BMA's yearly OCDS file. The largest so far (FY2568) is about 105 MB. */
  bmaYearFile: 250 * 1024 * 1024,
  /** One e-GP API response: a page of projects, announcements or details. */
  apiResponse: 5 * 1024 * 1024,
  /** National e-GP's RSS feed of the day's invitations. */
  feed: 5 * 1024 * 1024,
} as const;

/** A download over its size limit. Never retried: the file won't shrink. */
export class FileTooLargeError extends NonRetryableError {}

/** True for an https URL on an allowed government site, with no user, password or port. */
export function isAllowedSourceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * fetch() for a URL from data. Throws BlockedUrlError (never retried) for a
 * URL, or a redirect, that isn't on an allowed site.
 */
export async function safeFetch(value: string, init: RequestInit = {}): Promise<Response> {
  let url = value;
  for (let redirects = 0; ; redirects++) {
    if (!isAllowedSourceUrl(url)) {
      throw new BlockedUrlError(`Blocked request to a site we don't collect from: ${hostOf(url)}`);
    }
    const res = await fetch(url, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (redirects >= MAX_REDIRECTS) throw new BlockedUrlError("Too many redirects");
    url = new URL(location, url).href;
  }
}

/** Like readLimited, but throws FileTooLargeError when the body is over maxBytes. */
export async function readBody(res: Response, maxBytes: number, what = "Response"): Promise<Buffer> {
  const body = await readLimited(res, maxBytes);
  if (!body) {
    const limit = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024)} MB` : `${maxBytes} bytes`;
    throw new FileTooLargeError(`${what} is larger than ${limit}`);
  }
  return body;
}

/**
 * The response body, or undefined if it is larger than maxBytes. Stops
 * reading as soon as the limit is passed, so a huge file never fills memory.
 */
export async function readLimited(res: Response, maxBytes: number): Promise<Buffer | undefined> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) return undefined;
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function hostOf(value: string) {
  try {
    return new URL(value).host || "(none)";
  } catch {
    return "(invalid URL)";
  }
}