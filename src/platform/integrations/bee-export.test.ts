import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BeeSnapshot } from "@/src/platform/integrations/bee";
import {
  buildBeeExportPayload,
  exportBodyForKind,
  payloadHasScores,
  runBeeExport,
  taggedExportText,
  type BeeExportKind,
  type BeeWriteResult,
} from "@/src/platform/integrations/bee-export";
import { factsForDay } from "@/src/platform/scoring/bee-facts";

function snapshot(extra: Partial<BeeSnapshot> = {}): BeeSnapshot {
  return {
    status: "ok",
    timezone: "Europe/London",
    name: "Steve",
    via: "account",
    conversations: [],
    journals: [],
    dailies: [],
    facts: [],
    openTodos: [],
    ...extra,
  };
}

describe("Bee export firewall", () => {
  it("keeps only the spoken text, time, and target date", () => {
    const payload = buildBeeExportPayload({
      talkText: "  Monday was a cold day at the office  ",
      recordedAt: "2026-10-19T20:34:42.092Z",
      targetDate: "2026-10-18",
      ...( {
        accuracy: 87.5,
        richness: 62.8,
        probes: [{ id: "p1", question: "Did this happen?" }],
        bee_snapshot: [{ text: "secret fact" }],
        dimensions: [{ id: "people", display: 67 }],
      } as object),
    } as { talkText: string; recordedAt: string; targetDate: string | null });

    assert.deepEqual(Object.keys(payload).sort(), [
      "recordedAt",
      "targetDate",
      "text",
    ]);
    assert.equal(payload.text, "Monday was a cold day at the office");
    assert.equal(payloadHasScores(payload), false);

    const tagged = taggedExportText(payload);
    assert.match(tagged, /^Check-in from The Ordinary \(2026-10-18\): /);
    assert.ok(tagged.includes("Monday was a cold day at the office"));
    assert.equal(tagged.includes("87.5"), false);
    assert.equal(tagged.includes("Did this happen?"), false);
    assert.equal(tagged.includes("secret fact"), false);

    const factBody = exportBodyForKind("fact", tagged);
    assert.deepEqual(Object.keys(factBody).sort(), ["confirmed", "text"]);
    assert.equal(factBody.confirmed, true);
    assert.equal(factBody.text, tagged);
  });
});

describe("Bee export idempotency", () => {
  it("does not POST twice after a successful save", async () => {
    const payload = buildBeeExportPayload({
      talkText: "cold day at the office",
      recordedAt: "2026-10-19T20:34:42.092Z",
      targetDate: "2026-10-18",
    });
    const posts: BeeExportKind[] = [];
    const post = async (kind: BeeExportKind): Promise<BeeWriteResult> => {
      posts.push(kind);
      return { http: 201, body: { id: 55 } };
    };

    const first = await runBeeExport({
      payload,
      existing: null,
      preferredKind: null,
      now: "2026-10-19T20:34:42.092Z",
      post,
    });
    assert.equal(first.posted, true);
    assert.equal(first.record.status, "ok");
    assert.equal(first.record.kind, "journal");
    assert.equal(first.record.remoteId, "55");
    assert.deepEqual(posts, ["journal"]);

    const second = await runBeeExport({
      payload,
      existing: first.record,
      preferredKind: "journal",
      post,
    });
    assert.equal(second.posted, false);
    assert.equal(second.record.status, "ok");
    assert.deepEqual(posts, ["journal"]);
  });

  it("falls through to a fact when journals and conversations refuse", async () => {
    const payload = buildBeeExportPayload({
      talkText: "evening with my wife",
      recordedAt: "2026-10-19T20:34:42.092Z",
      targetDate: "2026-10-18",
    });
    const posts: BeeExportKind[] = [];
    const first = await runBeeExport({
      payload,
      existing: null,
      preferredKind: null,
      post: async (kind) => {
        posts.push(kind);
        if (kind === "journal") {
          return { http: 404, body: null };
        }
        if (kind === "conversation") {
          return { http: 405, body: null };
        }
        return { http: 200, body: { id: 9001 } };
      },
    });
    assert.deepEqual(posts, ["journal", "conversation", "fact"]);
    assert.equal(first.record.kind, "fact");
    assert.equal(first.record.status, "ok");
    assert.equal(first.lockedKind, "fact");
  });
});

describe("Ordinary echoes stay out of scoring", () => {
  it("drops Bee items tagged as Ordinary check-ins from factsForDay", () => {
    const bee = snapshot({
      conversations: [
        {
          startMs: Date.parse("2026-10-18T12:00:00Z"),
          summary: "Check-in from The Ordinary (2026-10-18): cold office",
          detail: "Monday today We started for slow",
        },
        {
          startMs: Date.parse("2026-10-18T18:38:40Z"),
          summary: "Bakerloo Train Platform Safety Announcements",
          detail: "A Bakerloo line train to Queen’s Park arrived",
        },
      ],
      journals: [
        {
          startMs: Date.parse("2026-10-18T21:00:00Z"),
          summary: "Check-in from The Ordinary (2026-10-18): evening with my wife",
          detail: "dinner and chicken",
        },
      ],
      facts: ["Check-in from The Ordinary (2026-10-18): should not score"],
    });

    const facts = factsForDay(bee, "2026-10-18");
    assert.ok(facts.length > 0);
    for (const fact of facts) {
      assert.equal(fact.text.includes("Check-in from The Ordinary"), false);
      assert.equal(fact.text.includes("cold office"), false);
    }
    assert.ok(
      facts.some((fact) => /bakerloo|platform|queen/i.test(fact.text)),
    );
  });
});
