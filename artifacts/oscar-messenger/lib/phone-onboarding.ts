export type PhoneOnboardingDestination =
  | "profile-setup"
  | "phone-setup"
  | "inbox";

export function phoneOnboardingDestination(
  hasProfile: boolean,
  hasPhone: boolean,
  skipped: boolean,
): PhoneOnboardingDestination {
  if (!hasProfile) return "profile-setup";
  if (!hasPhone && !skipped) return "phone-setup";
  return "inbox";
}

export function phoneSetupSkipStorageKey(userId: string): string {
  return `messenger_phone_setup_skipped:${encodeURIComponent(userId)}`;
}
