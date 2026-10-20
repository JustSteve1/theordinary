import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCollection,
  parseWhoopWebhook,
  rowsForWebhook,
  signatureMatches,
  stripUserId,
  syncAllowed,
  tombstone,
  whoopSignature,
} from "@/src/platform/integrations/whoop-sync";

test("pagination follows next_token", async () => {
  const seen: string[] = [];
  const fetchImpl = async (url: string) => {
    seen.push(url);
    if (!url.includes("nextToken=")) {
      return Response.json({ records: [{ id: "a", user_id: 1 }], next_token: "page-2" });
    }
    return Response.json({ records: [{ id: "b", user_id: 2 }], next_token: "" });
  };
  const rows = await fetchCollection("token", "/v2/cycle", { start: "s", end: "e" }, fetchImpl);
  assert.equal(rows.length, 2);
  assert.equal(seen.length, 2);
  assert.match(seen[1], /nextToken=page-2/);
  assert.match(seen[0], /limit=25/);
});

test("429 retries then gives up", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
  };
  await assert.rejects(
    () => fetchCollection("token", "/v2/recovery", { start: "s", end: "e" }, fetchImpl),
    /429/,
  );
  assert.equal(calls, 6);
});

test("user_id is stripped from payloads", () => {
  const stripped = stripUserId({
    id: "sleep-1",
    user_id: 99,
    score: { userId: 99, recovery_score: 70 },
  }) as { user_id?: unknown; score: { userId?: unknown; recovery_score: number } };
  assert.equal(stripped.user_id, undefined);
  assert.equal(stripped.score.userId, undefined);
  assert.equal(stripped.score.recovery_score, 70);
});

test("webhook signature accepts a valid body and rejects a tampered one", () => {
  const secret = "whoop-test-secret";
  const timestamp = "1700000000000";
  const raw = JSON.stringify({
    user_id: 456,
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "sleep.updated",
    trace_id: "trace",
  });
  const signature = whoopSignature(secret, timestamp, raw);
  assert.equal(signatureMatches(secret, timestamp, raw, signature), true);
  assert.equal(signatureMatches(secret, timestamp, `${raw} `, signature), false);
});

test("delete events become tombstones", async () => {
  const fetchImpl = async () => Response.json({ cycle_id: 93845 });
  const deleted = await rowsForWebhook("token", { id: "sleep-uuid", type: "recovery.deleted" }, "member", fetchImpl);
  assert.equal(deleted?.table, "whoop_recovery");
  assert.equal(deleted?.row.deleted, true);
  assert.equal(deleted?.row.payload, null);
  assert.equal(deleted?.row.record_id, "93845");
  assert.deepEqual(tombstone("member", "workout-1").deleted, true);
});

test("recovery updates are loaded by cycle id after the sleep lookup", async () => {
  const fetchImpl = async (url: string) => {
    if (url.includes("/activity/sleep/")) {
      return Response.json({ id: "sleep-uuid", cycle_id: 93845, user_id: 5 });
    }
    return Response.json({
      cycle_id: 93845,
      sleep_id: "sleep-uuid",
      user_id: 5,
      score: { recovery_score: 44 },
    });
  };
  const updated = await rowsForWebhook(
    "token",
    { id: "sleep-uuid", type: "recovery.updated" },
    "member",
    fetchImpl,
  );
  assert.equal(updated?.table, "whoop_recovery");
  assert.equal(updated?.row.record_id, "93845");
  assert.equal((updated?.row.payload as { user_id?: unknown }).user_id, undefined);
});

test("members without consent are not synced", () => {
  assert.equal(syncAllowed({ consented: false, connected: true }), false);
  assert.equal(syncAllowed({ consented: true, connected: false }), false);
  assert.equal(parseWhoopWebhook({ user_id: 1, id: "abc", type: "sleep.updated" })?.type, "sleep.updated");
});
