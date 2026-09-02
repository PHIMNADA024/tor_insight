import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import "dotenv/config";
import cors from "cors";
import express from "express";

import { connectDB } from "./db.js";
import authRoutes from "./routes/auth.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin:
      process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  }),
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

async function startServer() {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();