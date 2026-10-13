# Open decisions

Questions the journey board leaves open, and places where the board and the `episodic-recall` skill disagree. Each entry has the **default this spec uses**, so the screens can be built now. Keep each default isolated (a config value, a flag or one component) so it can change later without a redesign. In your build summary, list any decision you touched.

## Conflicts between the board and the skill

These need an owner decision. The defaults keep the skill's safety rules intact.

### D1 · Consent at the start of each check-in
- **Board:** the "Consent and check" stage was removed from the check-in flow (Start goes straight to Skill starts, then Free recall).
- **Skill:** consent is required every session, plus two confounder questions (sleep; feeling unwell or alcohol). These feed the baseline and the dashboard markers.
- **Default:** no separate screen. The agent asks in about 10 seconds of voice at the start of S-12 (`intro` state), with Yes/No buttons as a fallback. If they decline, end with "No problem" and save nothing.
- **Changing it** would mean editing the skill's Phase 0 and losing the confounder markers on the dashboard.

### D2 · When a baseline exists
- **Board:** CI-5 guardrail says "Baseline only after 1 sessions"; SM-2 guardrail says 5.
- **Skill:** 5 clean sessions (`MIN_BASELINE = 5`).
- **Default:** 5. A baseline from one session can't tell a normal day-to-day wobble from a real change.

### D3 · Showing the score after a check-in
- **Board:** CI-5 now wraps up with reassurance and sets up tomorrow; the earlier "hears the score" card is gone. CI-6 still offers to reveal missed items.
- **Skill:** Phase 7 gives the score and the comparison straight away.
- **Default:** no score on S-13. The score and trend live on the dashboard. The wrap-up shows baseline progress, the optional reveal, and the review notice only if flagged.

### D4 · What the person talks about, and how the agent behaves
- **Board:** CI-4 "Talks through their day, covers the highs, lows and feels"; *Feels*: "Fulfilment, like the user has somebody to listen".
- **Skill:** scores one window of yesterday (morning, afternoon or evening). The agent listens without reacting and uses neutral prompts.
- **Tension:** a warm, reflective chat is a better experience, but reacting to content biases recall and the score. Feelings aren't in the answer key, so they add time without adding signal.
- **Default:** the prompt invites the whole of yesterday, including highs and lows (copy in `content-and-guardrails.md`). Scoring still uses the skill's chosen window, and the agent stays neutral during recall. Warmth goes in the intro and the wrap-up, not the middle.
- **Owner to decide:** whole day versus a window; whether feelings matter beyond experience.

## Questions from the board

| ID | Stage | Question on the board | Default in this spec |
|---|---|---|---|
| D5 | SU-4 | Health-data consent: at T&Cs, or in first-login config? | First login, S-06. S-03 says it's coming next |
| D6 | SU-3 | Do we need age or year of birth? | No. The baseline is personal |
| D7 | FL-3 | How do we handle other people being recorded during day capture? | Off by default, an always-visible indicator, and pause in one tap. Others' words are used only to build the check-in and never stored. **Needs legal review before launch** |
| D8 | CI-3 | Waiting while the skill prepares: how long is OK? | Pre-build the answer key overnight (CI-3 idea). Target under 3 s; reassurance copy after 8 s |
| D9 | SU-1 | The visitor may already be worried about their memory: how do we speak to that? | Calm, plain copy; a "What this isn't" line pointing to the GP; no fear-based messaging |
| D10 | SM-3 | Worried by a dip: how do we explain dips? | Confounder markers on points, plus an explainer about day-to-day variation under the chart |
| D11 | FL-5 | "What now?" on day 1 | The `day1` state on S-10 says the first check-in is tomorrow, and offers a reminder |
| D12 | CI-5 | "Connects to users database to send the context required for future days": what context? | Only the session record (see `screens.md` § Skill contract). Nothing else is stored. Owner to confirm whether more is needed, e.g. topics to follow up tomorrow |
| D13 | FL-3 | Curiosity about what the agent may ask | An expandable "What will it ask me?" sample on S-07 |

## Ideas on the board

| Stage | Idea | In this spec? |
|---|---|---|
| SU-5 | The email link opens straight into first login, signed in | Yes, S-04 |
| FL-4 | Warn if neither day capture nor Bee is on; allow later | Yes, S-08 |
| FL-5 | Say the first check-in is tomorrow; offer a reminder time | Yes, S-10 `day1` and S-09 |
| CI-3 | The person sees a visual cue that recording is in progress | Yes, S-12 `preparing` and the recording indicator |
| CI-3 | Build the answer key overnight so Start is instant | Yes, the target for D8; the backend needs a nightly job |
| CI-5 | Reassure the person and set up tomorrow's conversation | Yes, S-13 |
| SM-3 | Mark sessions with poor sleep or feeling unwell | Yes, S-14 |
| SM-4 | Session history, confounders view, export for GP | No, parked for after v1 |
