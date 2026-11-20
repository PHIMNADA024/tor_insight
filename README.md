# TOR Insight

TOR Insight collects Terms of Reference (TOR) for Bangkok government software projects. It pulls them from BMA Open Contracting, Bangkok e-GP and National e-GP, and lets people search them, read AI summaries and get email alerts.

The repository has two apps:

| Folder      | What it is                         | Default URL             |
| ----------- | ---------------------------------- | ----------------------- |
| `backend/`  | Express REST API (TypeScript)      | http://localhost:4000   |
| `frontend/` | Next.js web app                    | http://localhost:3000   |

See [Use Case Diagram](docs/use-case-diagram.md) for the actors and what each of them can do, [ER Diagram](docs/er-diagram.md) for the database collections, and [Sequence Diagram](docs/sequence-diagram.md) for how a data sync fetches and saves TORs.

## Prerequisites

- **Node.js 24** and npm. CI tests the backend on Node 24. Node 22 runs both apps, but five backend test suites (the ones that use `otplib` for MFA) fail to load on it.
- **MongoDB**: either a local server or a MongoDB Atlas cluster. You need its connection string.
- **Gmail account with an App Password** for registration OTPs, password resets and alerts. Turn on 2-Step Verification, then create one under Google Account → Security → App passwords.
- **An authenticator app** (Google Authenticator, Microsoft Authenticator or similar). Every account must set up MFA at its first login.
- **Vertex AI API key** for Gemini (optional). Without it, AI summaries and PDF reading are turned off and the rest of the app still works.
- **Google OAuth client** (optional), only for "Sign in with Google".

## 1. Install dependencies

```bash
git clone https://github.com/PHIMNADA024/tor_insight.git
cd tor_insight

cd backend && npm ci && cd ..
cd frontend && npm ci && cd ..
```

## 2. Configure environment variables

Both apps read a `.env` file. `.env` files are git-ignored; never commit them.

### `backend/.env`

Copy the example, then fill it in:

```bash
cp backend/.env.example backend/.env
```

| Variable                    | Required | Description |
| --------------------------- | -------- | ----------- |
| `MONGODB_URI`               | Yes      | MongoDB connection string, e.g. `mongodb://localhost:27017/tor_insight` |
| `JWT_SECRET`                | Yes      | Secret for signing login tokens, at least 32 characters (see below) |
| `MFA_ENCRYPTION_KEY`        | Yes      | 64 hex characters (a random 32-byte key) used to encrypt users' MFA secrets (see below) |
| `EMAIL_USER`                | Yes      | Gmail address that sends the emails |
| `EMAIL_PASSWORD`            | Yes      | Gmail App Password (not your normal password) |
| `PORT`                      | No       | API port, default `4000` |
| `FRONTEND_ORIGIN`           | No       | Origin allowed by CORS, default `http://localhost:3000`. Separate several with commas. |
| `VERTEX_API_KEY`            | No       | Vertex AI key for Gemini summaries and PDF reading |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | OAuth client of type "Web application" for Sign in with Google |
| `GOOGLE_REDIRECT_URI`       | No       | Default `http://localhost:4000/api/auth/google/callback`. Add it to the client's Authorized redirect URIs. |
| `BMA_SYNC_ENABLED`          | No       | `true` to sync BMA Open Contracting daily (`BMA_SYNC_CRON`, default `0 2 * * *`) |
| `EGP_SYNC_ENABLED`          | No       | `true` to sync Bangkok e-GP daily (`EGP_SYNC_CRON`, default `15 6 * * *`) |
| `GPROCUREMENT_SYNC_ENABLED` | No       | `true` to sync National e-GP every 20 minutes, 08:00–18:00 on weekdays |
| `REQUIRE_HTTPS`             | No       | `true` or `false` to override whether the API refuses plain HTTP. Default: on in production. |
| `TRUST_PROXY`               | No       | Number of proxy hops to trust (usually `1`) when a reverse proxy terminates TLS |

Generate the two secrets and paste them into `backend/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # MFA_ENCRYPTION_KEY
```

Leave the `*_SYNC_ENABLED` flags as `false` on your machine if teammates share the same database. Turn each one on in one place only, or every running backend will sync the same data.

### `frontend/.env`

Create `frontend/.env` with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

| Variable              | Required | Description |
| --------------------- | -------- | ----------- |
| `NEXT_PUBLIC_API_URL` | Yes      | URL of the backend API, default `http://localhost:4000` |
| `HTTPS_REDIRECT`      | No       | `true` or `false` to override the HTTP to HTTPS page redirect. Default: on in production. |

## 3. Run in development

Open two terminals.

```bash
# Terminal 1: API, restarts on file changes
cd backend
npm run dev
```

```bash
# Terminal 2: web app
cd frontend
npm run dev
```

Open http://localhost:3000. The backend is ready when it prints `MongoDB connected` and `API listening on http://localhost:4000`. A health check is available at http://localhost:4000/health.

In development the backend only warns about unsafe settings (for example a database user with more than `readWrite`). In production the same problems stop it from starting.

## 4. Load TOR data

A new database is empty. Run a sync from the `backend/` folder to fill it:

```bash
cd backend
npx tsx src/scripts/runSync.ts          # BMA Open Contracting, current fiscal year
npx tsx src/scripts/runSync.ts egp      # Bangkok e-GP, invitations from the last 30 days
npx tsx src/scripts/runSync.ts gproc    # National e-GP, today's IT invitations
```

The e-GP syncs follow the source sites' crawl delay, so they can take 10 minutes or more. Reading PDFs needs `VERTEX_API_KEY`. Administrators can also start a sync from the **Admin → Sync** page.

## 5. Create an administrator

Every new account is a regular user. To make one an administrator:

1. Register through the web app and verify the email with the OTP.
2. Log in and set up MFA by scanning the QR code with your authenticator app.
3. Set the account's role in MongoDB, for example with `mongosh` or MongoDB Compass:

   ```js
   db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
   ```

4. Log out and log in again. The **Admin** menu now appears.

## 6. Run in production mode

```bash
cd backend
npm run build      # compiles TypeScript to dist/
npm start          # node dist/start.js, runs with NODE_ENV=production
```

```bash
cd frontend
npm run build      # Next.js production build
npm start          # serves on port 3000
```

In production the backend refuses to start if:

- `JWT_SECRET` is the example value or shorter than 32 characters;
- `MFA_ENCRYPTION_KEY` is not 64 hex characters;
- `FRONTEND_ORIGIN` (or `GOOGLE_REDIRECT_URI`, when Google sign-in is set up) is not `https://`;
- the database user has more than `read` or `readWrite` on the app's database.

The API also refuses plain-HTTP requests with 403, and the frontend redirects HTTP pages to HTTPS. Both make an exception for `localhost`, so a production build can be tried on your own machine. Set `NEXT_PUBLIC_API_URL` to the real API URL over HTTPS; it is built into the frontend, so rebuild after changing it.

See [Production Environment](docs/production-environment.md) for the database user and secret management, and [File Handling and HTTPS](docs/file-handling-and-https.md) for deploying behind a TLS proxy.

## 7. Run the tests

```bash
cd backend && npm test     # Jest + Supertest against an in-memory MongoDB
cd frontend && npm test    # Jest + Testing Library
cd frontend && npm run lint
```

Run the backend tests with `npm test`, not `npx jest`: the script adds the `--experimental-vm-modules` flag the MongoDB driver needs. The first run downloads a MongoDB binary, so it needs internet access and takes longer. No `.env` is needed for the tests.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `MONGODB_URI is not defined` or `MFA_ENCRYPTION_KEY must be configured` | `backend/.env` is missing or the value is empty. |
| `Production configuration is not safe` on `npm start` | Fix each setting listed after the message (see section 6). |
| `Database account check failed` on `npm start` | The database user has admin rights. Connect with a user that has only `readWrite` on the app's database. |
| Every API call returns `HTTPS is required` (403) | The API is behind a TLS proxy and `TRUST_PROXY` is not set, or it is being called over plain HTTP. |
| Browser shows a CORS error, or the API answers `Origin not allowed` | `FRONTEND_ORIGIN` in `backend/.env` does not match the URL in your address bar. |
| Registration fails or no OTP email arrives | Check `EMAIL_USER` and `EMAIL_PASSWORD`. The password must be a Gmail App Password. |
| Sign in with Google returns an error | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `GOOGLE_REDIRECT_URI` is missing or does not match the Google Cloud client. |
| AI summary answers `TOR summary is not available` (HTTP 503) | `VERTEX_API_KEY` is not set. |
| `npm ci` says the lock file is out of sync | Use npm 10 or later, and don't edit `package-lock.json` by hand. |
| Five backend test suites fail to load with an `otplib` error | You are on Node 22. Use Node 24. |
| National e-GP sync times out | The source site is often slow during the day. Try again in the evening. |

## Documentation

- [System Architecture](docs/system-architecture.md): application diagram and main data flows.
- [Use Case Diagram](docs/use-case-diagram.md), [ER Diagram](docs/er-diagram.md) and [Sequence Diagram](docs/sequence-diagram.md).
- [Dependency Management](docs/dependency-management.md): SBOMs, Dependabot setup and vulnerability remediation deadlines.
- [File Handling and HTTPS](docs/file-handling-and-https.md): download size limits and HTTPS deployment.
- [Production Environment](docs/production-environment.md): least-privilege database user, secret management and startup checks.
