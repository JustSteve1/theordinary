/**
 * Isolated defaults from docs/recall/open-decisions.md.
 * Change a value here rather than scattering it through screens.
 */
export const recallDefaults = {
  /** D1. Consent is spoken at the start of S-12, with Yes/No as a fallback. */
  consentEachCheckIn: "voice_intro",
  /** D2. Clean sessions required before a usual range exists. */
  minBaseline: 5,
  /** D3. The wrap-up does not show a score. */
  showScoreOnWrapUp: false,
  /** D4. The prompt invites the whole of yesterday. Scoring still uses one window. */
  promptScope: "whole_day",
  scoringWindow: "afternoon",
  neutralDuringRecall: true,
  /** D5. Health-data consent is collected at first login, not with the terms. */
  healthConsentAt: "first_login",
  /** D6. No age or year of birth. */
  askAge: false,
  /** D7. Day capture is off until the person turns it on. */
  dayCaptureDefault: false,
  /** D8. Preparing should finish quickly. Reassure if it does not. */
  preparingTargetMs: 3000,
  preparingReassuranceMs: 8000,
  /** D9. Calm, plain copy. */
  tone: "calm",
  /** D10. Confounders are marked on the trend. */
  showConfounderMarkers: true,
  /** D11. The first check-in is the day after onboarding. */
  firstCheckIn: "tomorrow",
  /** D12. Only the session record is stored. */
  storedContext: "session_record",
  /** D13. S-07 includes a sample of the opening line. */
  samplePromptOnMicStep: true,
  /** This stack has no passkey provider. */
  passkeysEnabled: false,
  /** No analytics script is loaded. The banner only records the choice. */
  analyticsProvider: null,
  termsVersion: "2026-10-13",
  privacyVersion: "2026-10-13",
  healthVersion: "2026-10-13",
  reminderDefault: "10:00",
  loginAttemptLimit: 8,
  loginLockMinutes: 15,
  verifyTtlHours: 24,
  resendCooldownSeconds: 60,
} as const;

export const onboardingSteps = ["privacy", "microphone", "bee", "done"] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (onboardingSteps as readonly string[]).includes(value);
}
