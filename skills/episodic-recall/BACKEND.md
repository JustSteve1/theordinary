# Ordinary backend

This folder is the spec. The membership server does not shell out to the Python scripts and it cannot call Bee MCP. The TypeScript port lives in `lib/skills/episodic-recall/`.

A member check-in is a row in `skill_sessions`. Transcripts are accepted only after consent, used to build the answer key, and then deleted. The stored result has scores and conversation ids, not what anyone said.

The machine that runs Bee polls `GET /api/skills/worker?email=` with `Authorization: Bearer $BEE_SYNC_SECRET`. For each session in `awaiting_capture` it posts yesterday's daily summary and conversations to `POST /api/skills/worker/capture`. After a score, the same poll returns `facts`. The worker calls `bee_create_fact`, confirms it, then `POST /api/skills/worker/facts/ack`.

Later skills use the same session, result, and outbox tables. Add the skill id to `lib/skills/registry.ts`.
