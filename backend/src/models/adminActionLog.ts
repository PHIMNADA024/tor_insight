import { Schema, model, type InferSchemaType } from "mongoose";


const adminActionLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: [
        "user.disable",
        "user.enable",
        "user.delete",
        "user.role_change",
        "feedback.status_change",
        "feedback.respond",
      ],
      required: true,
    },
    targetType: { type: String, enum: ["User", "Feedback"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    // free-form before/after snapshot, e.g. { from: "active", to: "disabled" }
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminActionLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminActionLogSchema.index({ actorId: 1, createdAt: -1 });

export type AdminActionLogDoc = InferSchemaType<typeof adminActionLogSchema>;
export const AdminActionLog = model("AdminActionLog", adminActionLogSchema);
