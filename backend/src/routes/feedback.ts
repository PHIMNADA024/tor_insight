import { Router } from "express";
import { Feedback, type FeedbackDoc } from "../models/feedback.js";
import { LockBusyError, withLock } from "../services/lock.js";
import { Tor } from "../models/tor.js";
import { Notification } from "../models/notification.js";
import { User } from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";
import { sendNewFeedbackAdminEmail } from "../services/email.js";

const router = Router();

const VALID_CATEGORIES = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
  "app_feedback",
  "other",
] as const;

function isFeedbackCategory(value: unknown): value is FeedbackDoc["category"] {
  return typeof value === "string" &&
    (VALID_CATEGORIES as readonly string[]).includes(value);
}

const CATEGORY_LABELS: Record<string, string> = {
  incorrect_info: "ข้อมูลไม่ถูกต้อง",
  outdated_info: "ข้อมูลล้าสมัย",
  broken_link: "ลิงก์ใช้งานไม่ได้",
  app_feedback: "ข้อเสนอแนะเกี่ยวกับแอป",
  other: "อื่นๆ",
};

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;

const CATEGORIES_REQUIRING_REFERENCE = [
  "incorrect_info",
  "outdated_info",
  "broken_link",
];

const MAX_SUBMISSIONS_PER_DAY = 10;

/**
 * Notify all admins, in-app and by email, that new feedback arrived.
 */
async function notifyAdminsOfNewFeedback(
  feedbackId: string,
  submitterName: string,
  category: string,
  description: string,
  torReference?: string,
) {
  const admins = await User.find({ role: "admin", status: "active" });

  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  await Notification.insertMany(
    admins.map((admin) => ({
      userId: admin._id,
      type: "new_feedback",
      title: "มีข้อเสนอแนะใหม่รอตรวจสอบ",
      message: `${submitterName} ส่งข้อเสนอแนะประเภท "${categoryLabel}"`,
      relatedId: feedbackId,
    })),
  );

  for (const admin of admins) {
    if (!admin.notifyByEmail) continue;

    sendNewFeedbackAdminEmail(
      admin.email,
      submitterName,
      categoryLabel,
      description,
      torReference,
    ).catch((error) => {
      console.error(`Failed to send new-feedback email to ${admin.email}:`, error);
    });
  }
}

/**
 * Submit feedback — general app feedback or a TOR-specific problem.
 * POST /api/feedback
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, description, torId } = req.body;

    // --- Required fields ---
    if (typeof category !== "string" || category.length === 0) {
      return res.status(400).json({ message: "Category is required" });
    }

    if (!isFeedbackCategory(category)) {
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
    
    const requiresTor = CATEGORIES_REQUIRING_REFERENCE.includes(category as (typeof CATEGORIES_REQUIRING_REFERENCE)[number]);

    if (requiresTor && !torId) {
      return res.status(400).json({
        message: "Please select the TOR this feedback relates to",
      });
    }

    if (torId !== undefined && (typeof torId !== "string" || !/^[0-9a-fA-F]{24}$/.test(torId))) {
      return res.status(400).json({ message: "Invalid TOR id" });
    }

    const linkedTor = typeof torId === "string"
      ? await Tor.findOne({ _id: torId, status: "published" }).select("title agency")
      : null;

    if (torId && !linkedTor) {
      return res.status(404).json({ message: "Selected TOR was not found or is not published" });
    }

    const torReference = linkedTor
      ? `${linkedTor.title} — ${linkedTor.agency}`
      : undefined;

    // --- Daily limit and duplicate check, then save (V15.4.2) ---
    // Run under a per-user lock, so the checks and the save are one step:
    // parallel requests can't all pass "fewer than 10 today" before any saves.
    const userId = req.user!.id;
    const result = await withLock(`feedback:${userId}`, async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await Feedback.countDocuments({
        userId,
        createdAt: { $gte: oneDayAgo },
      });

      if (recentCount >= MAX_SUBMISSIONS_PER_DAY) {
        return { status: 429, message: "You've reached the daily feedback submission limit. Please try again tomorrow." } as const;
      }

      // Same user, same description, very recently.
      const recentDuplicate = await Feedback.findOne({
        userId,
        description: trimmedDescription,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      });

      if (recentDuplicate) {
        return { status: 409, message: "You've already submitted this feedback recently" } as const;
      }

      const created = await Feedback.create({
        userId,
        category,
        description: trimmedDescription,
        torId: torId || undefined,
        torReference,
      });
      return { status: 201, feedback: created } as const;
    });

    if (result.status !== 201) {
      return res.status(result.status).json({ message: result.message });
    }
    const { feedback } = result;

    notifyAdminsOfNewFeedback(
      feedback._id.toString(),
      req.user!.name,
      category,
      trimmedDescription,
      torReference,
    ).catch((error) => {
      console.error("Failed to notify admins of new feedback:", error);
    });

    return res.status(201).json({ message: "Feedback submitted", feedback });
  } catch (error) {
    // Another submission from this user is being saved right now.
    if (error instanceof LockBusyError) {
      return res.status(429).json({ message: "Your previous feedback is still being saved. Please try again." });
    }
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