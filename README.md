# The Ordinary

A daily voice check-in. You talk through yesterday. The app already knows parts of that day, because **Bee** heard it and WHOOP measured it, and it scores what you remembered against your own baseline.

Bee is the memory. The server calls the [Bee developer API](https://docs.bee.computer/) at runtime for profile, conversations, journals, daily summaries, facts, and todos. Locally those calls go through the [Bee CLI](https://github.com/bee-computer/bee-cli) proxy (`bee login`, then `bee proxy`). The call site is [`src/platform/integrations/bee.ts`](src/platform/integrations/bee.ts).

The membership chat is **Amazon Bedrock**. [`src/platform/integrations/nova.ts`](src/platform/integrations/nova.ts) sends `ConverseCommand` from `@aws-sdk/client-bedrock-runtime` to Amazon Nova Lite. The model sees a short brief and the recent thread. It does not write back to Bee or WHOOP, and it does not diagnose.

Live site: [theordinary.club](https://theordinary.club).

Notes from building the Bee and Bedrock paths: [`docs/hackathon/friction-log.md`](docs/hackathon/friction-log.md).

## Built with

| Tool | What it does here |
| --- | --- |
| Bee CLI (`@beeai/cli`) and the Bee developer API | Read the member's Bee account. Write a check-in back as a journal, a conversation, or a confirmed fact. |
| Amazon Bedrock Runtime | Nova Lite answers the membership chat. |
| WHOOP developer API | OAuth, then recovery, sleep, strain, and workouts. |
| Neon Postgres | Accounts, check-ins, scores, Bee token, WHOOP connection. |
| Resend | Verification and password-reset mail in production. |
| Web Speech API | The phone check-in, including Safari. |
| BigQuery, Dataform, Vercel OIDC | Analysis warehouse in `europe-west2`. Pages do not read it. |

## Run it

You need Node 20+, pnpm 9, and Postgres.

```bash
pnpm install
cp .env.example .env.local
```

In `.env.local` set:

- `DATABASE_URL` to a Postgres connection string
- `SESSION_SECRET` to at least 16 characters

Then:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first local account comes from `USER1_EMAIL`, `USER1_NAME`, and `USER1_PASSWORD`. A hosted deploy does not seed that account.

Put real keys in `.env.local` or on the Vercel project. `.env.local` is gitignored. Do not commit them.

### Bee, so a judge can see live data

1. Install the [Bee app](https://www.bee.computer/), update it, and turn on Developer Mode (Settings, tap the version five times). On Android, pair a Bee device first or that row stays hidden.
2. Install the CLI and sign in. The connect link expires in about five minutes.

```bash
npm install -g @beeai/cli
bee login
bee proxy
```

3. Leave `BEE_PROXY_URL=http://127.0.0.1:8787` in `.env.local`.
4. In the app, finish signup and health consent, then choose **Connect Bee**. The server reads the proxy when the account has no saved token. The dashboard and the chat then use that Bee data.

If `bee login` hangs because the machine has no system keychain:

```bash
BEE_FORCE_FILE_STORE=1 bee login
```

To keep Bee attached to the account rather than the machine, paste a bearer token on the Connections panel. Production calls `https://app-api-developer.ce.bee.amazon.dev` with that token and Bee's bundled private CA.

Without Bee, the app still runs. Day capture can stand in for a connected wearable. Accuracy is null when there is no Bee snapshot to score against. It is not stored as zero.

### WHOOP and Bedrock

WHOOP needs `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and `WHOOP_REDIRECT_URI` from a WHOOP developer app. The connect button is on the dashboard.

Chat needs `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`. The model is `amazon.nova-lite-v1:0` unless `BEDROCK_MODEL_ID` is set. The IAM user needs `bedrock:InvokeModel` on that model id.

## What you should see

Sign up, consent, connect Bee, and talk through yesterday at `/home`. The wrap-up shows Accuracy and Richness as separate numbers, then a mood tap. `/app` is the membership week: the score, the day card, Connections, and chat. `/app/chat` answers from the Bee and WHOOP brief. The stage script is [`docs/warehouse/HACKATHON-DEMO.md`](docs/warehouse/HACKATHON-DEMO.md).

## Tests

```bash
pnpm lint
pnpm test:scoring
pnpm test:warehouse
pnpm build
```

`pnpm test:scoring` includes the Bee export firewall: the payload is the talk text only, Ordinary-tagged echoes are dropped, and a successful export is not posted twice.

`pnpm test:warehouse` checks the speech firewall, WHOOP paging and webhook signature, the experiment randomiser, and the effect estimator on synthetic data.

The Python session contract is `python3 -m unittest test_log_session.py` from `skills/episodic-recall`.

## Engineering map

This section is the map of the code. Product intent for the check-in lives in [`docs/recall/`](docs/recall/README.md). The warehouse runbook is [`docs/warehouse/RUNBOOK.md`](docs/warehouse/RUNBOOK.md).

### Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, near-black shell, system font, `#0a84ff` as the action colour |
| Package manager | pnpm 9.15.9 |
| Runtime | Node 20+ (CI uses 20) |
| Data | Postgres via the `postgres` package. Schema is applied on first connect in [`src/platform/db.ts`](src/platform/db.ts) |
| Auth | Password accounts. `ordinary_session` httpOnly cookie, 30-day max age, `sameSite=lax` |
| Mail | Resend in production. Missing `RESEND_API_KEY` or `EMAIL_FROM` fails closed; local prints the link |
| Host | Vercel (`vercel.json` pins `pnpm install --frozen-lockfile` and `pnpm build`) |
| CI | GitHub Actions: Python session-record contract, scoring tests, lint, production build, high-severity audit |

No passkeys. No ORM. Queries are tagged-template SQL.

### Layout

```
app/                         Next routes and API handlers
src/features/                Account, check-in, chat, onboarding, integrations, settings, demo
src/journey/                 Route-level screens composed from features
src/platform/                Session, members, db, scoring, integrations, warehouse, experiments
skills/episodic-recall/      Scoring config, methodology companion, Python session contract
warehouse/                   Bootstrap, Dataform, Kedro catalog, Chronos-2 forecast job
docs/recall/                 Screen pack and journey map
docs/hackathon/              Submission friction log
```

`src/platform` is the durable core. Features call it. The chat does not grow a private copy of Bee or WHOOP. Adding a connected account means a `ContextSource` in [`src/features/integrations/registry.ts`](src/features/integrations/registry.ts).

### What is built

**Accounts.** Sign-up, terms, email verify, login, password reset. Accounts stay pending until the verify link is opened. Health-data consent is a separate onboarding step and is required before a check-in is stored.

**Voice check-in.** Home starts a talk; the copy frames it as an evening ritual, three minutes about yesterday. At wrap-up one tap records mood (1 low to 5 great) on `recall_sessions.mood`. Mood is an outcome, exported as the `recall.mood` feature, and never a scoring input. Capture is browser speech recognition, with work to keep Safari on iPhone listening and to keep the last words when the recogniser restarts. The spoken text is stored as `talk_text`. Follow-up turns are stored with the talk. Probe yes/no answers are stored on the check-in row, not in the chat transcript.

**Scoring.** Two independent metrics, Accuracy and Richness, from a config-driven lexical pipeline. v1 of the matcher is frozen and still written on every check-in so later scorers can be compared. v2 reads [`skills/episodic-recall/scoring.config.v2.json`](skills/episodic-recall/scoring.config.v2.json). The JSON is hashed into each run. A config change produces new `score_runs` without rewriting the talk. The first three non-empty check-ins are marked practice and stay off the trend. A yes/no probe round can run after free recall. A semantic matcher exists behind a flag and is off.

**Dashboard.** Membership week at `/app`, trend bands, the latest score with dimension "why" text, Connections, settings, and chat.

**Chat.** Amazon Nova Lite on Bedrock (`ConverseCommand`, 20s abort, last 16 turns). The model sees a composed member record. Instructions tell it to treat that record as source of truth.

**Connections.** Bee and WHOOP. Bee uses a bearer token in `integration_secrets`, or the local `bee proxy` when no token is saved. WHOOP is OAuth. Tokens live in `connections`. Apple Health is not a connection. Health consent is the gate on check-ins.

**Bee recordings.** Conversations and journals are read into the member snapshot. After a check-in saves, the spoken text is posted back (journal, then conversation, then a confirmed fact). The first path that works is locked for the account. Scores and probes stay here. Echoes tagged `Check-in from The Ordinary` are stripped before scoring and chat.

**Nudges and rewards.** In-app notes, each tagged with a `domain` (`health` from WHOOP signals, `mindset` from check-in and Bee signals) and a `kind` (`reinforcement` or `reward`). Reinforcements mark a check-in streak, a high-recovery morning, or an experiment marked done. Rewards mark a richer recall, a recovery that rebounded on yesterday, and an evening mood above the member's recent evenings. Each matching rule is sent with probability 0.8 or held, and both outcomes are stored. Home and `/app/nudges` show sends only, on one shared day card. `NUDGES_ENABLED` defaults off. Rules and copy live in [`nudges/`](nudges). The module notes are in [`src/platform/nudges/README.md`](src/platform/nudges/README.md).

**Experiments.** [`experiments/health-recovery-nudge.json`](experiments/health-recovery-nudge.json) and [`experiments/mindset-bee-nudge.json`](experiments/mindset-bee-nudge.json) are daily micro-randomised trials, one per domain, with `recall.mood` as the primary outcome. Each morning `experiments-decide` writes an arm per enrolled member; Home shows the instruction on the day card with Done and Skipped. A mindset treatment adds a one-line Bee anchor built from the already-scored latest check-in (entity names, never yesterday's answer key), rendered at request time and never stored or exported. `first-experiment.json` stays a `TODO` draft.

**Baseline.** The Chronos-2 Cloud Run job forecasts each member's next week of Accuracy and Richness from their history. After the forecast assertions pass, the Warehouse workflow calls `/api/cron/baseline-snapshot`, which copies the newest run into Neon `baseline_snapshots`. Home's "Your baseline" card draws the q10 to q90 band under the actual line from that Neon row. No page reads BigQuery.

### Decisions that shape the code

**Check-ins are immutable.** [`checkins`](src/platform/db.ts) freeze `talk_text` and the inputs used to score that talk. [`score_runs`](src/platform/db.ts) are unique on `(checkin_id, scorer_version, config_hash)` and insert with `on conflict do nothing`.

**Two metrics, never blended.** Accuracy and Richness are stored and shown as separate numbers. A missing Bee snapshot yields `accuracy = null`, not zero.

**Session log refuses speech.** [`skills/episodic-recall/log_session.py`](skills/episodic-recall/log_session.py) writes scores, confounders, and trend fields. CI asserts it rejects keys that look like transcripts, questions, or answer terms.

**TLS to Bee.** Direct calls go to `app-api-developer.ce.bee.amazon.dev` with Bee's private root CA ([`src/platform/integrations/bee-ca.ts`](src/platform/integrations/bee-ca.ts)). Locally, `BEE_PROXY_URL` (default `http://127.0.0.1:8787`) is the unauthenticated CLI proxy.

**Secrets vs OAuth.** Bee has no OAuth in this repo. The token stays in `integration_secrets`. WHOOP uses the `connections` table (access, refresh, expiry). Disconnecting Bee deletes Bee secrets, including the locked export kind.

**Stemmer and NER under tsx.** `snowball-stemmers` and `compromise` are loaded with `createRequire(import.meta.url)`. A default ESM import is `undefined` when tests run under `tsx`.

**Mail and launch gates.** Production verification mail does not pretend to send. `NEXT_PUBLIC_SITE_LAUNCHED` and an optional `SITE_PREVIEW_SECRET` gate the public site.

**Phone capture.** Safari on iPhone is a first-class check-in client: the talk control stays labelled while it counts, recognition is restarted without dropping the tail of the utterance, and a short talk is still saved.

**Defaults are isolated.** Journey defaults live in [`src/platform/recall/defaults.ts`](src/platform/recall/defaults.ts) so a product default can change without a redesign. When [`docs/recall/screens.md`](docs/recall/screens.md) and [`docs/recall/journey-map.md`](docs/recall/journey-map.md) disagree, the map wins and the conflict stays in [`docs/recall/open-decisions.md`](docs/recall/open-decisions.md).

## Warehouse

Analysis lives in BigQuery in London (`europe-west2`, project `the-ordinary-512212`). Neon stays the source of truth. Pages do not read BigQuery. Speech, names, emails, and member UUIDs stay out of the warehouse. Members are `member_key`, an HMAC of the account id. The runbook is [`docs/warehouse/RUNBOOK.md`](docs/warehouse/RUNBOOK.md). The feature list is [`docs/warehouse/features.md`](docs/warehouse/features.md).

Nightly schedules are UTC. Sunday 25 Oct 2026 is the morning these UTC minutes become the London minutes; until then London is one hour ahead. WHOOP sync is 06:45 UTC, experiment decisions are 07:15 UTC, morning nudges are 07:30 UTC, the app and Bee metadata export is 08:15 UTC, and Dataform runs at 09:40 and 11:40 UTC (spine, studies, effects_test, effects, then the Chronos-2 job, the forecast assertions, and the baseline snapshot when `FORECAST_JOB_ENABLED` is on). Vercel calls the four cron routes with `Authorization: Bearer $CRON_SECRET`; the workflow calls `/api/cron/baseline-snapshot` with the same secret. Hobby and Pro both allow these once-a-day schedules, so they stay as four routes. A cron that does nothing answers `{ "skipped": true, "reason": "..." }` so a quiet morning is explained, not silent.

Vercel production reaches BigQuery with Workload Identity Federation, not a service-account key. GitHub Actions uses the same pattern for the Dataform account. Local scripts impersonate with `WAREHOUSE_IMPERSONATE` and Application Default Credentials. A Kedro project at [`warehouse/kedro`](warehouse/kedro) is the local catalog: a plain run stays off BigQuery, and `--env=prod --pipelines=land_user1` is what writes raw rows before this is deployed.

New env vars: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `BQ_LOCATION`, `MEMBER_KEY_SECRET`, `CRON_SECRET`, `EXPERIMENT_SALT`, `NUDGES_ENABLED`, `NUDGE_SALT`. `WAREHOUSE_IMPERSONATE` is local only. GitHub repository variables: `FORECAST_JOB_ENABLED` (`true` once the `ordinary-forecast` Cloud Run job exists) and `APP_URL` (`https://theordinary.club`); repository secret `CRON_SECRET` matches Vercel's.

### Routes

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Create account | `/signup` |
| Terms | `/signup/terms` |
| Check your email | `/signup/verify` |
| Email link | `/verify` |
| Log in | `/login` |
| Privacy / health consent | `/welcome/privacy` |
| Microphone | `/welcome/microphone` |
| Connect Bee | `/welcome/bee` |
| Home (check-in) | `/home` |
| Before you start | `/checkin` |
| Live check-in | `/checkin/live` |
| Wrap-up | `/checkin/done` |
| Membership, Connections, scores | `/app` |
| Chat | `/app/chat` |
| Nudges inbox | `/app/nudges` |
| Settings | `/settings` |
| WHOOP OAuth | `/api/whoop/connect`, `/callback`, `/disconnect` |
| WHOOP webhook | `/api/whoop/webhook` |
| Nightly warehouse | `/api/cron/whoop-sync`, `/api/cron/warehouse-export`, `/api/cron/experiments-decide` |
| Morning nudges | `/api/cron/nudges-morning` |
| Baseline snapshot (called by the Warehouse workflow) | `/api/cron/baseline-snapshot` |
| Hackathon demo | `/demo` |

### Data the scoring path cares about

- `checkins` — frozen talk and scoring inputs
- `score_runs` — v1.0.0 and 2.0.0 payloads
- `recall_sessions` / `recall_talks` — trend row plus narrative (narrative is not copied into `log_session`); `mood` and `mood_at` hold the wrap-up tap
- `baseline_snapshots` — the newest Chronos-2 run per member, copied from BigQuery for the Home card
- `integration_secrets` — Bee token, WHOOP app credentials, locked Bee export kind
- `connections` — WHOOP OAuth tokens

### Scripts

```bash
pnpm dev
pnpm lint
pnpm build
pnpm test:scoring
pnpm test:warehouse
pnpm test:nudges
pnpm warehouse:status
pnpm experiments:activate health-recovery-nudge
pnpm experiments:activate mindset-bee-nudge
pnpm experiments:end health-recovery-nudge
pnpm partner:sample-file barbara-dry-run
pnpm partner:import barbara-dry-run tmp/partner-barbara-dry-run.csv
pnpm forecast:run
pnpm demo:snapshot barbara-dry-run
pytest warehouse/forecast
```

`pnpm test:warehouse` checks the speech firewall, WHOOP paging and webhook signature, the experiment randomiser and the health and mindset definitions, the Bee anchor, the v2 monitoring protocol, partner-import validation, the demo access rule, the baseline band and the Home baseline snapshot (payload build, no speech, the workflow step order), and the effect estimator on synthetic data. `pnpm warehouse:status` prints pass, warn, or fail for the London readiness view, the Chronos-2 run age, exported nudges and decision points, active experiments by domain, the Neon baseline snapshot, and each sync stream. It does not pretend the warehouse is connected when the env vars are missing.

## Hackathon demo

One flow: evening check-in with a mood tap, morning pipelines to London, a health and a mindset experiment on the Home day card with Bee-anchored nudges and rewards, and a Chronos-2 baseline band on Home. The stage script is [`docs/warehouse/HACKATHON-DEMO.md`](docs/warehouse/HACKATHON-DEMO.md). The earlier one-member partner study (`barbara-dry-run`, `/demo`) is the second act. The BARBARA marker brief is [`docs/warehouse/BARBARA-BRIEF.md`](docs/warehouse/BARBARA-BRIEF.md).

**Baseline band.** [`warehouse/forecast`](warehouse/forecast) is a Cloud Run job in London that asks Chronos-2 to forecast the last 7 days of each daily measure from every day before, and writes `ordinary_effects.forecasts` with a load job. The Warehouse workflow runs it after Dataform when `FORECAST_JOB_ENABLED` is `true`, runs the `forecast` assertions, then calls `/api/cron/baseline-snapshot` so Home draws the band from Neon. `pnpm forecast:run` starts the job by hand. `pnpm demo:snapshot` attaches the same bands to `/demo`. Fourteen or more days of history is a full band, 5 to 13 is a lighter early estimate, fewer shows a message. The pandas logic is tested with `pytest warehouse/forecast` in CI without torch. The model is pinned by commit and baked into the image, so the job makes no network calls except to BigQuery.

`pnpm test:nudges` checks the rule validator (including `domain` and `kind`), the randomised send or hold, the London-day caps, the recovery-rebound and mood-lift reward signals, and that an exported nudge row has no message text.

The Python session contract is `python3 -m unittest test_log_session.py` from `skills/episodic-recall`.

`pnpm audit --audit-level=high` ignores one advisory by id in `package.json` (`pnpm.auditConfig.ignoreGhsas`): `braces` ≤3.0.3 (GHSA-vfj7-8cjw-p6xm) is pulled in by `eslint-config-next` at lint time only and no patched release exists. Remove the ignore when `eslint-config-next` stops depending on it.

## License

[MIT](LICENSE). Copyright 2026 440Hz.
