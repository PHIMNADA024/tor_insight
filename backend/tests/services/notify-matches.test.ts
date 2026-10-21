import mongoose from "mongoose";
import { Notification } from "../../src/models/notification.js";
import { Tor } from "../../src/models/tor.js";
import { User } from "../../src/models/user.js";
import { notifyMatchingUsers } from "../../src/jobs/notify-matches.js";
import { sendTorMatchEmail } from "../../src/services/email.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

jest.mock("../../src/services/email.js", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendTorMatchEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackResolvedEmail: jest.fn().mockResolvedValue(undefined),
  sendNewFeedbackAdminEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountDisabledEmail: jest.fn().mockResolvedValue(undefined),
}));

const sendTorMatchEmailMock = sendTorMatchEmail as jest.MockedFunction<typeof sendTorMatchEmail>;

type TorFixture = {
  ocid: string;
  title: string;
  agency: string;
  category: string;
  budgetAmount: number;
  fiscalYear: number;
  status: "published";
};

const TOR_FIXTURE: Omit<TorFixture, "ocid"> = {
  title: "Cloud security software platform",
  agency: "Digital Services Agency",
  category: "software",
  budgetAmount: 500_000,
  fiscalYear: 2026,
  status: "published" as const,
};

async function createUser(options: {
  email?: string;
  criteria?: Record<string, unknown>;
  notifyByEmail?: boolean;
  status?: "active" | "disabled";
  verified?: boolean;
}) {
  return User.create({
    name: "Match User",
    email: options.email ?? `${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: "not-used-here",
    role: "end_user",
    status: options.status ?? "active",
    isEmailVerified: options.verified ?? true,
    notifyByEmail: options.notifyByEmail ?? false,
    interestCriteria: options.criteria ?? {},
  });
}

async function createTor(overrides: Partial<TorFixture> = {}) {
  return Tor.create({
    ...TOR_FIXTURE,
    ocid: `test-${new mongoose.Types.ObjectId()}`,
    ...overrides,
  });
}

async function runAgainst(torIds: mongoose.Types.ObjectId[]) {
  return notifyMatchingUsers(torIds.map((id) => id.toString()));
}

beforeAll(async () => {
  await connectTestDatabase();
  await Tor.init();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  sendTorMatchEmailMock.mockClear();
});

describe("notifyMatchingUsers criteria", () => {
  it("matches by category", async () => {
    const user = await createUser({ criteria: { categories: ["software"] } });
    const matching = await createTor();
    await createTor({ ocid: `nonmatching-${new mongoose.Types.ObjectId()}`, category: "equipment" });

    await runAgainst([matching._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: matching._id })).toBe(1);
  });

  it("matches by agency", async () => {
    const user = await createUser({ criteria: { agencies: ["Digital Services Agency"] } });
    const matching = await createTor();

    await runAgainst([matching._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: matching._id })).toBe(1);
  });

  it("matches a TOR inside the minimum and maximum budget range only", async () => {
    const user = await createUser({ criteria: { minBudget: 400_000, maxBudget: 600_000 } });
    const inside = await createTor({ ocid: `inside-${new mongoose.Types.ObjectId()}`, budgetAmount: 500_000 });
    const below = await createTor({ ocid: `below-${new mongoose.Types.ObjectId()}`, budgetAmount: 399_999 });
    const above = await createTor({ ocid: `above-${new mongoose.Types.ObjectId()}`, budgetAmount: 600_001 });

    await runAgainst([inside._id, below._id, above._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: inside._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: user._id, relatedId: { $in: [below._id, above._id] } })).toBe(0);
  });

  it.each([2026, 2569])("matches fiscal year %s in Gregorian or Buddhist form", async (fiscalYear) => {
    const user = await createUser({ criteria: { fiscalYear } });
    const matching = await createTor({ fiscalYear: 2026 });

    await runAgainst([matching._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: matching._id })).toBe(1);
  });

  it("matches a keyword using the TOR text index", async () => {
    const user = await createUser({ criteria: { keywords: ["cloud"] } });
    const matching = await createTor();

    await runAgainst([matching._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: matching._id })).toBe(1);
  });

  it("combines multiple saved criteria with AND semantics", async () => {
    const user = await createUser({
      criteria: { categories: ["software"], agencies: ["Digital Services Agency"], minBudget: 100_000 },
    });
    const matching = await createTor();
    const wrongAgency = await createTor({
      ocid: `wrong-agency-${new mongoose.Types.ObjectId()}`,
      agency: "Other Agency",
    });

    await runAgainst([matching._id, wrongAgency._id]);

    expect(await Notification.countDocuments({ userId: user._id, relatedId: matching._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: user._id, relatedId: wrongAgency._id })).toBe(0);
  });
});

describe("notifyMatchingUsers delivery", () => {
  it("always creates in-app notifications and sends email only when opted in", async () => {
    const noEmailUser = await createUser({ email: "no-email@example.test", criteria: { categories: ["software"] }, notifyByEmail: false });
    const emailUser = await createUser({ email: "email@example.test", criteria: { categories: ["software"] }, notifyByEmail: true });
    const matching = await createTor();

    const result = await runAgainst([matching._id]);

    expect(result.usersNotified).toBe(2);
    expect(await Notification.countDocuments({ relatedId: matching._id })).toBe(2);
    expect(await Notification.countDocuments({ userId: noEmailUser._id, relatedId: matching._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: emailUser._id, relatedId: matching._id })).toBe(1);
    expect(sendTorMatchEmailMock).toHaveBeenCalledTimes(1);
    expect(sendTorMatchEmailMock).toHaveBeenCalledWith(
      emailUser.email,
      emailUser.name,
      [expect.objectContaining({ title: matching.title, agency: matching.agency, budgetAmount: matching.budgetAmount })],
    );
  });

  it("skips disabled and unverified users even when their criteria match", async () => {
    const disabled = await createUser({
      criteria: { categories: ["software"] },
      status: "disabled",
      notifyByEmail: true,
    });
    const unverified = await createUser({
      criteria: { categories: ["software"] },
      verified: false,
      notifyByEmail: true,
    });
    const matching = await createTor();

    const result = await runAgainst([matching._id]);

    expect(result.usersNotified).toBe(0);
    expect(await Notification.countDocuments({ relatedId: matching._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: { $in: [disabled._id, unverified._id] } })).toBe(0);
    expect(sendTorMatchEmailMock).not.toHaveBeenCalled();
  });

  it("does nothing when the sync produced no new TOR ids", async () => {
    const user = await createUser({ criteria: { categories: ["software"] }, notifyByEmail: true });

    const result = await notifyMatchingUsers([]);

    expect(result).toEqual({ usersNotified: 0 });
    expect(await Notification.countDocuments({ userId: user._id })).toBe(0);
    expect(sendTorMatchEmailMock).not.toHaveBeenCalled();
  });
});
