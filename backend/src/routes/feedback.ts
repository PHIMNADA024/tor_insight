import { Router } from "express";
import { Feedback } from "../models/feedback.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const VALID_CATEGORIES = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
  "app_feedback",
  "other",
];

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TOR_REFERENCE_LENGTH = 200;

// Categories that describe a specific TOR problem should have
// something identifying which TOR, unlike general app feedback.
const CATEGORIES_REQUIRING_REFERENCE = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
];

const MAX_SUBMISSIONS_PER_DAY = 10;

/**
 * Submit feedback — general app feedback or a TOR-specific problem.
 * POST /api/feedback
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, description, torId, torReference } = req.body;

    // --- Required fields ---
    if (!category || typeof category !== "string") {
      return res.status(400).json({ message: "Category is required" });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "Description is required" });
    }

    const trimmedDescription = description.trim();

    // --- Description length ---
    if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
      });
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description must be under ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }

    // --- TOR reference required for TOR-specific categories ---
    const trimmedReference =
      typeof torReference === "string" ? torReference.trim() : "";

    if (
      CATEGORIES_REQUIRING_REFERENCE.includes(category) &&
      !torId &&
      !trimmedReference
    ) {
      return res.status(400).json({
        message: "Please specify which TOR this feedback relates to",
      });
    }

    if (trimmedReference.length > MAX_TOR_REFERENCE_LENGTH) {
      return res.status(400).json({
        message: `TOR reference must be under ${MAX_TOR_REFERENCE_LENGTH} characters`,
      });
    }

    // --- torId shape check, if provided ---
    if (torId && !/^[0-9a-fA-F]{24}$/.test(torId)) {
      return res.status(400).json({ message: "Invalid TOR id" });
    }

    // --- Rate limiting: prevent spam submissions ---
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await Feedback.countDocuments({
      userId: req.user!.id,
      createdAt: { $gte: oneDayAgo },
    });

    if (recentCount >= MAX_SUBMISSIONS_PER_DAY) {
      return res.status(429).json({
        message: "You've reached the daily feedback submission limit. Please try again tomorrow.",
      });
    }

    // --- Duplicate check: same user, same description, very recently ---
    const recentDuplicate = await Feedback.findOne({
      userId: req.user!.id,
      description: trimmedDescription,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // last 5 min
    });

    if (recentDuplicate) {
      return res.status(409).json({
        message: "You've already submitted this feedback recently",
      });
    }

    const feedback = await Feedback.create({
      userId: req.user!.id,
      category,
      description: trimmedDescription,
      torId: torId || undefined,
      torReference: trimmedReference || undefined,
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