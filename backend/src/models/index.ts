import { User } from "./user.js";
import { Feedback } from "./feedback.js";
import { AdminActionLog } from "./adminActionLog.js";

export { User, Feedback, AdminActionLog };

export function registerModels() {
  return { User, Feedback, AdminActionLog };
}
