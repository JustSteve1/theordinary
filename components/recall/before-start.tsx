"use client";

import { useState } from "react";

import { Button, ButtonLink } from "@/components/recall/ui";
import type { MockScenario } from "@/lib/recall/script";

export function BeforeStart({
  scenarios,
}: {
  scenarios: MockScenario[];
}) {
  const [hear, setHear] = useState<"unknown" | "ok" | "quiet" | "blocked">(
    "unknown",
  );

  async function check() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setHear("blocked");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audio = new AudioContext();
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      analyser.getByteTimeDomainData(data);
      const peak = Math.max(...data) / 128 - 1;
      stream.getTracks().forEach((track) => track.stop());
      await audio.close();
      setHear(Math.abs(peak) > 0.02 ? "ok" : "quiet");
    } catch {
      setHear("blocked");
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="secondary" onClick={check}>
        Check microphone
      </Button>
      {hear === "quiet" ? (
        <p role="alert">We can’t hear you. Check your mic is on.</p>
      ) : null}
      {hear === "blocked" ? (
        <p role="alert">
          The microphone is blocked. Allow it for this site in the browser’s
          site settings.
        </p>
      ) : null}
      {hear === "ok" ? (
        <ButtonLink href="/checkin/live">Start check-in</ButtonLink>
      ) : null}
      {scenarios.length > 0 ? (
        <div className="pt-4">
          <p className="text-[#d6d3d1]">Preview a state</p>
          <ul className="mt-2 space-y-2">
            {scenarios.map((scenario) => (
              <li key={scenario}>
                <ButtonLink href={`/checkin/live?scenario=${scenario}`} variant="quiet">
                  {scenario}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
