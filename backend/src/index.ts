import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import cron from "node-cron";

import { connectDB } from "./db.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import torRoutes from "./routes/tor.js";
import adminTorRoutes from "./routes/admin-tor.js";
import adminSyncRoutes from "./routes/admin-sync.js";
import feedbackRoutes from "./routes/feedback.js";
import adminFeedbackRoutes from "./routes/admin-feedback.js";
import notificationRoutes from "./routes/notifications.js";
import adminUserRoutes from "./routes/admin-users.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { sanitizeBody } from "./middleware/sanitize.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { syncFiscalYear, currentFiscalYear } from "./services/bmaFetcher.js";
import { startSyncSchedule } from "./jobs/syncSchedule.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const app = express();
const port = Number(process.env.PORT) || 4000;

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

const SYNC_CRON = process.env.SYNC_CRON ?? "0 2 * * *";

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);

app.use(generalLimiter);
app.use(express.json());
app.use(sanitizeBody);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tors", torRoutes);
app.use("/api/admin", adminTorRoutes);
app.use("/api/admin", adminSyncRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminFeedbackRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminUserRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
    });

    startSyncSchedule();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

if (process.env.ENABLE_SYNC_CRON === "true") {
  cron.schedule(SYNC_CRON, async () => {
    console.log("Running scheduled BMA sync...");
    try {
      const result = await syncFiscalYear(currentFiscalYear(), "scheduled");
      console.log("Scheduled sync finished:", result);
    } catch (error) {
      console.error("Scheduled sync failed:", error);
    }
  });
  console.log(`Sync cron enabled: ${SYNC_CRON}`);
}
