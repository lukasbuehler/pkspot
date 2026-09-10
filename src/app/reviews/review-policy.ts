export interface ReviewHistory {
  firstUsed: number;
  days: string[];
  actions: number;
  lastAttempt?: number;
}

export const REVIEW_HISTORY_KEY = "pkspot.review.v1";
const DAY = 86_400_000;

export function reviewEligible(history: ReviewHistory, now: number): boolean {
  const nextAttempt = new Date(history.lastAttempt ?? 0);
  nextAttempt.setMonth(nextAttempt.getMonth() + 6);
  return now - history.firstUsed >= 14 * DAY &&
    new Set(history.days).size >= 3 && history.actions >= 3 &&
    (history.lastAttempt === undefined || now >= nextAttempt.getTime());
}

export function readReviewHistory(value: string | null, now: number): ReviewHistory {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (parsed && typeof parsed === "object") {
      const h = parsed as Partial<ReviewHistory>;
      if (typeof h.firstUsed === "number" && Number.isFinite(h.firstUsed) && h.firstUsed <= now &&
          Array.isArray(h.days) && h.days.length <= 3 && h.days.every(d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) &&
          Number.isInteger(h.actions) && h.actions! >= 0 && h.actions! <= 3 &&
          (h.lastAttempt === undefined || (typeof h.lastAttempt === "number" && Number.isFinite(h.lastAttempt)))) {
        return h as ReviewHistory;
      }
    }
  } catch { /* Missing or damaged local state starts a new waiting period. */ }
  return { firstUsed: now, days: [], actions: 0 };
}
