import { User } from "./user.js";
import { Feedback } from "./feedback.js";
import { AdminActionLog } from "./adminActionLog.js";
import { Tor } from "./tor.js";
import { SyncLog } from "./syncLog.js";

export { User, Feedback, AdminActionLog, Tor, SyncLog };

export function registerModels() {
  return { User, Feedback, AdminActionLog, Tor, SyncLog };
}
