import mongoose from "mongoose";
import { registerModels } from "./models/index.js";

/**
 * Opens the shared MongoDB connection and registers all models.
 * Call once at startup, before anything touches the database.
 */
export async function connectDb(): Promise<void> {
  const url = process.env.MONGO_URL;

  if (!url) {
    throw new Error("MONGO_URL is not set. Check your .env file.");
  }

  await mongoose.connect(url);
  registerModels();

  console.log("Connected to MongoDB");
}

/** Closes the connection so scripts can exit cleanly. */
export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}