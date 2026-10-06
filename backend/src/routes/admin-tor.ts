import { Router } from "express";
import { Tor, Feedback } from "../models/index.js";
import { AdminActionLog } from "../models/adminActionLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

const EDITABLE_FIELDS = [
  "title",
  "description",
  "detailSummary",
  "agency",
  "category",
  "budgetAmount",
  "tenderAmount",
  "fiscalYear",
  "procurementMethod",
  "sourceUrl",
] as const;

const TOR_STATUSES = ["draft", "published", "archived"] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * List/search all TORs regardless of status.
 * GET /api/admin/tors?search=keyword&category=software&page=1&limit=20
 */
router.get("/tors", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category, search, status } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    if (typeof status === "string" && status && !TOR_STATUSES.includes(status as (typeof TOR_STATUSES)[number])) {
      return res.status(400).json({ message: "Invalid TOR status" });
    }

    const filter: Record<string, unknown> = {};

    if (typeof category === "string" && category) filter.category = category;
    if (typeof status === "string" && status) filter.status = status;
    if (typeof search === "string" && search.trim()) {
      const term = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: term, $options: "i" } },
        { agency: { $regex: term, $options: "i" } },
        { ocid: { $regex: term, $options: "i" } },
      ];
    }

    const [tors, total] = await Promise.all([
      Tor.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Tor.countDocuments(filter),
    ]);

    return res.json({
      tors,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load TORs" });
  }
});

/**
 * TORs that have at least one unresolved feedback report, with
 * the open feedback attached. This is the core of TOR Management.
 * GET /api/admin/tors/reported
 */
router.get("/tors/reported", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category, search, status } = req.query;

    if (typeof status === "string" && status && !TOR_STATUSES.includes(status as (typeof TOR_STATUSES)[number])) {
      return res.status(400).json({ message: "Invalid TOR status" });
    }

    const openFeedback = await Feedback.find({
      torId: { $exists: true, $ne: null },
      status: { $ne: "resolved" },
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    const torIds = [...new Set(openFeedback.map((f) => f.torId!.toString()))];
    const torFilter: Record<string, unknown> = { _id: { $in: torIds } };
    if (typeof category === "string" && category) torFilter.category = category;
    if (typeof status === "string" && status) torFilter.status = status;
    if (typeof search === "string" && search.trim()) {
      const term = escapeRegex(search.trim());
      torFilter.$or = [
        { title: { $regex: term, $options: "i" } },
        { agency: { $regex: term, $options: "i" } },
        { ocid: { $regex: term, $options: "i" } },
      ];
    }

    const tors = await Tor.find(torFilter);

    const results = tors.map((tor) => ({
      tor,
      feedback: openFeedback.filter(
        (f) => f.torId!.toString() === tor._id.toString(),
      ),
    }));

    return res.json({ results });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load reported TORs" });
  }
});

/**
 * Edit a TOR's fields directly, typically to fix a reported problem.
 * PUT /api/admin/tors/:id
 */
router.put("/tors/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tor = await Tor.findById(req.params.id);

    if (!tor) {
      return res.status(404).json({ message: "TOR not found" });
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const field of EDITABLE_FIELDS) {
      if (field in req.body && req.body[field] !== undefined) {
        const newValue = req.body[field];
        if (tor.get(field) !== newValue) {
          changes[field] = { from: tor.get(field), to: newValue };
          tor.set(field, newValue);
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ message: "No valid changes provided" });
    }

    await tor.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "tor.edit",
      targetType: "Tor",
      targetId: tor._id,
      metadata: changes,
    });

    return res.json({ message: "TOR updated", tor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update TOR" });
  }
});

/**
 * Republish an archived TOR.
 * POST /api/admin/tors/:id/publish
 */
router.post("/tors/:id/publish", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tor = await Tor.findById(req.params.id);

    if (!tor) {
      return res.status(404).json({ message: "TOR not found" });
    }

    const previousStatus = tor.status;
    tor.status = "published";
    await tor.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "tor.status_change",
      targetType: "Tor",
      targetId: tor._id,
      metadata: { from: previousStatus, to: "published" },
    });

    return res.json({ message: "TOR published", tor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to publish TOR" });
  }
});

/**
 * Archive a TOR — retires a listing, e.g. stale or confirmed invalid.
 * POST /api/admin/tors/:id/archive
 */
router.post("/tors/:id/archive", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tor = await Tor.findById(req.params.id);

    if (!tor) {
      return res.status(404).json({ message: "TOR not found" });
    }

    const previousStatus = tor.status;
    tor.status = "archived";
    await tor.save();

    await AdminActionLog.create({
      actorId: req.user!.id,
      action: "tor.status_change",
      targetType: "Tor",
      targetId: tor._id,
      metadata: { from: previousStatus, to: "archived" },
    });

    return res.json({ message: "TOR archived", tor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to archive TOR" });
  }
});

export default router;