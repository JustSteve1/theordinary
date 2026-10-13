# Recall app: screen build pack

Context for an agent building the user-journey screens of the Recall web app. Read this file first, then the others in the order below.

## The product in one paragraph

A web app that runs a short daily voice check-in about the person's previous day. Behind the check-in is the `episodic-recall` agent skill: it builds an answer key from what was captured the day before (by the app's own optional day capture, or by a connected Bee wearable), listens while the person talks through their day, scores what they remembered against the answer key, and tracks the score against the person's own baseline. A dashboard shows the score trend. It is a personal wellness tool. It is **not** a medical device and never diagnoses anything.

## Working assumptions (from the journey board)

- Web app, mobile-first and responsive. It must work well on a phone browser, because the phone mic is the main input.
- Bee is optional. The app can capture the day itself if the person turns day capture on.
- Check-ins are by voice.
- One user per account. No carers or supporters in v1.
- The dashboard shows the score trend only in v1.

## Files in this pack

| File | What it is | Use it for |
|---|---|---|
| `README.md` | This overview | Orientation, build order, scope |
| `journey-map.md` | The four user journeys, stage by stage, in four lanes, verbatim from the board | The source of truth for intent. When the spec and the map disagree, flag it |
| `screens.md` | Screen inventory: routes, components, states, navigation, acceptance criteria, and the data contract with the skill | What to build |
| `content-and-guardrails.md` | Tone, copy, forbidden words, consent, privacy, accessibility | How every screen must speak and behave |
| `open-decisions.md` | Unresolved questions and conflicts, each with the default this spec uses | Build with the default; keep it easy to change; list any you touched in your summary |

## Build order

1. Shared shell: layout, typography, tokens, buttons, the recording indicator component, the voice-session component (states only, wired to a mock).
2. Sign-up flow: S-01 to S-05.
3. First login flow: S-06 to S-09, then S-10 Home with all its states.
4. Check-in flow: S-11 to S-13, against a mocked skill that emits the events in `screens.md` § Skill contract.
5. Summary flow: S-14 Dashboard, against fixture sessions (0, 3, 5 and 12 sessions, including one `review_suggested`).
6. S-15 Settings (minimal).

Build every screen's empty, loading and error states, not just the happy path. Use the project's existing stack and design system if there is one; this pack does not prescribe a framework.

## Out of scope for v1 (parked on the board)

Session history list, confounders view, export for GP, carers or supporters, native apps, text-chat check-ins, cued recall, recognition tests.

## Definition of done for a screen

- Matches its entry in `screens.md`, including every listed state.
- Copy follows `content-and-guardrails.md`. No forbidden words anywhere, including error messages and alt text.
- Meets WCAG 2.2 AA, works at 360px wide and with a screen reader, and works without motion.
- Traces back to at least one stage ID in `journey-map.md`.
- Any default taken from `open-decisions.md` is isolated (a flag, a config value or a single component) so it can be changed without a redesign.
