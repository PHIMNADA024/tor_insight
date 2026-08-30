import { Schema, model, type InferSchemaType } from "mongoose";


const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // never returned by default queries; opt in with .select("+passwordHash")
    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: ["end_user", "admin"],
      default: "end_user",
      required: true,
    },
    // admin disable (FR-21) without deleting the account/history
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      required: true,
    },

    isEmailVerified: { type: Boolean, default: false, required: true },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // bumped on both "forgot password" reset and self-service change;
    // used to invalidate session/JWTs issued before this time
    passwordChangedAt: { type: Date },

    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
