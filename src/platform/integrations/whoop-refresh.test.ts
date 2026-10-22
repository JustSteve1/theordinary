import assert from "node:assert/strict";
import test from "node:test";

import type { Connection, WhoopConnectionTx } from "@/src/platform/integrations/store";
import {
  refreshWhoopConnection,
  type WhoopConfig,
} from "@/src/platform/integrations/whoop";
import { whoopRefreshSyncError } from "@/src/platform/integrations/whoop-sync";

const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const NOW = 1_700_000_000_000;

const config: WhoopConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "https://example.com/whoop",
};

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    userId: "member-1",
    provider: "whoop",
    providerUserId: "whoop-user",
    scopes: "offline read:recovery",
    accessToken: "access-old",
    refreshToken: "refresh-old",
    expiresAt: NOW - 120_000,
    ...overrides,
  };
}

function lockedStore(initial: Connection | null) {
  let row = initial;
  let tail = Promise.resolve();
  const lock = <T>(
    _userId: string,
    run: (current: Connection | null, tx: WhoopConnectionTx) => Promise<T>,
  ) => {
    const next = tail.then(() =>
      run(row, {
        save: async (nextRow) => {
          row = nextRow;
        },
        remove: async () => {
          row = null;
        },
        reread: async () => row,
      }),
    );
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  return {
    lock,
    read: () => row,
    replace(nextRow: Connection | null) {
      row = nextRow;
    },
  };
}

function deps(store: ReturnType<typeof lockedStore>, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  return {
    fetchImpl,
    now: () => NOW,
    config,
    lock: store.lock,
  };
}

test("a 500 from the token endpoint keeps the WHOOP row", async () => {
  const store = lockedStore(connection());
  let calls = 0;
  const result = await refreshWhoopConnection(
    connection(),
    deps(store, async (url) => {
      calls += 1;
      assert.equal(url, TOKEN_URL);
      return new Response("unavailable", { status: 500 });
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "temporary");
    assert.equal(whoopRefreshSyncError(result), "WHOOP token request failed (500).");
  }
  assert.equal(calls, 1);
  assert.equal(store.read()?.refreshToken, "refresh-old");
  assert.equal(store.read()?.accessToken, "access-old");
});

test("invalid_grant on the current refresh token deletes the row", async () => {
  const store = lockedStore(connection());
  const result = await refreshWhoopConnection(
    connection(),
    deps(store, async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "reconnect");
    assert.equal(whoopRefreshSyncError(result), "WHOOP needs to be connected again.");
  }
  assert.equal(store.read(), null);
});

test("invalid_grant after the stored token changed keeps the new row", async () => {
  const store = lockedStore(connection());
  const winner = connection({
    accessToken: "access-winner",
    refreshToken: "refresh-winner",
    expiresAt: NOW + 3_600_000,
  });
  const result = await refreshWhoopConnection(
    connection(),
    deps(store, async () => {
      store.replace(winner);
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }),
  );
  assert.deepEqual(result, { ok: true, accessToken: "access-winner" });
  assert.equal(store.read()?.refreshToken, "refresh-winner");
  assert.equal(store.read()?.accessToken, "access-winner");
});

test("two overlapping refreshes produce one WHOOP call", async () => {
  const store = lockedStore(connection());
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls += 1;
    assert.equal(url, TOKEN_URL);
    const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body ?? ""));
    assert.equal(body.get("refresh_token"), "refresh-old");
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.notEqual(body.get("refresh_token"), process.env.WHOOP_CLIENT_SECRET);
    await gate;
    return Response.json({
      access_token: "access-new",
      refresh_token: "refresh-new",
      expires_in: 3600,
      scope: "offline",
    });
  };
  const first = refreshWhoopConnection(connection(), deps(store, fetchImpl));
  const second = refreshWhoopConnection(connection(), deps(store, fetchImpl));
  await Promise.resolve();
  assert.equal(calls, 1);
  release?.();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, { ok: true, accessToken: "access-new" });
  assert.deepEqual(right, { ok: true, accessToken: "access-new" });
  assert.equal(calls, 1);
  assert.equal(store.read()?.refreshToken, "refresh-new");
});
