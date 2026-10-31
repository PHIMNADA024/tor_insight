import express from "express";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";
import { sanitizeBody } from "../../src/middleware/sanitize.js";

/**
 * sanitizeBody strips MongoDB operator keys ($...) and dotted keys from
 * request bodies, so a body like {"email": {"$ne": null}} can't turn a
 * lookup into a query that matches everyone.
 */

/** Runs the middleware on a body and returns what the route would see. */
function sanitize(body: unknown) {
  const req = { body } as Request;
  const next = jest.fn() as NextFunction;
  sanitizeBody(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return req.body;
}

describe("sanitizeBody", () => {
  it("removes keys that start with $", () => {
    expect(sanitize({ email: "a@example.com", $where: "sleep(1000)" })).toEqual({ email: "a@example.com" });
  });

  it("removes operators nested inside a field", () => {
    expect(sanitize({ email: { $ne: null }, password: { $gt: "" } })).toEqual({ email: {}, password: {} });
  });

  it("removes dotted keys, which address nested fields in MongoDB", () => {
    expect(sanitize({ name: "สมชาย", "interestCriteria.agencies": ["x"], "role.0": "admin" })).toEqual({ name: "สมชาย" });
  });

  it("cleans objects inside arrays", () => {
    expect(sanitize({ items: [{ name: "a", $set: { role: "admin" } }, { name: "b" }] })).toEqual({
      items: [{ name: "a" }, { name: "b" }],
    });
  });

  it("cleans deeply nested objects", () => {
    expect(sanitize({ a: { b: { c: { $or: [], d: 1 } } } })).toEqual({ a: { b: { c: { d: 1 } } } });
  });

  it("keeps ordinary values as they are", () => {
    const body = {
      name: "บริษัท ตัวอย่าง จำกัด",
      count: 3,
      notifyByEmail: false,
      note: null,
      tags: ["cctv", "ซอฟต์แวร์"],
      price: "1,000.50 $",
      email: "user.name@example.com",
    };
    expect(sanitize(body)).toEqual(body);
  });

  it("leaves a body that isn't an object alone", () => {
    expect(sanitize("plain text")).toBe("plain text");
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("doesn't let __proto__ slip values in through the prototype", () => {
    const body = sanitize(JSON.parse('{"email": "a@example.com", "__proto__": {"role": "admin"}}'));

    expect(body.role).toBeUndefined();
    expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
  });

  it("doesn't pollute other objects through __proto__", () => {
    sanitize(JSON.parse('{"__proto__": {"polluted": true}}'));

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("cleans JSON bodies before they reach a route", async () => {
    const app = express();
    app.use(express.json());
    app.use(sanitizeBody);
    app.post("/echo", (req, res) => res.json(req.body));

    const res = await request(app)
      .post("/echo")
      .send({ email: { $ne: null }, password: "x", "profile.role": "admin" });

    expect(res.body).toEqual({ email: {}, password: "x" });
  });
});
