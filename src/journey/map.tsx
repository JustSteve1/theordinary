import type { Metadata } from "next";
import Link from "next/link";

import { currentProfile } from "@/src/platform/recall/guard";
import { AccountMenu } from "@/src/platform/shell/account-menu";
import { RecallFrame, sectionLabel } from "@/src/platform/shell/ui";

export const metadata: Metadata = { title: "Journey" };

type Step = {
  id: string;
  label: string;
  route: string;
};

function Node({
  step,
  hub = false,
}: {
  step: Step;
  hub?: boolean;
}) {
  return (
    <Link
      href={step.route}
      className={`block w-fit min-w-[9.5rem] max-w-full rounded-[10px] border px-3 py-2 ${
        hub
          ? "border-[#0a84ff]/50 bg-white/[0.03]"
          : "border-white/10 bg-[#0a0a0a]"
      }`}
    >
      <span className="block text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
        {step.id}
      </span>
      <span className="mt-1 block text-[#0a84ff]">{step.label}</span>
      <span className="block break-all text-[11px] text-stone-500">{step.route}</span>
    </Link>
  );
}

function Flow({
  title,
  detail,
  steps,
}: {
  title: string;
  detail: string;
  steps: Step[];
}) {
  return (
    <section>
      <h2 className={sectionLabel}>{title}</h2>
      <p className="sr-only">{detail}</p>
      <ol className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-stone-600" aria-hidden>
                →
              </span>
            ) : null}
            <Node step={step} />
          </li>
        ))}
      </ol>
    </section>
  );
}

const signup: Step[] = [
  { id: "SU-1", label: "Landing", route: "/" },
  { id: "SU-3", label: "Create account", route: "/signup" },
  { id: "SU-4", label: "Terms", route: "/signup/terms" },
  { id: "SU-5", label: "Check email", route: "/signup/verify" },
  { id: "FL-1", label: "Log in", route: "/login" },
];

const firstLogin: Step[] = [
  { id: "FL-2", label: "Privacy", route: "/welcome/privacy" },
  { id: "FL-3", label: "Microphone", route: "/welcome/microphone" },
  { id: "FL-4", label: "Connect Bee", route: "/welcome/bee" },
];

const helloWorld: Step = {
  id: "FL-5",
  label: "Hello World",
  route: "/home",
};

const branches: { title: string; detail: string; steps: Step[] }[] = [
  {
    title: "Check-in",
    detail: "The episodic recall task.",
    steps: [
      { id: "CI-2", label: "Before you start", route: "/checkin" },
      { id: "CI-4", label: "Live check-in", route: "/checkin/live" },
      { id: "CI-6", label: "Wrap-up", route: "/checkin/done" },
    ],
  },
  {
    title: "Summary",
    detail: "The score trend.",
    steps: [{ id: "SM-2", label: "Trend", route: "/dashboard" }],
  },
  {
    title: "Membership",
    detail: "Status, integrations, and account.",
    steps: [
      { id: "Week", label: "Membership", route: "/app" },
      { id: "Account", label: "Settings", route: "/settings" },
    ],
  },
];

const aside: Step[] = [
  { id: "Reset", label: "Forgot password", route: "/login/forgot" },
  { id: "Privacy", label: "Privacy policy", route: "/privacy" },
  { id: "Terms", label: "Terms of use", route: "/terms" },
];

export default async function JourneyMapPage() {
  const profile = await currentProfile();

  return (
    <RecallFrame
      wide
      account={
        profile?.emailVerifiedAt ? <AccountMenu name={profile.name} /> : undefined
      }
    >
      <p className={sectionLabel}>Customer journeys</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">
        Everything on this site
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-5 text-stone-400">
        Each step opens the screen it names. Hello World is the launch point.
        The tasks and the membership dashboard hang off it.
      </p>
      <p className="mt-3 flex flex-wrap gap-4">
        {aside.map((step) => (
          <Link key={step.route} href={step.route} className="text-[#0a84ff]">
            {step.label}
          </Link>
        ))}
      </p>

      <div className="mt-4 space-y-3 rounded-[10px] border border-white/10 p-4">
        <Flow
          title="Sign-up"
          detail="From the website to a verified account."
          steps={signup}
        />
        <Flow
          title="First login"
          detail="Consent, microphone, and an optional Bee connection."
          steps={firstLogin}
        />

        <div className="flex items-center gap-3">
          <span className="text-stone-600" aria-hidden>
            →
          </span>
          <Node step={helloWorld} hub />
          <p className="text-[13px] text-stone-400">Launch point</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((branch) => (
            <div
              key={branch.title}
              className={branch.steps.length > 2 ? "lg:col-span-2" : undefined}
            >
              <Flow
                title={branch.title}
                detail={branch.detail}
                steps={branch.steps}
              />
            </div>
          ))}
        </div>
      </div>

    </RecallFrame>
  );
}
