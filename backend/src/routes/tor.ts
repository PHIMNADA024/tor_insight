import { Router } from "express";
import mongoose from "mongoose";
import { Tor } from "../models/tor.js";
import { searchLimiter, summaryLimiter } from "../middleware/rateLimit.js";
import { getTorSummary } from "../services/torSummary.js";
import { GenAIUnavailableError } from "../services/genai.js";

const router = Router();

const SORT_VALUES = ["date", "budget", "relevance"] as const;
type SortValue = (typeof SORT_VALUES)[number];

/** Escapes user input so it's matched literally, not interpreted as a regex. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses a query param into a finite number, or undefined if absent/invalid. */
function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Search & filter TORs
 * GET /api/tors
 */
router.get("/", searchLimiter, async (req, res) => {
  try {
    const { keyword, agency, category, sort } = req.query;

    if (sort !== undefined && !SORT_VALUES.includes(sort as SortValue)) {
      return res.status(400).json({
        message: `sort must be one of: ${SORT_VALUES.join(", ")}`,
      });
    }

    const fiscalYear = parseNumber(req.query.fiscalYear);
    if (req.query.fiscalYear !== undefined && fiscalYear === undefined) {
      return res.status(400).json({ message: "fiscalYear must be a number" });
    }

    const budgetMin = parseNumber(req.query.budgetMin);
    if (req.query.budgetMin !== undefined && budgetMin === undefined) {
      return res.status(400).json({ message: "budgetMin must be a number" });
    }

    const budgetMax = parseNumber(req.query.budgetMax);
    if (req.query.budgetMax !== undefined && budgetMax === undefined) {
      return res.status(400).json({ message: "budgetMax must be a number" });
    }

    if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
      return res.status(400).json({ message: "budgetMin must not exceed budgetMax" });
    }

    const pageInput = parseNumber(req.query.page);
    if (req.query.page !== undefined && pageInput === undefined) {
      return res.status(400).json({ message: "page must be a number" });
    }
    const page = pageInput && pageInput >= 1 ? Math.floor(pageInput) : 1;

    const limitInput = parseNumber(req.query.limit);
    if (req.query.limit !== undefined && limitInput === undefined) {
      return res.status(400).json({ message: "limit must be a number" });
    }
    const limit = limitInput && limitInput >= 1 ? Math.floor(Math.min(limitInput, 100)) : 20;

    const filter: Record<string, unknown> = { status: "published" };

    // Substring match, not $text: MongoDB's text index splits on whitespace
    // and Thai has no spaces between words, so $text only matched whole titles.
    const hasKeyword = typeof keyword === "string" && keyword.trim() !== "";
    const keywordRegex = hasKeyword ? new RegExp(escapeRegex((keyword as string).trim()), "i") : null;
    if (keywordRegex) {
      filter.$or = [{ title: keywordRegex }, { description: keywordRegex }];
    }

    if (typeof agency === "string" && agency.trim() !== "") {
      filter.agency = agency.trim();
    }

    if (typeof category === "string" && category.trim() !== "") {
      filter.category = category.trim();
    }

    if (fiscalYear !== undefined) {
      filter.fiscalYear = fiscalYear;
    }

    if (budgetMin !== undefined || budgetMax !== undefined) {
      const budgetAmount: Record<string, number> = {};
      if (budgetMin !== undefined) budgetAmount.$gte = budgetMin;
      if (budgetMax !== undefined) budgetAmount.$lte = budgetMax;
      filter.budgetAmount = budgetAmount;
    }

    const effectiveSort: SortValue =
      (sort as SortValue) ?? (hasKeyword ? "relevance" : "date");

    // Relevance = title matches rank above description-only matches, newest first within each.
    // Whatever the sort, tenders open for bids come first, then upcoming ones.
    const sortSpec: Record<string, 1 | -1> = {
      biddingRank: 1,
      ...(effectiveSort === "budget"
        ? { budgetAmount: -1 }
        : effectiveSort === "relevance" && keywordRegex
          ? { titleMatch: -1, publishedDate: -1 }
          : { publishedDate: -1 }),
    };

    const now = new Date();
    const pipeline: mongoose.PipelineStage[] = [
      { $match: filter },
      {
        $addFields: {
          // 0 = open (deadline ahead, no winner), 1 = upcoming (draft TOR only), 2 = the rest.
          biddingRank: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gt: ["$submissionDeadline", now] },
                      { $eq: [{ $ifNull: ["$awardAnnouncedAt", null] }, null] },
                      { $eq: [{ $size: { $ifNull: ["$contracts", []] } }, 0] },
                    ],
                  },
                  then: 0,
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$biddingStage", "upcoming"] },
                      { $eq: [{ $ifNull: ["$submissionDeadline", null] }, null] },
                    ],
                  },
                  then: 1,
                },
              ],
              default: 2,
            },
          },
        },
      },
    ];
    if (keywordRegex && effectiveSort === "relevance") {
      pipeline.push({
        $addFields: {
          titleMatch: {
            $regexMatch: { input: "$title", regex: keywordRegex.source, options: "i" },
          },
        },
      });
    }
    pipeline.push(
      { $sort: sortSpec },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          title: 1,
          agency: 1,
          category: 1,
          budgetAmount: 1,
          fiscalYear: 1,
          publishedDate: 1,
          // For the bidding-status badge; the list doesn't need the contracts themselves.
          tenderStartDate: 1,
          submissionDeadline: 1,
          biddingStage: 1,
          // A signed contract (BMA) or an announced winner/cancellation (e-GP).
          hasWinner: {
            $or: [
              { $gt: [{ $size: { $ifNull: ["$contracts", []] } }, 0] },
              { $ne: [{ $ifNull: ["$awardAnnouncedAt", null] }, null] },
            ],
          },
        },
      },
    );

    const [docs, total] = await Promise.all([
      Tor.aggregate(pipeline),
      Tor.countDocuments(filter),
    ]);

    const results = docs.map((doc) => ({
      id: doc._id,
      title: doc.title,
      agency: doc.agency,
      category: doc.category,
      budgetAmount: doc.budgetAmount,
      fiscalYear: doc.fiscalYear,
      publishedDate: doc.publishedDate,
      tenderStartDate: doc.tenderStartDate,
      submissionDeadline: doc.submissionDeadline,
      biddingStage: doc.biddingStage,
      hasWinner: doc.hasWinner,
    }));

    return res.json({
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Search failed" });
  }
});

/**
 * Filter options for the search page, taken from what's actually published.
 * GET /api/tors/filters
 *
 * Declared before /:id so "filters" isn't parsed as a TOR id.
 */
router.get("/filters", searchLimiter, async (_req, res) => {
  try {
    const published = { status: "published" } as const;

    const [agencies, categories, fiscalYears] = await Promise.all([
      Tor.distinct("agency", published),
      Tor.distinct("category", published),
      Tor.distinct("fiscalYear", published),
    ]);

    return res.json({
      agencies: (agencies as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b, "th")),
      categories: (categories as string[]).filter((c) => c && c !== "uncategorized").sort(),
      fiscalYears: (fiscalYears as number[]).filter((y) => typeof y === "number").sort((a, b) => b - a),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load filter options" });
  }
});

/**
 * AI summary of a TOR, generated on first request and then served from the DB.
 * GET /api/tors/:id/summary
 */
router.get("/:id/summary", summaryLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid TOR id" });
    }

    const summary = await getTorSummary(String(id));
    if (!summary) {
      return res.status(404).json({ message: "TOR not found" });
    }

    return res.json(summary);
  } catch (error) {
    if (error instanceof GenAIUnavailableError) {
      return res.status(503).json({ message: "TOR summary is not available" });
    }
    console.error(error);
    return res.status(500).json({ message: "Failed to summarize TOR" });
  }
});

/**
 * Single TOR detail
 * GET /api/tors/:id
 *
 * Only published records are returned, same rule as search,
 * so a draft can't be read by guessing its id.
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid TOR id" });
    }

    const doc = await Tor.findOne({ _id: id, status: "published" });
    if (!doc) {
      return res.status(404).json({ message: "TOR not found" });
    }

    return res.json({
      id: doc._id,
      ocid: doc.ocid,
      title: doc.title,
      description: doc.description,
      agency: doc.agency,
      category: doc.category,
      fiscalYear: doc.fiscalYear,
      budgetAmount: doc.budgetAmount,
      tenderAmount: doc.tenderAmount,
      publishedDate: doc.publishedDate,
      tenderStartDate: doc.tenderStartDate,
      submissionDeadline: doc.submissionDeadline,
      awardAnnouncedAt: doc.awardAnnouncedAt,
      biddingStage: doc.biddingStage,
      procurementMethod: doc.procurementMethod,
      bidderQualifications: doc.bidderQualifications,
      sourceUrl: doc.sourceUrl,
      detailSummary: doc.detailSummary,
      items: doc.items ?? [],
      suppliers: doc.suppliers ?? [],
      awardAmount: doc.awardAmount ?? undefined,
      contractStatus: doc.contractStatus,
      contracts: doc.contracts ?? [],
      // When the agency last changed it, falling back to when we last synced it.
      lastUpdated: doc.sourceUpdatedAt ?? doc.updatedAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load TOR" });
  }
});

export default router;
