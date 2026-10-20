You are working in `JustSteve1/theordinary` (Next.js 15 on Vercel, Neon Postgres, pnpm, TypeScript). We are adding an analysis warehouse in Google BigQuery so we can measure cause and effect between WHOOP data, Bee data, check-in scores and future experiments.

Before writing code, save this whole message to `.cursor/rules/warehouse.mdc` (with frontmatter `alwaysApply: true`) and to `docs/warehouse/PLAN.md`. Then stop and say "Context saved". Every later prompt assumes these rules.

**Fixed decisions**
- Google Cloud project: `the-ordinary-512212`. It already exists. Do not create a project.
- Region for everything: `europe-west2` (London). No data leaves this region. If a feature isn't available there, stop and ask. Never move or copy data to US or EU multi-region as a workaround.
- Warehouse: BigQuery. Transforms: Dataform (core v3, `workflow_settings.yaml`), run with `@dataform/cli` from GitHub Actions.
- Neon stays the app's source of truth. BigQuery is for analysis only. The app never reads BigQuery to render a page in this work.
- Backfill window: the last 30 days.
- Vercel → Google Cloud auth uses **Vercel OIDC federation** (Workload Identity Federation). GitHub Actions → Google Cloud uses **GitHub OIDC**. **Never create or download service-account keys.**
- Local development uses Application Default Credentials with service-account impersonation.

**Datasets** (all `europe-west2`)
- `ordinary_raw`: append-only landing tables (WHOOP JSON, app exports, Bee metadata)
- `ordinary_core`: deduplicated, aligned to member and local date
- `ordinary_features`: `features_daily`, `feature_registry`
- `ordinary_experiments`: exports of experiments and decision points
- `ordinary_effects`: outcome definitions, estimates, analysis runs
- `ordinary_effects_test`: synthetic data for validating estimators

**Privacy rules (non-negotiable)**
- **No speech in BigQuery.** Never send `talk_text`, narratives, answers, probe questions, transcripts, Bee summaries or details, fact text, clause text, evidence quotes or chat. This matches the existing contract in `skills/episodic-recall/log_session.py`. Score-run payloads contain `clauses` and `facts` with text: export only `metrics`, dimension levels, `flags` and `conditions`.
- Members appear in BigQuery only as `member_key` = hex HMAC-SHA256 of the member UUID using `MEMBER_KEY_SECRET`. No emails, names or Neon UUIDs.
- Only members with health consent (`consents.health_accepted_at` not null) are exported. Withdrawing consent or deleting the account erases that member from every warehouse table.
- WHOOP payload JSON is allowed (it contains no speech). Strip `user_id` from payloads before writing.

**Repo conventions to follow** (see `README.md`)
- No ORM. Tagged-template SQL with the `postgres` package. Neon schema changes are append-only `create table if not exists` / `alter table … add column if not exists` lines in `src/platform/db.ts`.
- Durable logic goes in `src/platform/`, UI in `src/features/`, routes in `app/`.
- **Do not change scoring.** Treat `src/platform/scoring/*` and `skills/episodic-recall/*` as read-only. Read their outputs only.
- Do not refactor `loadWhoop` or `loadBee`. Add new modules beside them.
- Tests run with `tsx --test`. Add a `test:warehouse` script and run it in CI next to `test:scoring`.
- `pnpm lint`, `pnpm build` and `pnpm audit --audit-level=high` must stay green.
- Server routes that touch BigQuery declare `export const runtime = "nodejs"` and a suitable `maxDuration`.
- One branch and PR per prompt. Update `README.md` (engineering map) and `docs/warehouse/` as you go.

**Write to BigQuery with load jobs, not streaming inserts.** Use newline-delimited JSON through `table.createWriteStream({ sourceFormat: "NEWLINE_DELIMITED_JSON" })`. Load jobs avoid the streaming buffer, which blocks `DELETE` for erasure. Raw tables are append-only. Deduplication happens in `ordinary_core`.

**Stop and ask me when:**
- an interactive login, a browser step or a console-only setting is needed
- billing is not enabled, or a permission is missing
- an API detail (WHOOP, Bee, BigQuery) differs from what a prompt assumes
- a choice would weaken the privacy rules or move data out of London
- any step would change scoring behaviour
