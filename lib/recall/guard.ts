import { cache } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/users";
import {
  isOnboardingStep,
  onboardingSteps,
  type OnboardingStep,
} from "@/lib/recall/defaults";
import { pathForStep } from "@/lib/recall/paths";
import { getRecallProfile } from "@/lib/recall/store";
import type { RecallProfile } from "@/lib/recall/types";

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
