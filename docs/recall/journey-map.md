# Journey map

Source of truth for the user journeys, exported from the Recall Journey Board on 13 Oct 2026 (v2 plus owner edits). Card text is verbatim from the board.

**Status tags.** `draft` = current intent, build it. `agreed` = confirmed. `idea` = suggested, see `open-decisions.md` for whether this spec adopts it. `question` = unresolved, see `open-decisions.md` for the default used.

**Lanes.** *Person does* is what the user sees and does. *System / agent does* happens behind the scenes. *Feels* is the likely emotion the screen must design for. *Guardrail* is a rule the screen must respect.

**Stage IDs** (e.g. `CI-4`) are referenced from `screens.md`. Stages marked *inside skill* run within the episodic-recall skill.


## 1. Sign-up

From the website to a verified account. Hands off to first login.


### SU-1 Lands on webpage

| Lane | Card | Status |
|---|---|---|
| Person does | Arrives from a link or search; reads what the app does and who it's for | `draft` |
| System / agent does | Static marketing page. No analytics until cookie consent | `draft` |
| Feels | Curious. May already be worried about their memory: how do we speak to that? | `question` |
| Guardrail | Plain, non-alarmist copy. No claims to detect or diagnose anything | `draft` |


### SU-2 Clicks sign-up

| Lane | Card | Status |
|---|---|---|
| Person does | Clicks Sign up (or Log in if returning) | `draft` |
| System / agent does | Routes to auth; spots an existing account and offers log in instead | `draft` |
| Feels | Committed but cautious | `draft` |
| Guardrail | Easy to back out. No dark patterns | `draft` |


### SU-3 Enters details

| Lane | Card | Status |
|---|---|---|
| Person does | Email and password (or passkey), first name | `draft` |
| System / agent does | Creates a pending, unverified account | `draft` |
| Feels | Mild friction; wants it quick | `draft` |
| Guardrail | Collect the minimum. Do we need age or year of birth? Baselines are personal, so maybe not | `question` |


### SU-4 Accepts T&Cs

| Lane | Card | Status |
|---|---|---|
| Person does | Reads a short plain-English summary; accepts T&Cs and privacy policy | `draft` |
| System / agent does | Stores which version was accepted and when | `draft` |
| Feels | Wants to know what happens to recordings | `draft` |
| Guardrail | Health data needs explicit, separate consent (UK GDPR). Here, or in first-login config? | `question` |


### SU-5 Verifies email

| Lane | Card | Status |
|---|---|---|
| Person does | Opens the email and taps the link | `draft` |
| System / agent does | Verifies; link expires after a set time; resend option | `draft` |
| Feels | Small drop-off risk if the email is slow or in spam | `draft` |
| Guardrail | Link opens straight into the first-login flow, already signed in | `idea` |


## 2. First login

Sign in, configure permissions and data sources, land on Hello world.


### FL-1 Logs in or validates email

| Lane | Card | Status |
|---|---|---|
| Person does | Arrives signed in from the email link, or logs in | `draft` |
| System / agent does | Starts onboarding; resumes where they left off if they quit midway | `draft` |
| Feels | Ready to get going | `draft` |
| Guardrail | Never re-ask details already given | `draft` |


### FL-2 Config: privacy and data

| Lane | Card | Status |
|---|---|---|
| Person does | Sees what's stored, where, and for how long; gives explicit consent for health data | `draft` |
| System / agent does | Stores this consent separately; withdrawable any time in settings | `draft` |
| Feels | Reassured, if it's short and clear | `draft` |
| Guardrail | Explicit, granular, withdrawable consent. Data stays on their account | `draft` |


### FL-3 Config: microphone

| Lane | Card | Status |
|---|---|---|
| Person does | Allows the mic for voice check-ins. Separately chooses whether the app listens during the day | `draft` |
| System / agent does | Requests browser mic permission; two separate toggles: check-in voice, day capture | `draft` |
| Feels | Curiosity on what the agent may ask. | `question` |
| Guardrail | Day capture off by default, visible recording indicator. How do we handle other people being recorded? | `question` |


### FL-4 Config: connect Bee · optional

| Lane | Card | Status |
|---|---|---|
| Person does | Skips, or connects their Bee account | `draft` |
| System / agent does | Runs Bee sign-in and checks the connection | `draft` |
| Feels | Neutral; Bee owners pleased it just works | `draft` |
| Guardrail | If neither day capture nor Bee is on, explain check-ins need one of them, and allow setting it up later | `idea` |


### FL-5 Hello world

| Lane | Card | Status |
|---|---|---|
| Person does | Sees home: Start check-in and Dashboard | `draft` |
| System / agent does | Schedules the first check-in for tomorrow, once a day of data exists | `draft` |
| Feels | "What now?" Ready to start day 1 | `question` |
| Guardrail | Say clearly the first check-in is tomorrow. Offer to set a reminder time | `idea` |


## 3. Task: Check-in

Hello world to finished task. The episodic-recall skill runs in sync, by voice.


### CI-1 Hello world

| Lane | Card | Status |
|---|---|---|
| Person does | Opens the app, or taps the daily reminder | `draft` |
| System / agent does | Checks yesterday has enough captured conversation (Bee or day capture) | `draft` |
| Feels | Curious, a little nervous | `draft` |
| Guardrail | If there isn't enough data, say so and don't start | `draft` |


### CI-2 Taps Start

| Lane | Card | Status |
|---|---|---|
| Person does | Taps Start & follows start instructions | `draft` |
| System / agent does | Opens a voice session; quick mic check | `draft` |
| Feels | Committed | `draft` |
| Guardrail | A clear Stop button, visible the whole time | `draft` |


### CI-3 Skill starts · *inside skill* · in sync

| Lane | Card | Status |
|---|---|---|
| Person does | Waits a moment | `draft` |
| Person does | sees the visual cue on screen to indicate that recording is in progress | `idea` |
| System / agent does | Calls the episodic-recall skill: picks the window, builds the answer key silently | `draft` |
| Feels | Waiting with nothing happening. How long is acceptable? | `question` |
| Guardrail | Build the answer key overnight so Start is instant. Never show window content | `idea` |


### CI-4 Free recall · *inside skill* · 2–4 min, voice

| Lane | Card | Status |
|---|---|---|
| Person does | Talks through their day, covers the highs, lows and feels | `draft` |
| System / agent does | Listens without reacting; transcribes for scoring | `draft` |
| Feels | Fulfilment - like the user has somebody to listen | `question` |
| Guardrail | Never leak answers. Stop if distressed | `draft` |


### CI-5 Ends the skill · *inside skill* · ~1 min

| Lane | Card | Status |
|---|---|---|
| Person does | wraps up the task, ends the flow | `draft` |
| System / agent does | connects to users database to send the context required for future days | `draft` |
| System / agent does | reassures the user and tee's up tomorrows conversation | `idea` |
| Feels | like they've taken a load off. interested in next steps | `draft` |
| Guardrail | No labels or diagnosis. Baseline only after 1 sessions | `draft` |


### CI-6 Task finishes

| Lane | Card | Status |
|---|---|---|
| Person does | Optionally hears the missed items; returns to Hello world | `draft` |
| System / agent does | Ends the session; deletes transcripts and working files | `draft` |
| Feels | Satisfied, or concerned | `draft` |
| Guardrail | GP suggestion only if the trend flag says so. Other people's speech never stored | `draft` |


## 4. Task: Summary

Hello world to the dashboard. v1 shows the score trend only.


### SM-1 Hello world

| Lane | Card | Status |
|---|---|---|
| Person does | Taps Dashboard | `draft` |
| System / agent does | Loads their past sessions | `draft` |
| Feels | Curious about progress | `draft` |
| Guardrail | — | |


### SM-2 Opens dashboard

| Lane | Card | Status |
|---|---|---|
| Person does | Sees their score trend over time | `draft` |
| System / agent does | Plots each session's score against their own baseline band | `draft` |
| Feels | Engaged | `draft` |
| Guardrail | Before 5 sessions: show "Building your baseline (n of 5)" and no band | `draft` |


### SM-3 Reads the trend

| Lane | Card | Status |
|---|---|---|
| Person does | Taps a point to see date and score | `draft` |
| System / agent does | Mark sessions where they reported poor sleep or feeling unwell | `idea` |
| Feels | Reassured, or worried by a dip. How do we explain dips? | `question` |
| Guardrail | Descriptive words only; never "decline" or "impaired" | `draft` |


### SM-4 Leaves

| Lane | Card | Status |
|---|---|---|
| Person does | Returns home or closes the app | `draft` |
| System / agent does | — | |
| Feels | — | |
| Guardrail | Parked for later: session history, confounders view, export for GP | `idea` |

