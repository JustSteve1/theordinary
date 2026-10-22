# The Ordinary

Member web app on Next.js. This file is the engineering map: runtime, layout, what is built, and the decisions that shape the code. Product intent lives in [`docs/recall/`](docs/recall/README.md).

Live site: [theordinary.club](https://theordinary.club). Hosted on Vercel. Production database is Neon (Postgres) over TLS.

Hackathon notes from building the Bee and Bedrock paths: [`docs/hackathon/friction-log.md`](docs/hackathon/friction-log.md).

## Stack

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

## Layout

```
app/                         Next routes and API handlers
src/features/                Account, check-in, chat, onboarding, integrations, settings
src/journey/                 Route-level screens composed from features
src/platform/                Session, members, db, scoring, integrations, warehouse, experiments
skills/episodic-recall/      Scoring config, methodology companion, Python session contract
docs/recall/                 Screen pack and journey map
```

`src/platform` is the durable core. Features call it; the chat does not grow a private copy of Bee or WHOOP. Adding a connected account means a `ContextSource` in [`src/features/integrations/registry.ts`](src/features/integrations/registry.ts).

## What is built

**Accounts.** Sign-up, terms, email verify, login, password reset. Accounts stay pending until the verify link is opened. Health-data consent is a separate onboarding step and is required before a check-in is stored.

**Voice check-in.** Home starts a talk. Capture is browser speech recognition, with work to keep Safari on iPhone listening and to keep the last words when the recogniser restarts. The spoken text is stored as `talk_text`. Follow-up turns are stored with the talk. Probe yes/no answers are stored on the check-in row, not in the chat transcript.

**Scoring.** Two independent metrics (Accuracy and Richness) from a config-driven lexical pipeline. v1 of the matcher is frozen and still written on every check-in so later scorers can be compared. v2 reads [`skills/episodic-recall/scoring.config.v2.json`](skills/episodic-recall/scoring.config.v2.json). The JSON is hashed into each run; a config change produces new `score_runs` without rewriting the talk. The first three non-empty check-ins are marked practice and stay off the trend. A yes/no probe round can run after free recall. A semantic matcher exists behind a flag and is off. Weights for a 3.0.0 scorer are proposed only when reliability gates in the config pass.

**Dashboard.** Membership week at `/app`, trend bands, the latest score with dimension “why” text, Connections, settings, and chat.

**Chat.** Amazon Nova Lite on Bedrock (`ConverseCommand`, 20s abort, last 16 turns). The model sees a composed member record (recent talks plus every registered integration). Instructions tell it to treat that record as source of truth.

**Connections.** Bee and WHOOP. Bee uses a bearer token in `integration_secrets` (or the local `bee proxy`). WHOOP is OAuth, tokens in `connections`, optional per-user app credentials. Apple Health is not a connection; health consent is the GDPR-style gate on check-ins.

**Bee recordings.** Conversations and journals are read into the member snapshot. After a check-in saves, the spoken text is posted back (journal, then conversation, then a confirmed fact — first path that works is locked for the account). Scores, probes, and scoring artifacts stay here. Echoes tagged `Check-in from The Ordinary` are stripped before scoring and chat.

## Engineering decisions

**Check-ins are immutable.** [`checkins`](src/platform/db.ts) freeze `talk_text` and the inputs used to score that talk. [`score_runs`](src/platform/db.ts) are unique on `(checkin_id, scorer_version, config_hash)` and insert with `on conflict do nothing`. Re-scoring is idempotent. The dashboard can fill missing runs on read.

**Config beats commentary.** [`scoring-methodology-v2.md`](skills/episodic-recall/scoring-methodology-v2.md) explains intent. When it disagrees with the JSON, the JSON wins. The server loads the JSON through a bundled import (`JSON.stringify` of the module) so the hash is the same in `tsx` tests and the Next server bundle.

**Two metrics, never blended.** Accuracy and Richness are stored and shown as separate numbers. A missing snapshot yields `accuracy = null`, not zero.

**Session log refuses speech.** [`skills/episodic-recall/log_session.py`](skills/episodic-recall/log_session.py) writes scores, confounders, and trend fields. CI asserts it rejects keys that look like transcripts, questions, or answer terms. The TypeScript `logSession` path follows the same contract.

**Integrations are a list, not a special case.** Chat context is `talksSource` plus `integrationSources`. Bee write-back is an integration concern (`src/platform/integrations/bee-export.ts`), not a scoring concern. A failed Bee push does not roll back the local check-in.

**Secrets vs OAuth.** Bee has no OAuth in this repo; the token stays in `integration_secrets`. WHOOP uses the `connections` table (access, refresh, expiry). Disconnecting Bee deletes Bee secrets, including the locked export kind.

**TLS to Bee.** Direct calls go to `app-api-developer.ce.bee.amazon.dev` with Bee’s private root CA ([`src/platform/integrations/bee-ca.ts`](src/platform/integrations/bee-ca.ts)). The public Bee endpoint is not used. Locally, `BEE_PROXY_URL` (default `http://127.0.0.1:8787`) is the unauthenticated CLI proxy.

**Stemmer and NER under tsx.** `snowball-stemmers` and `compromise` are loaded with `createRequire(import.meta.url)`. A default ESM import is `undefined` when tests run under `tsx`.

**Mail and launch gates.** Production verification mail does not pretend to send. `NEXT_PUBLIC_SITE_LAUNCHED` and an optional `SITE_PREVIEW_SECRET` gate the public site.

**Phone capture.** Safari on iPhone is a first-class check-in client: the talk control stays labelled while it counts, recognition is restarted without dropping the tail of the utterance, and a short talk is still saved.

**Defaults are isolated.** Journey defaults live in [`src/platform/recall/defaults.ts`](src/platform/recall/defaults.ts) so a product default can change without a redesign. When [`docs/recall/screens.md`](docs/recall/screens.md) and [`docs/recall/journey-map.md`](docs/recall/journey-map.md) disagree, the map wins and the conflict stays in [`docs/recall/open-decisions.md`](docs/recall/open-decisions.md).

## Warehouse

Analysis lives in BigQuery in London (`europe-west2`, project `the-ordinary-512212`). Neon stays the source of truth. Pages do not read BigQuery. Speech, names, emails, and member UUIDs stay out of the warehouse. Members are `member_key`, an HMAC of the account id. The runbook is [`docs/warehouse/RUNBOOK.md`](docs/warehouse/RUNBOOK.md). The feature list is [`docs/warehouse/features.md`](docs/warehouse/features.md).

Nightly schedules are UTC. Sunday 25 Oct 2026 is the morning these UTC minutes become the London minutes; until then London is one hour ahead. WHOOP sync is 06:45 UTC, experiment decisions are 07:15 UTC, the app and Bee metadata export is 08:15 UTC, and Dataform runs at 09:40 and 11:40 UTC. Vercel calls the three cron routes with `Authorization: Bearer $CRON_SECRET`. Hobby and Pro both allow these once-a-day schedules, so they stay as three routes. Each route returns quietly when the warehouse env vars are missing.

Vercel production reaches BigQuery with Workload Identity Federation, not a service-account key. GitHub Actions uses the same pattern for the Dataform account. Local scripts impersonate with `WAREHOUSE_IMPERSONATE` and Application Default Credentials. A Kedro project at [`warehouse/kedro`](warehouse/kedro) is the local catalog: a plain run stays off BigQuery, and `--env=prod --pipelines=land_user1` is what writes raw rows before this is deployed.

New env vars: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `BQ_LOCATION`, `MEMBER_KEY_SECRET`, `CRON_SECRET`, `EXPERIMENT_SALT`. `WAREHOUSE_IMPERSONATE` is local only.

## Routes

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
| Settings | `/settings` |
| WHOOP OAuth | `/api/whoop/connect`, `/callback`, `/disconnect` |
| WHOOP webhook | `/api/whoop/webhook` |
| Nightly warehouse | `/api/cron/whoop-sync`, `/api/cron/warehouse-export`, `/api/cron/experiments-decide` |

## Data the scoring path cares about

- `checkins` — frozen talk and scoring inputs
- `score_runs` — v1.0.0 and 2.0.0 payloads
- `recall_sessions` / `recall_talks` — trend row plus narrative (narrative is not copied into `log_session`)
- `integration_secrets` — Bee token, WHOOP app credentials, locked Bee export kind
- `connections` — WHOOP OAuth tokens

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Postgres must be reachable at `DATABASE_URL`. Set `SESSION_SECRET` to at least 16 characters. Locally, `USER1_EMAIL`, `USER1_NAME`, and `USER1_PASSWORD` seed the first member; a hosted deploy does not. Bee locally is `bee login` then `bee proxy` (`BEE_PROXY_URL`).

Env vars are listed in [`.env.example`](.env.example). Put production values on the Vercel project, not in this repo.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm build
pnpm test:scoring
pnpm test:warehouse
pnpm warehouse:status
pnpm experiments:activate first-experiment
pnpm experiments:end first-experiment
```

`pnpm test:scoring` runs the v2 scoring cases (including Tests A/B/C) and the Bee export firewall (payload is talk text only; Ordinary-tagged echoes are dropped; a successful export is not posted twice).

`pnpm test:warehouse` checks the speech firewall, WHOOP paging and webhook signature, the experiment randomiser, and the effect estimator on synthetic data. `pnpm warehouse:status` prints pass, warn, or fail. It does not pretend the warehouse is connected when the env vars are missing.

The Python session contract is `python3 -m unittest test_log_session.py` from `skills/episodic-recall`.
