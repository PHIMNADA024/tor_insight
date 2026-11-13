# Dependency Management and Vulnerability Remediation

How TOR Insight keeps its third-party components inventoried, monitored and patched.

Covers ASVS 5.0 requirements V3.7.1, V15.1.1, V15.1.2 and V15.2.1.

## Component inventory (SBOM)

Each package has a CycloneDX 1.5 SBOM. It lists every installed component (runtime and dev) with its version, license and package URL.

| Package  | SBOM                                               | Regenerate                        |
| -------- | -------------------------------------------------- | --------------------------------- |
| Frontend | [`sbom/frontend.cdx.json`](../sbom/frontend.cdx.json) | `cd frontend && npm run sbom` |
| Backend  | [`sbom/backend.cdx.json`](../sbom/backend.cdx.json)   | `cd backend && npm run sbom`  |

- **Regenerate locally:** run `npm install` first. `npm sbom` describes the installed `node_modules` tree.
- **Commit with dependency changes:** regenerate the SBOM and commit it whenever `package-lock.json` changes.
- **CI copy:** the `SBOM (CycloneDX)` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) regenerates both files on every push and pull request and uploads them as the `sbom` build artifact. That artifact always matches the commit it was built from.

## Monitoring

| Control                 | What it does                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependabot alerts       | GitHub raises an alert when a published advisory affects a locked version.                                                                                  |
| Dependabot security updates | Opens a fix PR for an alert as soon as a patched version exists.                                                                                      |
| Dependabot version updates  | [`.github/dependabot.yml`](../.github/dependabot.yml) opens grouped minor and patch update PRs every Monday for `frontend`, `backend` and GitHub Actions. Major updates come as separate PRs. |
| CI audit gate           | `npm audit --omit=dev --audit-level=high` runs in both CI jobs. A pull request that ships a high or critical runtime vulnerability fails CI.              |

Dependabot alerts and security updates are repository settings. They must be turned on under **Settings → Code security** (Dependabot alerts and Dependabot security updates).

## Remediation deadlines

The clock starts when the advisory is published against a version we use. That is the date of the Dependabot alert or the `npm audit` finding. Severity is the advisory's CVSS rating.

| Severity | CVSS     | Fix deployed within |
| -------- | -------- | ------------------- |
| Critical | 9.0–10.0 | 7 days              |
| High     | 7.0–8.9  | 14 days             |
| Moderate | 4.0–6.9  | 30 days             |
| Low      | 0.1–3.9  | 90 days             |

Rules:

1. **Same deadline for dev dependencies.** Packages used only for testing, linting or building have the same deadlines. They run on developer machines and in CI, so they are still part of the supply chain.
2. **Preferred fix.** Upgrade to a patched version: merge the Dependabot PR or run `npm audit fix`.
3. **Breaking upgrade.** If the patch needs a breaking upgrade, do the upgrade and fix the code. Do not use `npm audit fix --force` blindly, because it can downgrade packages.
4. **Patch only in a transitive dependency.** Pin it with `overrides` in `package.json`, scoped to the parent package. Remove the override once the parent ships the fix.
5. **No patched version exists.** Replace or remove the component, or mitigate the issue. If none of these is practical, record an exception below with the reason and a review date. Review open exceptions at least every 30 days.
6. **Missed deadline.** Raise it at the next team meeting and record it as an exception.

### Handling a finding

1. Confirm the vulnerable range and whether the component reaches production (`npm ls <package>`).
2. Apply the fix on a `security/<name>` branch and run the full CI suite.
3. Regenerate the SBOM for the affected package.
4. Merge, then close the Dependabot alert, or confirm it closed itself.

## Supported client-side technology (V3.7.1)

The frontend uses only maintained versions:

- Next.js 16.4 (current major line)
- React 19.2
- Node.js 22 LTS for build and server rendering

It uses no plugins or deprecated browser technology.

When a framework major version reaches end of life, upgrading is treated as a High finding with a 14-day deadline.

## Open exceptions

| Advisory                                                                 | Component                  | Severity | Where                                   | Reason                                                                 | Review by  |
| ------------------------------------------------------------------------ | -------------------------- | -------- | --------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge 4.3.1 (prototype poisoning) | Low      | Dev only: `jest` → `jest-config` (frontend and backend) | No patched version is published. It only merges Jest's own config, which comes from this repository, not from user input. Not shipped to production. | 2026-12-13 |

## Remediation log

### 2026-11-13: initial clean-up

`npm audit` before: frontend 31 (1 critical, 5 high), backend 26 (1 critical, 4 high).

After: 0 runtime vulnerabilities in both packages. The only remaining finding is the low dev-only exception above.

| Package  | Component                       | From → To                  | Advisories fixed                                                     |
| -------- | ------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Frontend | next                            | 16.3.2 → 16.4.6            | Critical (affects 16.0.0–16.4.0)                                     |
| Frontend | eslint-config-next              | 16.3.2 → 16.4.6            | Kept in step with next                                               |
| Frontend | sharp (via next)                | 0.35.3 → 0.35.5            | High                                                                 |
| Frontend | zod, js-yaml, brace-expansion, source-map-js | patch updates   | High (dev tooling)                                                   |
| Frontend | typescript-eslint               | 8.67.0 → 8.72.2            | Moderate (minimatch, via override)                                   |
| Backend  | proxy-addr (via express)        | 2.0.7 → 2.0.8              | Critical: IP spoofing through IPv4-mapped IPv6 trusted subnet          |
| Backend  | nodemailer                      | 9.1.1 → 10.5.0 (major)     | High: 13 advisories, including address-parser recipient injection and SMTP DoS |
| Backend  | mongoose                        | 9.9.4 → 9.12.1             | High: prototype pollution, `sanitizeFilter` not applied               |
| Backend  | body-parser, follow-redirects   | 2.3.0 → 2.4.0, 1.16.1 → 1.16.3 | High                                                             |
| Backend  | qs, ip-address                  | 6.15.3 → 6.17.1, 10.7.0 → 10.7.6 | Moderate                                                       |
| Both     | glob, minimatch (via jest)      | 13.0.6 / 10.2.6 → 14.0.6 / 11.0.8 | Moderate. Pinned with scoped `overrides` because Jest 30.5.2 still requests the old ranges. |

Notes:

- **nodemailer 10:** the calls the backend makes still work unchanged, namely `createTransport({ service: "gmail" })` and `sendMail`.
- **Jest flag:** the MongoDB driver that ships with mongoose 9.12 loads `os` with a dynamic `import()`. The backend `npm test` script therefore runs Jest with `--experimental-vm-modules`. The reason is also recorded in `backend/jest.config.js`.
