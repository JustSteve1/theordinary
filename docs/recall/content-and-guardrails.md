# Content and guardrails

Rules every screen follows. Where a rule comes from a journey card, the stage ID is given.

## The boundary: wellness, not medicine

- Recall is a personal tracking tool. It does not detect, screen for, diagnose, or rule out any condition. Claims like those would likely make it a regulated medical device under the UK MHRA and EU MDR. (SU-1)
- Describe scores and trends; never interpret them as health.
- When health comes up, the only route is: "If you're worried about your memory or health, your GP is the right person to talk to."

### Words never to use (UI, copy, alt text, errors, notifications, emails)

normal, abnormal, impaired, impairment, decline, declining, deficit, deteriorate, dementia, Alzheimer's, MCI, cognitive impairment, diagnosis, diagnose, symptoms, risk score, test result, pass, fail, at risk.

### Words to use instead

| Instead of | Say |
|---|---|
| test, assessment | check-in |
| score dropped, decline | lower than your usual range |
| normal | in your usual range |
| results | your trend, your check-ins |
| patient, user (in copy) | you |

## Tone

- Warm, calm, adult. The person may already be worried about their memory (SU-1, *Feels*). Never alarm; never patronise.
- Short sentences, everyday words, around a reading age of 9 to 11. No jargon ("baseline" is fine once explained: "your usual range, based on your first few check-ins").
- Active voice. Buttons say exactly what happens ("Start check-in", "End check-in", "Turn on day capture").
- Errors say what happened and what to do, and whether anything was saved. No apologies, no blame.

## Consent and privacy

- T&Cs and Privacy policy are accepted at sign-up (S-03), with the version and time stored. (SU-4)
- Health-data consent is separate, explicit, unticked by default and withdrawable, and it's collected at first login (S-06). (FL-2; see D5)
- The microphone has two separate permissions: voice check-ins, and day capture. Day capture is **off by default**. (FL-3)
- Whenever any mic is live, the recording indicator is visible. (FL-3)
- Other people's words, captured in transcripts, are used only to build that day's check-in. They are never shown in history, never stored in session records, and never sent anywhere else. (CI-6)
- Collect the minimum: first name, email, password. No age or date of birth. (SU-3; see D6)
- No analytics or tracking until cookie consent. (SU-1)

## During a check-in

- **Never leak the answers.** Nothing on screen or in speech hints at what was captured until recall is finished. That includes the `preparing` state, notifications and the page title. (CI-3, CI-4)
- **Neutral listening.** No "good", "right", "yes" or "exactly"; no reacting to specific things the person says. Encouragement is about effort, not content ("Take your time."). (CI-4)
- **Stop is always available** and always honest about what is or isn't saved. (CI-2)
- **Stop if distressed.** Signs: frustration, self-criticism, anxiety about the result, asking whether something is wrong with them. End gently, save nothing, respond to the feeling, not the task. (CI-4)

## Results and trend

- A single session is never compared with anything until a baseline exists: 5 clean sessions (D2). Before that, show progress towards the baseline only.
- Confounders (poor sleep, feeling unwell or drinking) are shown next to the session they affect. Sessions with confounders don't count towards the baseline.
- The review notice appears only when `trend.flag == "review_suggested"` (two sessions in a row well below their usual range, after a baseline exists). (CI-6) Use exactly this copy:

  > A few recent check-ins have come in below your usual range. On its own that doesn't mean much, and there are lots of everyday reasons for it, like sleep, stress or a quiet day. If it's on your mind, it's worth mentioning to your GP next time you see them.

## Key copy

| Moment | Copy |
|---|---|
| Landing, what it isn't | "It isn't a medical test and it can't tell you whether you have a health condition. If you're worried about your memory, talk to your GP." |
| Check-in intro (voice, D1) | "Before we start: is it OK to chat about yesterday? And quickly, did you sleep badly last night, or are you feeling unwell?" |
| Opening prompt (D4) | "Tell me about yesterday: what you did, who you saw, the highs and lows. Take your time." |
| Follow-ups (exactly two) | "Anything else?" then "Anything else at all, even small things?" |
| Saving | "Thanks. Saving your check-in…" |
| Wrap-up | "Thanks for talking me through your day. Tomorrow I'll ask about today." |
| Stopped by person | "Check-in ended. Nothing was saved." |
| Distress stop | "Let's leave it there for today. Nothing's been saved, and we can try again another time." |
| Not enough data | "There isn't enough from yesterday to build a check-in. That's fine, try again tomorrow." |

## Accessibility

Target WCAG 2.2 AA, designed with older adults in mind.

- Body text at least 18px; line height at least 1.5; contrast of at least 4.5:1 for text and 3:1 for UI elements.
- Tap targets at least 48×48px, with generous spacing. No gesture-only controls.
- Captions for everything the agent says. Every voice interaction has a visible button alternative (Yes/No, "I've finished", Stop).
- States are never shown by colour alone: pair colour with an icon or text (recording indicator, chart markers, range labels).
- Every animation respects `prefers-reduced-motion`. No auto-advancing screens; nothing times out without warning.
- The chart has a table alternative. Screen readers hear session-state changes through polite live regions.
- Full keyboard support, with visible focus.
