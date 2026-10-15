# Recall

A short daily voice check-in about yesterday. The `episodic-recall` skill builds an answer key from the day before, listens while you talk through that day, and scores what you remembered against your own baseline. The dashboard shows the trend. Recall is a personal wellness tool. It is not a medical device and it never diagnoses anything.

This is MVP 1 of that journey, on the Ordinary stack.

## How it sits on this stack

- Next.js 15 App Router, TypeScript, Tailwind CSS v4, pnpm
- Members in Postgres (`DATABASE_URL`), signed in with the `ordinary_session` cookie
- Bee is optional. When the local Bee proxy answers, a member can connect it instead of, or as well as, day capture
- The membership week stays at `/app`. It is not the Recall home

Journey source, in the order to read it:

| Doc | Use it for |
| --- | --- |
| [docs/recall/README.md](docs/recall/README.md) | Pack overview and definition of done |
| [docs/recall/journey-map.md](docs/recall/journey-map.md) | Intent, stage by stage |
| [docs/recall/screens.md](docs/recall/screens.md) | Routes, states, skill contract |
| [docs/recall/content-and-guardrails.md](docs/recall/content-and-guardrails.md) | Tone, forbidden words, consent, accessibility |
| [docs/recall/open-decisions.md](docs/recall/open-decisions.md) | Defaults D1–D13 |

When the screen spec and the journey map disagree, the map wins and the conflict stays listed in the open decisions. Build with the default. Each default lives in [`src/platform/recall/defaults.ts`](src/platform/recall/defaults.ts) so it can change without a redesign.

## Visual language

Recall uses the same macOS dark materials as the rest of the product: near-black `#0a0a0a`, the system font, about 10px corners, and system blue `#0a84ff` as the only action colour.

On Recall screens the pack’s reading rules sit on top of that:

- Body text at least 18px, line height at least 1.5
- Contrast at least 4.5:1 for text and 3:1 for controls
- Tap targets at least 48px
- State is never colour alone
- Animations respect `prefers-reduced-motion`

## Build order

1. Shared shell, tokens, buttons, recording indicator, and the voice-session states on a mock skill
2. Sign-up: S-01 to S-05
3. First login: S-06 to S-09, then S-10 Home
4. Check-in: S-11 to S-13 against the mock
5. Dashboard: S-14, including sample trends of 0, 3, 5, and 12 sessions
6. Settings: S-15

Accounts stay pending until the email link is opened. In development that link is shown on the check-your-email screen. `sendVerificationEmail` is the seam for a real sender. Passkeys are off. This stack is password-only.

## Routes

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Create account | `/signup` |
| Terms summary | `/signup/terms` |
| Check your email | `/signup/verify` |
| Email link | `/verify` |
| Log in | `/login` |
| Your data and privacy | `/welcome/privacy` |
| Microphone | `/welcome/microphone` |
| Connect Bee | `/welcome/bee` |
| Home | `/home` |
| Before you start | `/checkin` |
| Live check-in | `/checkin/live` |
| Wrap-up | `/checkin/done` |
| Dashboard | `/dashboard` |
| Settings | `/settings` |

`/app` is the existing membership week.

## Out of scope for v1

Session history list, confounders view, export for a GP, carers or supporters, native apps, text-chat check-ins, cued recall, and recognition tests.

Also not in this pass: the real `episodic-recall` runtime, a nightly answer-key job, day-capture audio, analytics, and outbound mail.

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Postgres must be reachable at `DATABASE_URL`. The schema is created on first use. Set `SESSION_SECRET` to at least 16 characters. `USER1_EMAIL`, `USER1_NAME`, and `USER1_PASSWORD` still seed the first member. Bee, when you want it, is `BEE_PROXY_URL` (default `http://127.0.0.1:8787`).

## Scripts

```bash
pnpm dev
pnpm lint
pnpm build
```
