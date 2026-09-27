export function getNotificationLink(type: string, relatedId?: string): string {
    switch (type) {
        case "new_feedback":
            return "/admin/feedback";
        case "feedback_resolved":
            return "/my-feedback";
        case "tor_match":
            return relatedId ? `/tor/${relatedId}` : "/search";
        default:
            return "/notifications";
    }
}