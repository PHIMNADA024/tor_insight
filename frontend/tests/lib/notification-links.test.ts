import { getNotificationLink } from "@/lib/notification-links";

describe("getNotificationLink", () => {
  it("routes new-feedback notifications to admin feedback", () => {
    expect(getNotificationLink("new_feedback", "feedback-1")).toBe("/admin/feedback");
  });

  it("routes feedback-response notifications to the user's feedback page", () => {
    expect(getNotificationLink("feedback_resolved", "feedback-1")).toBe("/my-feedback");
  });

  it("routes TOR matches to the related TOR when an id exists", () => {
    expect(getNotificationLink("tor_match", "tor-123")).toBe("/tor/tor-123");
  });

  it("routes TOR matches without an id to search", () => {
    expect(getNotificationLink("tor_match")).toBe("/search");
  });

  it("routes unknown notification types to the notifications page", () => {
    expect(getNotificationLink("future_notification", "item-1")).toBe("/notifications");
  });
});
