import express, { type RequestHandler, type Router } from "express";
import request from "supertest";

/**
 * The rate limiters, and that the routes that need them use them. Limiters
 * keep their counts in memory for the life of the module, so each test loads
 * a fresh copy.
 */

type Limiters = typeof import("../../src/middleware/rateLimit.js");

async function freshLimiters(): Promise<Limiters> {
  let limiters!: Limiters;
  await jest.isolateModulesAsync(async () => {
    limiters = await import("../../src/middleware/rateLimit.js");
  });
  return limiters;
}

async function freshRouter(path: string): Promise<Router> {
  let router!: Router;
  await jest.isolateModulesAsync(async () => {
    router = (await import(path)).default;
  });
  return router;
}

function appWith(limiter: RequestHandler) {
  const app = express();
  // Lets a test pretend to be a different client with X-Forwarded-For.
  app.set("trust proxy", true);
  app.get("/", limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

/** Sends `count` requests one after another and returns their statuses. */
async function hit(app: express.Express, count: number, ip = "203.0.113.1") {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    statuses.push((await request(app).get("/").set("X-Forwarded-For", ip)).status);
  }
  return statuses;
}

afterEach(() => {
  jest.useRealTimers();
});

describe("rate limiters", () => {
  it.each([
    ["searchLimiter", 60, "Too many requests, please slow down"],
    ["summaryLimiter", 20, "Too many requests, please slow down"],
    ["authLimiter", 10, "Too many attempts, please try again later"],
    ["otpLimiter", 5, "Too many attempts, please try again later"],
    ["generalLimiter", 300, "Too many requests, please try again later"],
  ] as const)("%s allows %i requests, then answers 429", async (name, limit, message) => {
    const app = appWith((await freshLimiters())[name]);

    const statuses = await hit(app, limit);
    const blocked = await request(app).get("/").set("X-Forwarded-For", "203.0.113.1");

    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message });
  });

  it("tells the client its limit and what's left in standard headers only", async () => {
    const app = appWith((await freshLimiters()).summaryLimiter);

    const res = await request(app).get("/").set("X-Forwarded-For", "203.0.113.1");

    expect(res.headers["ratelimit-limit"]).toBe("20");
    expect(res.headers["ratelimit-remaining"]).toBe("19");
    expect(res.headers["ratelimit-reset"]).toBeDefined();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("counts each client separately", async () => {
    const app = appWith((await freshLimiters()).otpLimiter);

    await hit(app, 5, "203.0.113.1");

    expect((await hit(app, 1, "203.0.113.1"))[0]).toBe(429);
    expect((await hit(app, 1, "198.51.100.7"))[0]).toBe(200);
  });

  it.each([
    ["searchLimiter", 60, 60 * 1000],
    ["otpLimiter", 5, 10 * 60 * 1000],
    ["authLimiter", 10, 15 * 60 * 1000],
  ] as const)("%s lets the client in again after its window", async (name, limit, windowMs) => {
    // Only the clock and the store's reset timer are faked; the HTTP stack needs real timers.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask", "setTimeout", "clearTimeout"] });
    const app = appWith((await freshLimiters())[name]);

    await hit(app, limit);
    expect((await hit(app, 1))[0]).toBe(429);

    jest.advanceTimersByTime(windowMs - 1000);
    expect((await hit(app, 1))[0]).toBe(429);

    jest.advanceTimersByTime(2000);
    expect((await hit(app, 1))[0]).toBe(200);
  });
});

describe("routes use their limiters", () => {
  it("limits AI summaries to 20 a minute", async () => {
    const app = express();
    app.use("/api/tors", await freshRouter("../../src/routes/tor.js"));

    // An invalid id is answered without the database, after the limiter.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await request(app).get("/api/tors/not-an-id/summary")).status);

    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("limits login attempts to 10 per 15 minutes", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", await freshRouter("../../src/routes/auth.js"));

    // A login without a password is answered without the database, after the limiter.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await request(app).post("/api/auth/login").send({ email: "a@example.com" })).status);
    }

    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
