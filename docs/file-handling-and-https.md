# File Handling and HTTPS Deployment

How TOR Insight limits the files it downloads and how HTTPS is enforced in production.

Covers ASVS 5.0 requirements V5.2.1 and V4.1.2.

## Download size limits (V5.2.1)

TOR Insight never accepts file uploads from users. The only files it handles are ones the collectors download from government sites.

Every download is read through `readLimited` or `readBody` in [`backend/src/services/safeFetch.ts`](../backend/src/services/safeFetch.ts):

- **Declared size:** if the `Content-Length` header is already over the limit, nothing is read.
- **Actual size:** otherwise the body is read in chunks and reading stops as soon as the limit is passed. An oversized or endless file therefore never fills memory.

| Download | Limit | What happens when it is too large |
| --- | --- | --- |
| TOR, invitation and award PDFs (Bangkok e-GP, National e-GP, AI summaries) | 15 MB (`MAX_PDF_BYTES`, the Gemini inline limit) | The project is skipped and the reason is written to the sync log |
| Bangkok e-GP API responses (project lists, announcements, details) | 5 MB | A project's response: that project is skipped. A listing page: the sync run fails. Both are written to the sync log |
| National e-GP RSS feed | 5 MB | The sync run fails and is logged |
| BMA yearly OCDS file | 250 MB (the largest so far, FY2568, is about 105 MB) | The sync run for that year fails and is logged |

A download over its limit raises `FileTooLargeError`. This error is never retried, because downloading the same file again will not make it smaller.

## HTTPS deployment (V4.1.2)

Only the frontend redirects from HTTP to HTTPS, because only the frontend is opened by people in a browser. The API refuses plain HTTP instead of redirecting. If the API redirected, a misconfigured client could keep sending passwords and tokens unencrypted and every request would still appear to work. Refusing makes the mistake visible immediately.

| Part | Over HTTP in production | Code |
| --- | --- | --- |
| Frontend pages | `308 Permanent Redirect` to the same URL on `https://` | [`frontend/src/proxy.ts`](../frontend/src/proxy.ts) |
| API (`/api/*`) | `403 {"message":"HTTPS is required"}`, no redirect | [`backend/src/middleware/requireHttps.ts`](../backend/src/middleware/requireHttps.ts) |
| `/health` | Answered, so the host can run health checks over plain HTTP; it returns no data | [`backend/src/index.ts`](../backend/src/index.ts) |

Browsers that have already visited the site over HTTPS also receive `Strict-Transport-Security`, so later visits go straight to HTTPS without the redirect.

### Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `HTTPS_REDIRECT` | frontend | On when `NODE_ENV=production` | Set to `false` to serve a production build over plain HTTP, for example during a local security scan. `localhost` is never redirected. |
| `REQUIRE_HTTPS` | backend | On when `NODE_ENV=production` | `true` or `false` overrides the default. |
| `TRUST_PROXY` | backend | Unset | Number of proxy hops to trust, usually `1`, when a reverse proxy or load balancer terminates TLS. |

### Behind a reverse proxy

Most hosts terminate TLS at a proxy or load balancer and forward plain HTTP to the app. In that setup:

1. **Proxy headers:** the proxy must send `X-Forwarded-Proto` (and `X-Forwarded-Host` for the frontend). Both apps read the original scheme and host from these headers.
2. **Backend:** set `TRUST_PROXY=1`. Without it, Express ignores `X-Forwarded-Proto`, sees every request as HTTP and refuses all API calls. The backend prints a warning at startup when HTTPS is required but `TRUST_PROXY` is not set.
3. **HTTPS URLs:** set `FRONTEND_ORIGIN`, `NEXT_PUBLIC_API_URL` and `GOOGLE_REDIRECT_URI` to their `https://` addresses.
