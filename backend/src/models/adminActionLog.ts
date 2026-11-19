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
        "user.password_reset",
        "user.sessions_revoke",
        "users.sessions_revoke_all",
        "user.role_change",
        "feedback.status_change",
        "feedback.respond",
        "tor.status_change",
        "tor.edit",
      ],
      required: true,
    },
    targetType: { type: String, enum: ["User", "Feedback", "Tor"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    // free-form before/after snapshot, e.g. { from: "active", to: "disabled" }
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminActionLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminActionLogSchema.index({ actorId: 1, createdAt: -1 });
// Retention (V14.2.7): admin audit entries are kept for one year.
adminActionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export type AdminActionLogDoc = InferSchemaType<typeof adminActionLogSchema>;
export const AdminActionLog = model("AdminActionLog", adminActionLogSchema);
