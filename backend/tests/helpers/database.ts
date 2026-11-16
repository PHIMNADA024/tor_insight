import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// A one-node replica set instead of a single server, because MongoDB only
// allows transactions on a replica set (Atlas is always one).
let mongo: MongoMemoryReplSet | undefined;

export async function connectTestDatabase() {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(mongo.getUri());
}

export async function clearTestDatabase() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
}

export async function disconnectTestDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongo?.stop();
  mongo = undefined;
}