import { Router } from "express";
import { Tor } from "../models/tor.js";
import { searchLimiter } from "../middleware/rateLimit.js";

const router = Router();

const SORT_VALUES = ["date", "budget", "relevance"] as const;
type SortValue = (typeof SORT_VALUES)[number];

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

    const hasKeyword = typeof keyword === "string" && keyword.trim() !== "";
    if (hasKeyword) {
      filter.$text = { $search: (keyword as string).trim() };
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

    const sortSpec: Record<string, unknown> =
      effectiveSort === "budget"
        ? { budgetAmount: -1 }
        : effectiveSort === "relevance" && hasKeyword
          ? { score: { $meta: "textScore" } }
          : { publishedDate: -1 };

    const projection: Record<string, unknown> = {
      title: 1,
      agency: 1,
      category: 1,
      budgetAmount: 1,
      fiscalYear: 1,
      publishedDate: 1,
    };
    if (hasKeyword) {
      projection.score = { $meta: "textScore" };
    }

    const [docs, total] = await Promise.all([
      Tor.find(filter, projection)
        .sort(sortSpec as never)
        .skip((page - 1) * limit)
        .limit(limit),
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

export default router;
