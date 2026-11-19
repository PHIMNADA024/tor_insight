# Production Environment and Secret Management

How TOR Insight is run in production, where its secrets are kept, and what the server checks before it starts.

Covers ASVS 5.0 requirements V13.2.2, V13.3.1, V13.3.2, V13.4.1 and V13.4.2.

## Running in production (V13.4.2)

Production always runs the built apps, never the development servers.

| App | Build | Start | Mode |
| --- | --- | --- | --- |
| Backend | `npm run build` | `npm start` | `npm start` runs `dist/start.js`, which sets `NODE_ENV=production` unless the host already set it |
| Frontend | `npm run build` | `npm start` | `next start` always runs in production mode |

In production mode:

- **No developer tools:** the React development overlay and Next.js development tools are not loaded.
- **No browser source maps:** Next.js does not publish source maps unless `productionBrowserSourceMaps` is enabled, and it is not.
- **No internal details in errors:** errors return a generic message from the central error handler. Stack traces go only to the server log.
- **Secure cookies:** cookies are marked `Secure`.
- **Startup checks:** the server runs the checks below and refuses to start if any fails.

Never use `npm run dev` on a server.

## Startup checks

`backend/src/config/productionConfig.ts` runs when the server starts.

| Check | Production | Development |
| --- | --- | --- |
| `JWT_SECRET` is at least 32 characters and not the example value from `.env.example` | Refuses to start | Not checked |
| `MFA_ENCRYPTION_KEY` is 64 hexadecimal characters | Refuses to start | Not checked |
| `MONGODB_URI` is set | Refuses to start | Refuses to start |
| `FRONTEND_ORIGIN` (and `GOOGLE_REDIRECT_URI` when Google sign-in is configured) use `https://` | Refuses to start | Not checked |
| The database user holds only `read` or `readWrite` on the application's database | Refuses to start | Prints a warning |

The server prints the reason for every failed check. It never prints secret values.

## Least-privilege database access (V13.2.2)

The backend only reads and writes documents in its own database. The account it connects with must therefore hold only `readWrite` on that database.

A cluster-wide role such as `atlasAdmin`, `root` or `readWriteAnyDatabase` would let anyone who compromises the server read or delete every database on the cluster, and create new users.

> **Current state (2026-11-19):** the development connection uses an account with `atlasAdmin`, and the data is in the database named `test`, because the connection string names no database. Production must not use this account; the startup check refuses it.

### MongoDB Atlas

1. In Atlas, open **Database Access**, then choose **Add New Database User**.
2. Choose password authentication and generate a strong password.
3. Under **Database User Privileges**, choose **Specific Privileges**, then add the role `readWrite` on the application database (currently `test`). Add nothing else.
4. Optionally, under **Restrict Access to Specific Clusters**, select only the production cluster.
5. Put the new user in the production `MONGODB_URI`. Include the database name in the URI (for example `.../test?retryWrites=true`), so the app always uses the database the role was granted on.
6. In **Network Access**, allow only the production host's outbound IP addresses rather than `0.0.0.0/0` where the host provides fixed addresses.

Keep the `atlasAdmin` account for administration in the Atlas UI only, never in an application's environment.

### Self-hosted MongoDB

```js
// mongosh, connected as an administrator
use test
db.createUser({
  user: "tor_insight_app",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "test" }],
})
```

## Secret management (V13.3.1, V13.3.2)

### Where secrets live

| Secret | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs login tokens |
| `MFA_ENCRYPTION_KEY` | Encrypts users' TOTP secrets |
| `MONGODB_URI` | Database credentials |
| `EMAIL_PASSWORD` | Gmail App Password |
| `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `VERTEX_API_KEY` | Gemini |

- **Not in source code:** secrets are never stored in source code or build output. The backend reads them from environment variables at startup.
- **Production values:** stored only in the hosting platform's encrypted environment or secret settings.
- **Local development:** each developer has their own `backend/.env`. It is ignored by git and contains development values only.
- **No secrets in the frontend:** variables starting with `NEXT_PUBLIC_` are built into the JavaScript sent to browsers, so they must never hold a secret. The only one used is `NEXT_PUBLIC_API_URL`.

### Who can read them

- **Production secrets:** only the team members responsible for deployment can view or change them, through their own accounts on the hosting platform. Secrets are not shared in chat, email or documents.
- **Separate values per environment:** development and production use different values for every secret, including separate database users. A leaked development `.env` therefore gives no access to production.
- **Files on a server:** if a file is used, it must be readable only by the account that runs the app (`chmod 600 .env`).

### Keeping them out of git

- **Ignored files:** `.env` files are listed in `.gitignore`. `backend/.env.example` holds only placeholders and generation commands.
- **CI scan:** the `Secret scan (gitleaks)` CI job scans the full git history on every push and pull request, and fails if a password, key or token is found.
- **Last full scan:** 2026-11-19, 307 commits, no leaks found.

### If a secret leaks

Revoke it at its source first, then replace it in the hosting platform and redeploy.

- **`JWT_SECRET`:** changing it signs every user out.
- **`MONGODB_URI`:** change the database user's password in Atlas.
- **`EMAIL_PASSWORD`:** revoke the App Password in the Google account.
- **`GOOGLE_CLIENT_SECRET` and `VERTEX_API_KEY`:** rotate them in Google Cloud.
- **`MFA_ENCRYPTION_KEY`:** cannot simply be replaced. Existing TOTP secrets can only be decrypted with the old key, so users must set up MFA again after a change. Keep a backup of this key in the team's password manager.

A secret that was committed to git must be treated as leaked even after the commit is removed.

## Source control metadata is never served (V13.4.1)

- **Deploy built output:** deploy the built apps, or let the hosting platform build from the repository. Do not copy a working directory that contains `.git` into a web root.
- **Dotfile paths refused:** both apps refuse paths with a segment that starts with a dot. `/.git/config`, `/.env` and similar return `404` from the API (`backend/src/middleware/blockHiddenPaths.ts`) and from the frontend (`frontend/src/proxy.ts`). `/.well-known/` is still answered for standard uses such as ACME certificate challenges.
- **No repository files served:** neither app serves files from the repository. The API serves no static files, and Next.js serves only the `public/` folder and its build output.

Check after each deployment:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<frontend>/.git/config   # 404
curl -s -o /dev/null -w "%{http_code}\n" https://<api>/.git/HEAD          # 404
curl -s -o /dev/null -w "%{http_code}\n" https://<api>/.env               # 404
```
