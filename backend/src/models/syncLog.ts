import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * SyncLog records one execution of a data collection job.
 * Each run of the BMA fetcher creates one document here.
 * Used by the Admin Data Collection Dashboard (FR-23, UC-09).
 */
const syncLogSchema = new Schema(
  {
    // Which data source this run pulled from. "bma" for now,
    // more sources later (e-GP, govspending, DGA, MDES).
    sourceId: { type: String, required: true, default: "bma" },

    // Set to "in_progress" when the run starts, then updated
    // to "success" or "failed" when it finishes.
    status: {
      type: String,
      enum: ["in_progress", "success", "failed"],
      default: "in_progress",
      required: true,
    },

    // "scheduled" for cron runs, "manual" when an admin
    // clicks the Trigger Collection button.
    trigger: {
      type: String,
      enum: ["scheduled", "manual"],
      default: "scheduled",
      required: true,
    },

    startedAt: { type: Date, required: true, default: Date.now },
    // Stays empty if the run crashes before finishing.
    finishedAt: { type: Date },

    // Counters so the dashboard can show what the run actually did.
    recordsRead: { type: Number, default: 0 },      // seen in the source file
    recordsInserted: { type: Number, default: 0 },  // new TORs added
    recordsUpdated: { type: Number, default: 0 },   // existing TORs changed
    recordsSkipped: { type: Number, default: 0 },   // ignored, e.g. no tender stage

    // Populated only when status is "failed".
    errorMessage: { type: String, trim: true },
  },
  // Adds createdAt and updatedAt automatically.
  { timestamps: true },
);

// Most recent runs for a given source — the dashboard's main query.
syncLogSchema.index({ sourceId: 1, startedAt: -1 });
// Lets admins filter by status.
syncLogSchema.index({ status: 1 });

export type SyncLogDoc = InferSchemaType<typeof syncLogSchema>;
export const SyncLog = model("SyncLog", syncLogSchema);