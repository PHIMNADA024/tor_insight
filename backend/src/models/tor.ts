import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A single TOR record collected from a government data source.
 * Written by the data collection jobs, read by search,
 * the price dashboard, and the TOR detail page.
 */
const torSchema = new Schema(
  {
    // OCDS contracting process identifier. Stable across syncs,
    // so this is what we use for duplicate detection (FR-08).
    ocid: { type: String, required: true, unique: true, trim: true },
    sourceId: { type: String, required: true, default: "bma" },

    // e-GP project number. BMA's tender.id is the same number, so this is
    // how the two sources recognise the same procurement (FR-08).
    egpProjectNumber: { type: String, trim: true },
    // e-GP's internal id, needed to re-check a project's announcements.
    egpProjectId: { type: String, trim: true },
    // AI summary of the e-GP TOR document, shown as the project details
    // (BMA records use their items/contracts instead).
    detailSummary: { type: String },
    // The e-GP PDFs the deadline and detailSummary were read from; they are
    // re-read only when e-GP publishes a different file.
    invitationPdfUrl: { type: String },
    torPdfUrl: { type: String },
    // The e-GP winner announcement that suppliers and awardAmount were read from.
    awardPdfUrl: { type: String },
    // e-GP has no contract records; these stand in for BMA's contracts.
    // awardAmount is the winning price (summed over winners); null means the
    // PDF was read but the price was missing or implausible.
    awardAmount: { type: Number },
    contractStatus: { type: String, trim: true },

    // BMA has no tender title, so this comes from
    // planning.budget.project in the source data.
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    agency: { type: String, required: true, trim: true },
    agencyId: { type: String, trim: true },

    // Expense category derived from the budget code (e.g. "materials",
    // "equipment"), and an IT tag derived from the UNSPSC codes
    // ("software" | "it_equipment"; the fetcher only keeps IT work). Neither
    // is in the source; raw codes are kept so we can reclassify later.
    category: { type: String, default: "uncategorized" },
    itCategory: { type: String },
    budgetId: { type: String, trim: true },
    unspscCodes: [{ type: String }],

    // Two separate figures: what was budgeted (planning stage)
    // and what the tender was actually valued at. They differ.
    budgetAmount: { type: Number },
    budgetCurrency: { type: String, default: "THB" },
    tenderAmount: { type: Number },
    fiscalYear: { type: Number },

    publishedDate: { type: Date },

    // Bidding window from tender.tenderPeriod. BMA fills it for only a few
    // records. bidderQualifications isn't in BMA's data.
    // procurementMethod comes from tender.procurementMethodDetails.
    tenderStartDate: { type: Date },
    submissionDeadline: { type: Date },
    procurementMethod: { type: String, trim: true },
    bidderQualifications: { type: String, trim: true },

    // Link back to the official source for verification (FR-05).
    sourceUrl: { type: String, trim: true },

    // The arrays below use _id: false. Without it Mongoose gives every
    // entry a new _id on each sync, so unchanged records would be
    // counted as updated every run.

    // Attachments (FR-03). Rare in BMA's dataset.
    documents: [
      {
        _id: false,
        title: String,
        url: String,
        format: String,
        publishedDate: Date,
      },
    ],
    // When a winner or a cancellation was announced (e-GP). Bidding is
    // closed from then on, even if the deadline hasn't passed.
    awardAnnouncedAt: { type: Date },

    // What is being procured (tender.items in OCDS).
    items: [
      {
        _id: false,
        description: String,
        unspscCode: String,
        unspscDescription: String,
        quantity: Number,
        unit: String,
      },
    ],

    // Winning supplier names only. For individual contractors BMA's
    // supplier id is a Thai national ID number, so we never store it.
    suppliers: [{ type: String }],

    // Signed contracts: value, period and how much has been paid so far.
    contracts: [
      {
        _id: false,
        title: String,
        startDate: Date,
        endDate: Date,
        amount: Number,
        amountSpent: Number,
      },
    ],

    // Publication workflow (FR-04, FR-12). The BMA fetcher publishes records
    // that pass its automated validation; admins can still archive them.
    // Anything created another way defaults to draft.
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
    },

    // When the record changed at the agency, as opposed to
    // updatedAt below which is when we changed it (FR-11, FR-22).
    sourceUpdatedAt: { type: Date },

    // AI-written summary shown on the detail page, generated on first view.
    // Saved without touching updatedAt; regenerated when updatedAt is newer
    // than generatedAt (i.e. the TOR's data changed since).
    aiSummary: {
      text: { type: String },
      model: { type: String },
      generatedAt: { type: Date },
    },
  },
  { timestamps: true },
);

// Keyword search (FR-01).
torSchema.index({ title: "text", description: "text" });
// Filter combinations used by the search page and dashboard.
torSchema.index({ agency: 1, fiscalYear: -1 });
torSchema.index({ category: 1, budgetAmount: -1 });
// Only published records appear in public search.
torSchema.index({ status: 1, publishedDate: -1 });
// Cross-source duplicate check between BMA and e-GP.
torSchema.index({ egpProjectNumber: 1 });

export type TorDoc = InferSchemaType<typeof torSchema>;
export const Tor = model("Tor", torSchema);