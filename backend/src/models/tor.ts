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

    // BMA has no tender title, so this comes from
    // planning.budget.project in the source data.
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    agency: { type: String, required: true, trim: true },
    agencyId: { type: String, trim: true },

    // Derived by us from the UNSPSC codes below, not present
    // in the source. Raw codes kept so we can reclassify later.
    category: { type: String, default: "uncategorized" },
    unspscCodes: [{ type: String }],

    // Two separate figures: what was budgeted (planning stage)
    // and what the tender was actually valued at. They differ.
    budgetAmount: { type: Number },
    budgetCurrency: { type: String, default: "THB" },
    tenderAmount: { type: Number },
    fiscalYear: { type: Number },

    publishedDate: { type: Date },

    // Required by FR-02 but not present in BMA's data.
    // Kept so other sources can fill them later.
    submissionDeadline: { type: Date },
    procurementMethod: { type: String, trim: true },
    bidderQualifications: { type: String, trim: true },

    // Link back to the official source for verification (FR-05).
    sourceUrl: { type: String, trim: true },
    // Attachments (FR-03). Rare in BMA's dataset.
    documents: [
      {
        title: String,
        url: String,
        format: String,
      },
    ],

    // Publication workflow (FR-04, FR-12). Fetcher writes "draft";
    // an admin approves before it becomes searchable.
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
    },

    // When the record changed at the agency, as opposed to
    // updatedAt below which is when we changed it (FR-11, FR-22).
    sourceUpdatedAt: { type: Date },
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

export type TorDoc = InferSchemaType<typeof torSchema>;
export const Tor = model("Tor", torSchema);