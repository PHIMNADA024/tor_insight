import mongoose from "mongoose";
import { registerModels } from "./models/index.js";

/**
 * Opens the shared MongoDB connection and registers all models.
 * Call once at startup, before anything touches the database.
 */
export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  await mongoose.connect(mongoUri);
  registerModels();

  console.log("MongoDB connected");
}

/** Closes the connection so scripts can exit cleanly. */
export async function disconnectDB() {
  await mongoose.disconnect();
}