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
    // Accounts that only sign in with Google have no password.
    passwordHash: {
      type: String,
      required: function (this: { googleId?: string }) {
        return !this.googleId;
      },
      select: false,
    },
    // Google's stable user ID ("sub" in the ID token), set once the account
    // is linked to Google sign-in.
    googleId: { type: String },
    // Missing legacy values are treated as direct bcrypt hashes and upgraded at the next successful login.
    passwordHashScheme: { type: String, enum: ["bcrypt", "bcrypt_sha256"], default: "bcrypt", required: true },

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
    // Incremented to revoke all previously issued JWTs (logout, password change/reset, disable).
    tokenVersion: { type: Number, default: 0, required: true },
    // Updated by authenticated requests and checked against the inactivity timeout.
    lastActivityAt: { type: Date },

    // TOTP secrets are encrypted at rest; pending secrets expire unless enrollment is confirmed.
    mfaEnabled: { type: Boolean, default: false, required: true },
    mfaSecretEncrypted: { type: String, select: false },
    mfaPendingSecretEncrypted: { type: String, select: false },
    mfaSetupExpiresAt: { type: Date, select: false },
    mfaLoginChallengeHash: { type: String, select: false },
    mfaLoginChallengeExpiresAt: { type: Date, select: false },
    mfaLastUsedTimeStep: { type: Number },

    lastLoginAt: { type: Date },

    interestCriteria: {
      type: {
        categories: { type: [String], default: [] },
        agencies: { type: [String], default: [] },
        keywords: { type: [String], default: [] },
        minBudget: { type: Number },
        maxBudget: { type: Number },
        fiscalYear: { type: Number },
      },
      default: () => ({}),
    },  
    notifyByEmail: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
