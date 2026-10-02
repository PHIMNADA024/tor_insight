import { Tor } from "../models/index.js";
import { User } from "../models/user.js";
import { Notification } from "../models/notification.js";
import { sendTorMatchEmail } from "../services/email.js";

function buildQuery(criteria: any, torIds: string[]) {
  const query: Record<string, unknown> = {
    _id: { $in: torIds },
  };

  if (criteria.categories?.length) query.category = { $in: criteria.categories };
  if (criteria.agencies?.length) query.agency = { $in: criteria.agencies };
  if (criteria.fiscalYear) {
    query.fiscalYear = criteria.fiscalYear >= 2400
      ? criteria.fiscalYear - 543
      : criteria.fiscalYear;
  }
  if (criteria.minBudget || criteria.maxBudget) {
    query.budgetAmount = {
      ...(criteria.minBudget ? { $gte: criteria.minBudget } : {}),
      ...(criteria.maxBudget ? { $lte: criteria.maxBudget } : {}),
    };
  }
  if (criteria.keywords?.length) query.$text = { $search: criteria.keywords.join(" ") };

  return query;
}

export async function notifyMatchingUsers(newTorIds: string[]) {
  if (newTorIds.length === 0) return { usersNotified: 0 };

  const users = await User.find({
    status: "active",
    isEmailVerified: true,
    $or: [
      { "interestCriteria.categories.0": { $exists: true } },
      { "interestCriteria.agencies.0": { $exists: true } },
      { "interestCriteria.keywords.0": { $exists: true } },
      { "interestCriteria.minBudget": { $exists: true } },
      { "interestCriteria.maxBudget": { $exists: true } },
      { "interestCriteria.fiscalYear": { $exists: true } },
    ],
  });

  let usersNotified = 0;

  for (const user of users) {
    const query = buildQuery(user.interestCriteria, newTorIds);
    const matches = await Tor.find(query).limit(10);

    if (matches.length === 0) continue;

    try {
      await Notification.insertMany(
        matches.map((tor) => ({
          userId: user._id,
          type: "tor_match",
          title: "มี TOR ใหม่ที่ตรงกับความสนใจของคุณ",
          message: `TOR ใหม่ "${tor.title}" ตรงกับเงื่อนไขที่คุณบันทึกไว้`,
          relatedId: tor._id,
        })),
      );
    } catch (error) {
      console.error(`Failed to create in-app notifications for ${user.email}:`, error);
    }

    if (user.notifyByEmail) {
      try {
        await sendTorMatchEmail(
          user.email,
          user.name,
          matches.map((t) => ({
            title: t.title,
            agency: t.agency,
            ...(t.budgetAmount != null ? { budgetAmount: t.budgetAmount } : {}),
            ...(t.sourceUrl != null ? { sourceUrl: t.sourceUrl } : {}),
          })),
        );
      } catch (error) {
        console.error(`Failed to email ${user.email}:`, error);
      }
    }

    usersNotified++;
  }

  return { usersNotified };
}