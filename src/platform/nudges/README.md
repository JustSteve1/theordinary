# Nudges

Nudges are short, specific, positive notes about a member's own pattern. A saved check-in, an experiment marked done, or the morning cron can make a rule eligible. Each eligible rule is sent with its `send_probability` (0.8 for the starter rules) or held. Both outcomes are stored. Held rows are never shown.

The Home card shows the single highest-priority active nudge. The inbox at `/app/nudges` lists sends from the last 30 days. Thanks dismisses a nudge. Helpful and Not for me dismiss it and store that answer.

Neon is the source of truth. BigQuery receives rule ids, the coin flip, and timestamps. It does not receive rendered text or message parameters.

## Public interface

Other code imports `@/src/platform/nudges` only.

- `emitNudgeEvent({ type, userId, eventId })` after a check-in save or an experiment marked done. It logs and does not throw.
- `runScheduledNudges(now)` from the morning cron. `trigger_key` is the London date.
- `activeNudges(userId, limit)` and `nudgeHistory(userId, days)` for the UI. The first view of a pending nudge marks it shown.
- `recordNudgeInteraction(userId, nudgeId, action)` for shown, thanks, helpful, and not for me. The update is scoped to that member.
- `nudgesEnabledFor(userId)` is true only when the flag is on, health consent is present, and the member has not turned nudges off.
- `nudgeControls(userId)` and `saveNudgeSetting(userId, enabled)` back the settings toggle. A missing settings row means on.

`SignalSource` modules in `signals/` return numeric metrics. `Channel` modules in `channels/` render a nudge. Only `in_app` is registered.

## Add a rule

1. Add `nudges/rules/<id>.json` with a trigger (`checkin_saved`, `experiment_done`, or `daily_morning`), conditions (`all` / `any`, and `gte`, `lte`, `eq`, `in`, `between`), a message key, numeric `params`, `send_probability`, `cooldown_hours`, `priority`, and `expires_after_hours`.
2. Add a `title` and `body` to `nudges/copy/en.json`. Placeholders are `{snake_case}` and must be the same set as `params`. Parameters are numbers.
3. Import the JSON file in `src/platform/nudges/rules.ts` next to the other bundled imports.

A missing metric makes the condition false. The same member, rule, version, and trigger key insert once. Caps count sends only: two per London day, and one per category per London day. A hold still starts the cooldown.

## Add a signal or a channel

A signal is a file under `src/platform/nudges/signals/` that exports a `SignalSource` and is added to `signalSources` in `signals/index.ts`. It may read scores, sessions, decision points, or `loadWhoop`. It must not read talk text, narratives, or Bee text.

A channel is a file under `src/platform/nudges/channels/` registered in `channels/index.ts`. Email and push are not built. The in-app channel renders from the copy file at read time.

## Feature flag

`NUDGES_ENABLED=true` turns writers and UI on. Anything else, including unset, leaves them off. `NUDGE_SALT` must be at least 32 characters. Without it the engine logs and writes nothing. The coin flip is HMAC-SHA256 of `rule_id|version|user_id|trigger_key`.

The settings toggle is on by default once the flag is on. Turning it off stops new nudges for that member. Withdrawing health consent does the same, and the warehouse export skips that member.

## Remove the feature

Delete these, then the app builds and the other tests pass:

- `nudges/`
- `src/platform/nudges/`
- `src/features/nudges/`
- `src/journey/nudges.tsx`
- `app/app/nudges/`
- `app/api/cron/nudges-morning/`
- the `emitNudgeEvent` call in `src/features/check-in/actions.ts`
- the `emitNudgeEvent` call in `src/features/experiments/actions.ts`
- `<NudgeCard>` in `src/journey/home.tsx`
- the Nudges link in `src/journey/dashboard.tsx`
- `nudgeControls` in `src/journey/settings.tsx` and the nudges prop on `src/journey/settings-screen.tsx`
- the Nudges panel in `src/features/settings/settings-controls.tsx`
- the `/api/cron/nudges-morning` entry in `vercel.json`
- `app_nudges` in `src/platform/warehouse/tables.ts`
- `exportNudges`, `appNudgeRow`, `nudgeExportEligible`, and the `counts.app_nudges` line in `src/platform/warehouse/export.ts`
- the `"n_"` prefix on `opaqueId` in `src/platform/warehouse/member-key.ts`
- the `nudges` and `nudge_settings` statements in `src/platform/db.ts`
- `test:nudges` in `package.json` and the Nudge tests step in `.github/workflows/ci.yml`
- `NUDGES_ENABLED` and `NUDGE_SALT` in `.env.example`

Leave scoring, `loadWhoop`, and `loadBee` as they are.
