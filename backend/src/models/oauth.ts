import { Schema, model } from "mongoose";

/**
 * One pending "Sign in with Google" attempt. Created when the user is sent to
 * Google and deleted when Google sends them back, so each state works once.
 * Only a hash of the state is stored; the raw value lives in the user's cookie.
 */
const oauthStateSchema = new Schema({
  stateHash: { type: String, required: true, unique: true },
  codeVerifier: { type: String, required: true },
  nonce: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthState = model("OAuthState", oauthStateSchema);

/**
 * A short-lived, single-use code that the frontend swaps for our own access
 * token. It keeps the access token out of the redirect URL.
 */
const oauthLoginCodeSchema = new Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
});
oauthLoginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthLoginCode = model("OAuthLoginCode", oauthLoginCodeSchema);
