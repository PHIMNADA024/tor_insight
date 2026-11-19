/**
 * Production entry point, run by `npm start` (ASVS V13.4.2).
 *
 * Sets NODE_ENV=production before the server loads, so the built server always
 * runs with production behaviour: startup checks that refuse unsafe secrets,
 * secure cookies and no development-only shortcuts. A host may still set
 * NODE_ENV itself. `npm run dev` runs src/index.ts directly and stays in
 * development mode.
 */
process.env.NODE_ENV ??= "production";

await import("./index.js");
