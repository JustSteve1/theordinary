import { isOnboardingStep, type OnboardingStep } from "@/lib/recall/defaults";

export function pathForStep(step: string) {
  if (step === "microphone") {
    return "/welcome/microphone";
  }
  if (step === "bee") {
    return "/welcome/bee";
  }
  if (step === "done") {
    return "/home";
  }
  return "/welcome/privacy";
}

export function welcomeAllowed(step: string, pathname: string) {
  const current: OnboardingStep = isOnboardingStep(step) ? step : "privacy";
  const allowed = ["/welcome/privacy"];
  if (current === "microphone" || current === "bee" || current === "done") {
    allowed.push("/welcome/microphone");
  }
  if (current === "bee" || current === "done") {
    allowed.push("/welcome/bee");
  }
  return allowed.includes(pathname);
}
