import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isEmailAddress(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isBoundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return typeof value === "string" &&
    value.trim().length >= minLength &&
    value.length <= maxLength;
}

export function isFiniteNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function parsePositiveInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : undefined;
}

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && mongoose.isValidObjectId(value);
}

/** Reject repeated or nested query values instead of silently ignoring them. */
export function rejectPollutedQuery(req: Request, res: Response, next: NextFunction) {
  if (Object.values(req.query).some((value) => typeof value !== "string")) {
    return res.status(400).json({ message: "กรุณาส่งค่าตัวกรองแต่ละรายการเพียงหนึ่งค่า" });
  }
  next();
}

/** API write payloads use JSON objects, never top-level arrays or primitives. */
export function rejectNonObjectJsonBody(req: Request, res: Response, next: NextFunction) {
  if (req.body !== undefined && !isRecord(req.body)) {
    return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
  }
  next();
}
