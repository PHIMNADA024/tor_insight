import "dotenv/config";
import { connectDB, disconnectDB } from "../db.js";
import { runBmaSync } from "../services/bmaFetcher.js";

const file = process.argv[2] ?? "data/bma2569.json";

await connectDB();
const result = await runBmaSync(file, "manual");
console.log(result);
await disconnectDB();