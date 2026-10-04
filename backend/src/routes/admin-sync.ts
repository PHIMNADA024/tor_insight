import { Router } from "express";
import { SyncLog } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

const STATUS_VALUES = ["in_progress", "success", "failed"] as const;

/** Parses a query param into a positive integer, or undefined if absent/invalid. */
function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** Shapes a SyncLog document for the dashboard, adding run duration. */
function toResponse(doc: any) {
  const durationMs =
    doc.finishedAt && doc.startedAt
      ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime()
      : null;

  return {
    id: doc._id,
    sourceId: doc.sourceId,
    status: doc.status,
    trigger: doc.trigger,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt ?? null,
    durationMs,
    recordsRead: doc.recordsRead,
    recordsInserted: doc.recordsInserted,
    recordsUpdated: doc.recordsUpdated,
    recordsSkipped: doc.recordsSkipped,
    errorMessage: doc.errorMessage ?? null,
  };
}

/**
 * Execution history of data collection runs, newest first (FR-23, UC-09).
 * GET /api/admin/sync-logs?sourceId=bma&status=failed&page=1&limit=20
 */
router.get("/sync-logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sourceId, status } = req.query;

    if (status !== undefined && !STATUS_VALUES.includes(status as never)) {
      return res.status(400).json({
        message: `status must be one of: ${STATUS_VALUES.join(", ")}`,
      });
    }

    if (req.query.page !== undefined && parsePositiveInt(req.query.page) === undefined) {
      return res.status(400).json({ message: "page must be a positive integer" });
    }
    if (req.query.limit !== undefined && parsePositiveInt(req.query.limit) === undefined) {
      return res.status(400).json({ message: "limit must be a positive integer" });
    }

    const page = parsePositiveInt(req.query.page) ?? 1;
    const limit = Math.min(parsePositiveInt(req.query.limit) ?? 20, 100);

    const filter: Record<string, unknown> = {};
    if (typeof sourceId === "string" && sourceId.trim() !== "") filter.sourceId = sourceId.trim();
    if (typeof status === "string") filter.status = status;

    const [docs, total] = await Promise.all([
      SyncLog.find(filter)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SyncLog.countDocuments(filter),
    ]);

    return res.json({
      results: docs.map(toResponse),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load sync logs" });
  }
});

/**
 * Latest run per data source, for the dashboard's status cards
 * ("last run" timestamp and whether it succeeded).
 * GET /api/admin/sync-logs/latest
 */
router.get("/sync-logs/latest", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const latest = await SyncLog.aggregate([
      { $sort: { startedAt: -1 } },
      { $group: { _id: "$sourceId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { sourceId: 1 } },
    ]);

    return res.json({ results: latest.map(toResponse) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load latest sync runs" });
  }
});

export default router;