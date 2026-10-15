import { cache } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/src/platform/current-user";
import {
  isOnboardingStep,
  onboardingSteps,
  type OnboardingStep,
} from "@/src/platform/recall/defaults";
import { pathForStep } from "@/src/platform/recall/paths";
import { getRecallProfile } from "@/src/platform/recall/store";
import type { RecallProfile } from "@/src/platform/recall/types";

export const currentProfile = cache(async (): Promise<RecallProfile | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return getRecallProfile(user.id);
});

export async function requireRecall(range: {
  min: OnboardingStep;
  max: OnboardingStep;
}) {
  const profile = await currentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!profile.emailVerifiedAt) {
    redirect("/signup/verify");
  }

  const step: OnboardingStep = isOnboardingStep(profile.step)
    ? profile.step
    : "privacy";
  const index = onboardingSteps.indexOf(step);
  const min = onboardingSteps.indexOf(range.min);
  const max = onboardingSteps.indexOf(range.max);
  if (index < min || index > max) {
    redirect(pathForStep(step));
  }
  return profile;
}
