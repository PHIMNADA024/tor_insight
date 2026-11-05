import express, { type Router } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Feedback, SyncLog, Tor } from "../../src/models/index.js";
import { Notification } from "../../src/models/notification.js";
import { User } from "../../src/models/user.js";
import adminFeedbackRoutes from "../../src/routes/admin-feedback.js";
import adminSyncRoutes from "../../src/routes/admin-sync.js";
import adminTorRoutes from "../../src/routes/admin-tor.js";
import adminUserRoutes from "../../src/routes/admin-users.js";
import { syncFiscalYear, syncRecentFiscalYears } from "../../src/services/bmaFetcher.js";
import { runEgpSync } from "../../src/services/egpFetcher.js";
import { sendAccountDisabledEmail, sendFeedbackResolvedEmail } from "../../src/services/email.js";
import { runGprocurementSync } from "../../src/services/gprocurementFetcher.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

/**
 * Every /api/admin route is admin-only. The routes are read from the routers
 * rather than listed here, so a new route that forgets requireAuth or
 * requireAdmin fails these tests without anyone having to add it.
 */

jest.mock("../../src/services/email.js", () => ({
  sendFeedbackResolvedEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountDisabledEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/bmaFetcher.js", () => ({
  syncFiscalYear: jest.fn().mockResolvedValue({}),
  syncRecentFiscalYears: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../src/services/egpFetcher.js", () => ({
  runEgpSync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/gprocurementFetcher.js", () => ({
  runGprocurementSync: jest.fn().mockResolvedValue(undefined),
}));

const ADMIN_ROUTERS = [adminTorRoutes, adminSyncRoutes, adminFeedbackRoutes, adminUserRoutes];

const app = express();
app.use(express.json());
// Same mount point as index.ts, which can't be imported because it starts the server.
ADMIN_ROUTERS.forEach((router) => app.use("/api/admin", router));

type Method = "get" | "post" | "put" | "patch" | "delete";
type Route = { method: Method; path: string };

/** Every route the admin routers declare. */
function adminRoutes(routers: Router[]) {
  return routers.flatMap((router) =>
    (router.stack as unknown as { route?: { path: string; methods: Record<string, boolean> } }[]).flatMap(
      ({ route }) =>
        route
          ? Object.keys(route.methods).map((method) => ({ method: method as Method, path: route.path }))
          : [],
    ),
  );
}

const ROUTES = adminRoutes(ADMIN_ROUTERS);
const WRITE_ROUTES = ROUTES.filter((route) => route.method !== "get");

const asTable = (routes: Route[]) => routes.map((route): [string, Route] => [`${route.method.toUpperCase()} ${route.path}`, route]);

const secret = process.env.JWT_SECRET!;

let admin: InstanceType<typeof User>;
let endUser: InstanceType<typeof User>;
let disabledAdmin: InstanceType<typeof User>;
let deletedAdminId: string;
let passwordChangedAdmin: InstanceType<typeof User>;
let activeTarget: InstanceType<typeof User>;
let disabledTarget: InstanceType<typeof User>;
let publishedTor: InstanceType<typeof Tor>;
let draftTor: InstanceType<typeof Tor>;
let feedback: InstanceType<typeof Feedback>;

function createUser(options: { role?: "end_user" | "admin"; status?: "active" | "disabled"; passwordChangedAt?: Date } = {}) {
  return User.create({
    name: "Access Control User",
    email: `${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: "not-used-here",
    role: options.role ?? "end_user",
    status: options.status ?? "active",
    isEmailVerified: true,
    passwordChangedAt: options.passwordChangedAt,
  });
}

function tokenFor(user: { _id: mongoose.Types.ObjectId; role: string }) {
  return signAccessToken({ id: user._id.toString(), role: user.role });
}

const adminClaims = () => ({ id: admin._id.toString(), role: "admin" });

/** An unsigned token: base64url header and claims, with an empty signature. */
function unsignedToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(adminClaims())}.`;
}

/** The Authorization header for each kind of caller that must be turned away. */
const REJECTED: [string, number, string, () => string | undefined][] = [
  ["no token", 401, "Authentication required", () => undefined],
  ["a token that isn't a JWT", 401, "Invalid or expired token", () => "Bearer not-a-jwt"],
  ["a token signed with another secret", 401, "Invalid or expired token", () => `Bearer ${jwt.sign(adminClaims(), "another-secret")}`],
  ["an unsigned token", 401, "Invalid or expired token", () => `Bearer ${unsignedToken()}`],
  ["an expired admin token", 401, "Invalid or expired token", () => `Bearer ${jwt.sign(adminClaims(), secret, { expiresIn: -10 })}`],
  ["an admin token in the wrong scheme", 401, "Authentication required", () => `Basic ${tokenFor(admin)}`],
  ["the token of a deleted admin", 401, "Invalid or expired token", () => `Bearer ${signAccessToken({ id: deletedAdminId, role: "admin" })}`],
  [
    "an admin token from before a password change",
    401,
    "Session expired, please log in again",
    () =>
      `Bearer ${jwt.sign(
        { id: passwordChangedAdmin._id.toString(), role: "admin", iat: Math.floor(Date.now() / 1000) - 60 },
        secret,
      )}`,
  ],
  ["a standard user", 403, "Admin access required", () => `Bearer ${tokenFor(endUser)}`],
  [
    "a standard user whose token claims to be admin",
    403,
    "Admin access required",
    () => `Bearer ${signAccessToken({ id: endUser._id.toString(), role: "admin" })}`,
  ],
  ["a disabled admin", 403, "This account has been disabled", () => `Bearer ${tokenFor(disabledAdmin)}`],
];

/** A real request for a route, aimed at seeded records that the action would actually change. */
function send({ method, path }: Route, authorization?: string) {
  const target = (): string => {
    if (path.startsWith("/tors")) return (path.endsWith("/publish") ? draftTor : publishedTor)._id.toString();
    if (path.startsWith("/feedback")) return feedback._id.toString();
    if (path.startsWith("/users")) return (path.endsWith("/enable") ? disabledTarget : activeTarget)._id.toString();
    return new mongoose.Types.ObjectId().toString();
  };
  const url = `/api/admin${path.replace(":source", "egp").replace(/:\w+/, target)}`;

  const req = request(app)[method](url);
  if (authorization) req.set("Authorization", authorization);
  if (path.startsWith("/tors/:id") && method === "put") return req.send({ title: "Changed title" });
  if (path.startsWith("/feedback/:id")) return req.send({ status: "resolved", adminResponse: "Changed response" });
  return req;
}

/** Everything in the database, to compare before and after a request. */
async function databaseContents() {
  const models = [User, Tor, Feedback, AdminActionLog, Notification, SyncLog] as mongoose.Model<unknown>[];
  return Promise.all(models.map((model) => model.find().select("+passwordChangedAt").sort({ _id: 1 }).lean()));
}

const SIDE_EFFECTS = [
  sendAccountDisabledEmail,
  sendFeedbackResolvedEmail,
  syncFiscalYear,
  syncRecentFiscalYears,
  runEgpSync,
  runGprocurementSync,
] as jest.Mock[];

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  SIDE_EFFECTS.forEach((mock) => mock.mockClear());

  admin = await createUser({ role: "admin" });
  endUser = await createUser();
  disabledAdmin = await createUser({ role: "admin", status: "disabled" });
  passwordChangedAdmin = await createUser({ role: "admin", passwordChangedAt: new Date() });
  activeTarget = await createUser();
  disabledTarget = await createUser({ status: "disabled" });

  const deletedAdmin = await createUser({ role: "admin" });
  deletedAdminId = deletedAdmin._id.toString();
  await deletedAdmin.deleteOne();

  publishedTor = await Tor.create({ ocid: "published", title: "Published TOR", agency: "Agency", status: "published" });
  draftTor = await Tor.create({ ocid: "draft", title: "Draft TOR", agency: "Agency", status: "draft" });
  feedback = await Feedback.create({
    userId: endUser._id,
    torId: publishedTor._id,
    category: "incorrect_info",
    description: "The budget looks wrong",
    status: "pending",
  });
});

describe("admin access control", () => {
  it("finds every admin route in all four routers", () => {
    expect(ROUTES).toEqual(
      expect.arrayContaining([
        { method: "get", path: "/tors" },
        { method: "get", path: "/tors/stats" },
        { method: "get", path: "/tors/reported" },
        { method: "put", path: "/tors/:id" },
        { method: "post", path: "/tors/:id/publish" },
        { method: "post", path: "/tors/:id/archive" },
        { method: "get", path: "/sync-logs" },
        { method: "get", path: "/sync-logs/latest" },
        { method: "post", path: "/sync/bma" },
        { method: "post", path: "/sync/:source" },
        { method: "get", path: "/feedback" },
        { method: "patch", path: "/feedback/:id" },
        { method: "get", path: "/users" },
        { method: "patch", path: "/users/:id/disable" },
        { method: "patch", path: "/users/:id/enable" },
        { method: "delete", path: "/users/:id" },
      ]),
    );
  });

  describe.each(asTable(ROUTES))("%s", (_name, route) => {
    it.each(REJECTED)("rejects %s", async (_caller, status, message, authorization) => {
      const res = await send(route, authorization());

      expect(res.status).toBe(status);
      // Only the reason comes back, never any of the route's data.
      expect(res.body).toEqual({ message });
    });

    it("lets an admin through", async () => {
      const res = await send(route, `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBeLessThan(300);
    });
  });

  describe.each(asTable(WRITE_ROUTES))("%s, when rejected", (_name, route) => {
    it.each(REJECTED)("changes nothing and starts nothing for %s", async (_caller, _status, _message, authorization) => {
      const before = await databaseContents();

      const res = await send(route, authorization());

      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(await databaseContents()).toEqual(before);
      SIDE_EFFECTS.forEach((mock) => expect(mock).not.toHaveBeenCalled());
    });
  });

  // Without these, "changes nothing" could pass only because the requests above do nothing at all.
  describe("the same requests from an admin", () => {
    it.each(
      asTable(WRITE_ROUTES.filter((route) => !route.path.startsWith("/sync"))),
    )("%s changes the database", async (_name, route) => {
      const before = await databaseContents();

      const res = await send(route, `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBeLessThan(300);
      expect(await databaseContents()).not.toEqual(before);
    });

    it("POST /sync/bma starts a sync", async () => {
      const res = await send({ method: "post", path: "/sync/bma" }, `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      expect(syncRecentFiscalYears).toHaveBeenCalledWith("manual");
    });

    it("POST /sync/:source starts a sync", async () => {
      const res = await send({ method: "post", path: "/sync/:source" }, `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(202);
      expect(runEgpSync).toHaveBeenCalledWith("recent", "manual");
    });
  });

  describe("where the role comes from", () => {
    const LIST_USERS: Route = { method: "get", path: "/users" };

    it("trusts the database over the token, so a promoted user is admin straight away", async () => {
      const promoted = await createUser({ role: "admin" });
      const token = signAccessToken({ id: promoted._id.toString(), role: "end_user" });

      const res = await send(LIST_USERS, `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it("stops an old admin token as soon as the account is demoted", async () => {
      const token = tokenFor(admin);
      await User.updateOne({ _id: admin._id }, { role: "end_user" });

      const res = await send(LIST_USERS, `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("stops an old admin token as soon as the account is disabled", async () => {
      const token = tokenFor(admin);
      await User.updateOne({ _id: admin._id }, { status: "disabled" });

      const res = await send(LIST_USERS, `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

});
