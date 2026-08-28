import { Schema, model, type InferSchemaType } from "mongoose";

const feedbackSchema = new Schema(
  {
    torId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    category: {
      type: String,
      enum: ["incorrect_info", "outdated_info", "broken_link", "other"],
      required: true,
    },
    description: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending",
      required: true,
    },
    adminResponse: { type: String, trim: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ torId: 1 });

export type FeedbackDoc = InferSchemaType<typeof feedbackSchema>;
export const Feedback = model("Feedback", feedbackSchema);
