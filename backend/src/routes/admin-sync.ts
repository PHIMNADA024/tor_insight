import { Router } from "express";
import { SyncLog } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { syncFiscalYear, currentFiscalYear } from "../services/bmaFetcher.js";

const router = Router();

/**
 * Download the current fiscal year's BMA data and sync it.
 * POST /api/admin/sync/bma
 */
router.post("/sync/bma", requireAuth, requireAdmin, async (req, res) => {
  try {
    const fiscalYear = req.body?.fiscalYear ?? currentFiscalYear();
    const result = await syncFiscalYear(fiscalYear, "manual");
    return res.json({ message: "Sync completed", ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Sync failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/sync/logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await SyncLog.find().sort({ startedAt: -1 }).limit(20);
    return res.json({ logs });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load sync logs" });
  }
});

export default router;