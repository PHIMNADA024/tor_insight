/**
 * Startup checks for a production deployment (ASVS V13.2.2, V13.3.1, V13.4.2).
 *
 * In production the server refuses to start when a check fails, so a missing
 * secret, a copied example value or an over-privileged database account is
 * caught at deploy time instead of in use. Elsewhere the same problems are only
 * printed as warnings, so local development keeps working.
 */
import type { Connection } from "mongoose";

/** The JWT_SECRET value in .env.example, which must never reach production. */
const EXAMPLE_JWT_SECRET = "some-long-random-string-at-least-32-chars-abc123xyz789";

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** Secrets and settings a production server needs. Returns one message per problem. */
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret === EXAMPLE_JWT_SECRET) {
    problems.push("JWT_SECRET is still the example value from .env.example");
  } else if (jwtSecret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters");
  }

  if (!/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY ?? "")) {
    problems.push("MFA_ENCRYPTION_KEY must be 64 hexadecimal characters (a random 32-byte key)");
  }

  if (!env.MONGODB_URI?.trim()) problems.push("MONGODB_URI is not set");

  const origins = (env.FRONTEND_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    problems.push("FRONTEND_ORIGIN must be set to the production frontend's https:// origin");
  } else if (origins.some((origin) => !origin.startsWith("https://"))) {
    problems.push("FRONTEND_ORIGIN must use https:// in production");
  }

  if (env.GOOGLE_CLIENT_ID && !(env.GOOGLE_REDIRECT_URI ?? "").startsWith("https://")) {
    problems.push("GOOGLE_REDIRECT_URI must use https:// in production");
  }

  return problems;
}

/** Roles the application account may hold, and only on the application's own database. */
const APP_ROLES = new Set(["read", "readWrite"]);

/**
 * Least privilege for the database account (V13.2.2): the server only reads and
 * writes its own database, so its account may hold nothing more than
 * readWrite on that database. Cluster-wide roles such as atlasAdmin, root or
 * readWriteAnyDatabase would let a compromised server read or destroy every
 * database on the cluster.
 */
export async function databasePrivilegeProblems(connection: Connection): Promise<string[]> {
  const db = connection.db;
  if (!db) return ["Not connected to the database"];

  const status = await db.admin().command({ connectionStatus: 1 });
  const users: unknown[] = status.authInfo?.authenticatedUsers ?? [];
  const roles: { role: string; db: string }[] = status.authInfo?.authenticatedUserRoles ?? [];

  if (users.length === 0) {
    return ["The database connection is not authenticated; connect with a dedicated database user"];
  }

  const appDb = db.databaseName;
  const extra = roles.filter((r) => !(APP_ROLES.has(r.role) && r.db === appDb));
  if (extra.length === 0) return [];
  return [
    `The database user has more privileges than the app needs: ${extra.map((r) => `${r.role}@${r.db}`).join(", ")}. ` +
      `Use a user with only readWrite on "${appDb}" (see docs/production-environment.md)`,
  ];
}

/** Prints the problems; in production, stops the server when there are any. */
export function enforce(problems: string[], what: string, env: NodeJS.ProcessEnv = process.env): void {
  if (problems.length === 0) return;
  const log = isProduction(env) ? console.error : console.warn;
  log(`${what}:`);
  for (const problem of problems) log(`  - ${problem}`);
  if (isProduction(env)) {
    throw new Error(`${what}: refusing to start in production`);
  }
}
