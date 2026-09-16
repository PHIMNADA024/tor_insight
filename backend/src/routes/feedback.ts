import { Router } from "express";
import { Feedback } from "../models/feedback.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Submit feedback — general app feedback or a TOR-specific problem.
 * POST /api/feedback
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, description, torId, torReference } = req.body;

    if (!category || !description?.trim()) {
      return res.status(400).json({
        message: "Category and description are required",
      });
    }

    const feedback = await Feedback.create({
      userId: req.user!.id,
      category,
      description: description.trim(),
      torId: torId || undefined,
      torReference: torReference?.trim() || undefined,
    });

    return res.status(201).json({ message: "Feedback submitted", feedback });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to submit feedback" });
  }
});

/**
 * My submitted feedback, with status.
 * GET /api/feedback/mine
 */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const items = await Feedback.find({ userId: req.user!.id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ feedback: items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load feedback" });
  }
});

export default router;