# Data Protection and Security Inventory

This document lists the sensitive data TOR Insight handles, how it is protected,
the cryptography in use, the external services the backend talks to and what is
logged.

## Sensitive data (V14.1.1)

| Data | Where | Protection level | How it is protected |
|---|---|---|---|
| Password | User | Secret | Never stored. Only a bcrypt hash (cost 12) of its SHA-256 is kept, in a field that queries don't return by default. |
| Email verification code (OTP) | User | Secret | Stored only as a salted bcrypt hash. Expires after 10 minutes and stops working after 5 wrong guesses. |
| Password reset token | User | Secret | Stored only as a SHA-256 hash, single use, expires after 30 minutes, compared in constant time. |
| TOTP (MFA) secret | User | Secret | Encrypted with AES-256-GCM using `MFA_ENCRYPTION_KEY`. Pending secrets expire after 10 minutes. |
| MFA login challenge | User | Secret | Stored as a SHA-256 hash, expires after 5 minutes, single use. |
| Access token (JWT) | Browser storage | Secret | HS256, valid 8 hours, revoked by `tokenVersion` on logout or password change, 30 minutes idle timeout. |
| Email address, name | User | Personal | Returned only to the user themselves and to admins. Not written to logs. |
| Saved search criteria, feedback | User, Feedback | Personal | Only visible to the user who owns them and to admins. |
| Notifications | Notification | Personal | Only visible to the owner. Deleted automatically after 90 days. |
| TOR data | Tor | Public | Collected from public government sources. |

### In the browser (V14.3.3)

Only the session token is kept in `localStorage` or `sessionStorage`. The user's
name, email and role are loaded from `GET /api/auth/me` and kept in memory. User
details stored by older versions are removed on the next page load.

### Caching (V14.2.2, V14.3.2)

Every API response is sent with `Cache-Control: no-store`, so browsers and
proxies never store personal data or tokens.

### Retention (V14.2.7)

| Collection | Deleted after |
|---|---|
| Notifications | 90 days |
| Sync logs | 180 days |
| Admin action log | 1 year |
| MFA setup and challenges, OTPs, reset tokens | When used or expired |

Deletion is done by MongoDB TTL indexes, so no scheduled job is needed.

## Cryptography (V11.1.2)

| Use | Algorithm |
|---|---|
| Password storage | SHA-256, then bcrypt (cost 12) |
| Email OTP storage | bcrypt (cost 10) |
| Reset tokens and MFA challenges | SHA-256 |
| Access tokens | JWT with HMAC-SHA256 (HS256 only, other algorithms rejected) |
| TOTP secrets at rest | AES-256-GCM |
| TOTP codes | RFC 6238, HMAC-SHA1, 6 digits, 30 seconds |
| Random values | Node's `crypto.randomBytes` and `crypto.randomInt` (CSPRNG) |
| Constant-time comparisons | `crypto.timingSafeEqual`, `bcrypt.compare` |
| Transport | TLS for MongoDB Atlas, Gmail SMTP and every external HTTPS call |

Keys: `JWT_SECRET` and `MFA_ENCRYPTION_KEY` (64 hex characters) live in
`backend/.env`, which is not committed. Changing `MFA_ENCRYPTION_KEY` makes
existing MFA secrets unreadable.

## External communication (V13.1.1)

| Service | Used for | Connection |
|---|---|---|
| MongoDB Atlas | Database | `mongodb+srv` with TLS |
| Gmail SMTP (nodemailer) | Verification, reset and notification emails | TLS |
| Google Vertex AI (Gemini) | TOR summaries | HTTPS |
| Have I Been Pwned (`api.pwnedpasswords.com`) | Checking new passwords against known breaches (k-anonymity, only 5 hash characters are sent) | HTTPS |
| BMA Open Contract (`opencontract.bangkok.go.th`) | TOR data | HTTPS |
| Bangkok e-GP (`egp2.bangkok.go.th`) | TOR data and documents | HTTPS, allowlisted in `safeFetch` |
| National e-GP (`*.gprocurement.go.th`) | TOR data and documents | HTTPS, allowlisted in `safeFetch` |

The browser only talks to the frontend and to the backend API. Users open
government sites themselves through links, after a warning that they are
leaving TOR Insight.

## Logging (V16.1.1, V16.2.5)

| What | Where |
|---|---|
| Admin actions (enable, disable, delete, password reset and session revocation for users; TOR edits and status changes; feedback status changes) | `AdminActionLog` collection: who, what, target and when |
| Data collection runs | `SyncLog` collection: source, status, counts and error |
| Unexpected errors | Server console (`console.error`) |

Passwords, tokens, OTPs and MFA secrets are never logged. Failed emails are
logged with the user's ID instead of their email address.
