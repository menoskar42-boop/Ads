export type ExitReason = "weak_intro" | "boring_content" | "missing_target" | "normal_exit";

interface ExitEvent {
  timeSpent: number;         // seconds on page
  scrollDepth: number;       // 0-100
  lastClickedElement: string | null;
}

/**
 * Classifies why a user left a page using simple rule-based logic.
 * No AI required — fast and deterministic.
 */
export function detectExitReason(event: ExitEvent): ExitReason {
  const { timeSpent, scrollDepth, lastClickedElement } = event;
  const hasClick = !!lastClickedElement;

  // Rule 1: Bounced early — intro didn't hook them
  if (timeSpent < 10 && scrollDepth < 20) {
    return "weak_intro";
  }

  // Rule 2: Read a lot but never clicked anything — content wasn't engaging enough
  if (scrollDepth > 60 && !hasClick) {
    return "boring_content";
  }

  // Rule 3: Clicked something then left — they wanted something they didn't find
  if (hasClick) {
    return "missing_target";
  }

  return "normal_exit";
}

/**
 * Returns the Arabic label for each exit reason.
 */
export function exitReasonLabel(reason: ExitReason): string {
  const labels: Record<ExitReason, string> = {
    weak_intro:      "مقدمة ضعيفة",
    boring_content:  "محتوى غير جذاب",
    missing_target:  "هدف مفقود",
    normal_exit:     "خروج طبيعي",
  };
  return labels[reason] || reason;
}

/**
 * Returns a suggestion for fixing the issue.
 */
export function exitReasonSuggestion(reason: ExitReason): string {
  const suggestions: Record<ExitReason, string> = {
    weak_intro:     "ابدأ بآية قوية أو محتوى لافت في أعلى الصفحة",
    boring_content: "قلّل الفقرات الطويلة وأضف تفاعلاً (أزرار، روابط، صور)",
    missing_target: "أضف زر دعوة للعمل (CTA) مبكراً في الصفحة",
    normal_exit:    "لا توجد مشكلة واضحة",
  };
  return suggestions[reason] || "";
}
