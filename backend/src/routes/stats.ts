import { Router, type Request } from "express";
import { Tor } from "../models/tor.js";

const router = Router();

/**
 * Turns ?agency=&fiscalYear= into a $match on published TORs (same rule as search).
 * Returns an error message instead when fiscalYear isn't a whole number.
 */
function buildMatch(query: Request["query"]): { match: Record<string, unknown> } | { error: string } {
  const match: Record<string, unknown> = { status: "published" };

  const { agency } = query;
  if (typeof agency === "string" && agency.trim() !== "") {
    match.agency = agency.trim();
  }

  // Blank means "all years" (what an empty dropdown sends), not year 0.
  const fiscalYearParam = query.fiscalYear;
  if (fiscalYearParam !== undefined && !(typeof fiscalYearParam === "string" && fiscalYearParam.trim() === "")) {
    const fiscalYear = Number(fiscalYearParam);
    if (typeof fiscalYearParam !== "string" || !Number.isInteger(fiscalYear)) {
      return { error: "fiscalYear must be a whole number" };
    }
    match.fiscalYear = fiscalYear;
  }

  return { match };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Summary figures for the price dashboard (FR-06).
 * GET /api/stats/summary?agency=&fiscalYear=
 *
 * TORs without a budget still count toward torCount but are left out of the average.
 */
router.get("/summary", async (req, res) => {
  try {
    const built = buildMatch(req.query);
    if ("error" in built) {
      return res.status(400).json({ message: built.error });
    }

    const [summary] = await Tor.aggregate([
      { $match: built.match },
      {
        $group: {
          _id: null,
          totalBudget: { $sum: "$budgetAmount" },
          averageBudget: { $avg: "$budgetAmount" },
          torCount: { $sum: 1 },
          agencies: { $addToSet: "$agency" },
        },
      },
    ]);

    // No matching TORs: $group emits nothing, so report zeros rather than an error.
    return res.json({
      totalBudget: summary?.totalBudget ?? 0,
      averageBudget: summary?.averageBudget ? round2(summary.averageBudget) : 0,
      torCount: summary?.torCount ?? 0,
      agencyCount: summary?.agencies.length ?? 0,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load budget summary" });
  }
});

type BreakdownRow = { _id: string | number | null; totalBudget: number; torCount: number };

/**
 * Budget broken down by agency, category, and fiscal year (FR-06).
 * GET /api/stats/breakdown?agency=&fiscalYear=
 *
 * `share` is each row's percentage of the filtered total budget, for the donut charts.
 * Agencies and categories are sorted by budget (largest first); fiscal years oldest first.
 */
router.get("/breakdown", async (req, res) => {
  try {
    const built = buildMatch(req.query);
    if ("error" in built) {
      return res.status(400).json({ message: built.error });
    }

    const groupBy = (field: string) => ({
      $group: {
        _id: `$${field}`,
        totalBudget: { $sum: "$budgetAmount" },
        torCount: { $sum: 1 },
      },
    });

    const [facets] = await Tor.aggregate<{
      byAgency: BreakdownRow[];
      byCategory: BreakdownRow[];
      byFiscalYear: BreakdownRow[];
    }>([
      { $match: built.match },
      {
        $facet: {
          byAgency: [groupBy("agency"), { $sort: { totalBudget: -1 } }],
          byCategory: [groupBy("category"), { $sort: { totalBudget: -1 } }],
          byFiscalYear: [groupBy("fiscalYear"), { $sort: { _id: 1 } }],
        },
      },
    ]);

    const overallBudget = facets.byAgency.reduce((sum, row) => sum + row.totalBudget, 0);
    const toRows = <K extends string>(rows: BreakdownRow[], key: K) =>
      rows.map((row) => ({
        [key]: row._id,
        totalBudget: row.totalBudget,
        torCount: row.torCount,
        share: overallBudget > 0 ? round2((row.totalBudget / overallBudget) * 100) : 0,
      }));

    return res.json({
      byAgency: toRows(facets.byAgency, "agency"),
      byCategory: toRows(facets.byCategory, "category"),
      // TORs with no fiscal year (unparseable source data) would otherwise show as a null bar.
      byFiscalYear: toRows(
        facets.byFiscalYear.filter((row) => row._id !== null),
        "fiscalYear",
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load budget breakdown" });
  }
});

export default router;
