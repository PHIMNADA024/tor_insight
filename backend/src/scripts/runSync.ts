import "dotenv/config";
import { connectDb, disconnectDb } from "../db.js";
import { runBmaSync } from "../services/bmaFetcher.js";

const file = process.argv[2] ?? "data/bma2569.json";

await connectDb();
const result = await runBmaSync(file, "manual");
console.log(result);
await disconnectDb();