import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { botIcon } from "./avatar";
import {
  chatLink,
  loadRoster,
  parseRoster,
  persistenceFilename,
} from "./roster";

test("encodes Grok persistence filenames with unpadded Base32", () => {
  assert.equal(persistenceFilename("foo"), "mzxw6.blob");
  assert.equal(persistenceFilename("foobar"), "mzxw6ytboi.blob");
  assert.equal(
    persistenceFilename("sand.client.slice.client-meta.account-slot"),
    "onqw4zbomnwgszlooqxhg3djmnss4y3mnfsw45bnnvsxiyjomfrwg33vnz2c243mn52a.blob",
  );
});

test("indexes visible sidebar bots and groups in activity order, keeping duplicate names", () => {
  const bots = parseRoster({
    schemaVersion: 4,
    value: {
      rows: [
        { id: "one", name: "Same", lastActivityAt: 1 },
        { id: "two", name: "Same", lastActivityAt: 2, isGroup: true },
        { id: "hidden", isHiddenFromSidebar: true },
        { id: "removed", isRemovedFromSidebar: true },
        { id: "bad/id", name: "Invalid" },
      ],
    },
  });
  assert.deepEqual(
    bots.map((bot) => bot.id),
    ["two", "one"],
  );
  assert.equal(bots[0].isGroup, true);
});

test("rejects unsupported cache versions instead of using an incorrect roster", () => {
  assert.throws(
    () => parseRoster({ schemaVersion: 5, value: { rows: [] } }),
    /Unsupported/,
  );
  assert.throws(
    () => parseRoster({ schemaVersion: 4, value: {} }),
    /Unsupported/,
  );
});

test("puts pinned bots first and sorts both groups by most recent activity", () => {
  const bots = parseRoster(
    {
      schemaVersion: 4,
      value: {
        rows: [
          { id: "recent", name: "Recent", lastActivityAt: 40 },
          { id: "old-pin", name: "Old pin", lastActivityAt: 10 },
          { id: "new-pin", name: "New pin", lastActivityAt: 20 },
          { id: "older", name: "Older", lastActivityAt: 30 },
        ],
      },
    },
    ["old-pin", "new-pin"],
  );
  assert.deepEqual(
    bots.map((bot) => bot.id),
    ["new-pin", "old-pin", "recent", "older"],
  );
});

test("preserves custom avatars and matches Grok Bot's default avatar assignments", () => {
  const bots = parseRoster({
    schemaVersion: 4,
    value: {
      rows: [
        {
          id: "custom",
          name: "Custom",
          avatarShape: "clover",
          avatarColor: "red",
        },
        { id: "one" },
        { id: "two" },
      ],
    },
  });
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  assert.deepEqual(botIcon(byId.get("custom")!, tmpdir()), {
    source: "bot-avatars/clover.svg",
    tintColor: { light: "#FF3E51", dark: "#E02135" },
  });
  const expected = {
    one: "teardrop",
    two: "wedge",
  };
  for (const [id, shape] of Object.entries(expected)) {
    assert.equal(
      (botIcon(byId.get(id)!, tmpdir()) as { source: string }).source,
      `bot-avatars/${shape}.svg`,
    );
  }
});

test("uses only the currently selected account, including URI-encoded account keys", async () => {
  const folder = await mkdtemp(join(tmpdir(), "raycast-grok-"));
  const persistence = join(folder, "sand-client-persistence");
  await mkdir(persistence);
  const write = (key: string, value: unknown) =>
    writeFile(
      join(persistence, persistenceFilename(key)),
      JSON.stringify(value),
    );
  try {
    await write("sand.client.slice.client-meta.account-slot", {
      schemaVersion: 1,
      value: "google-oauth2|test",
    });
    await write(
      "sand.client.slice.account.google-oauth2%7Ctest.roster.last-roster",
      {
        schemaVersion: 4,
        value: {
          rows: [
            { id: "current", name: "Current", lastActivityAt: 1 },
            { id: "newer", name: "Newer", lastActivityAt: 2 },
          ],
        },
      },
    );
    await write("sand.client.slice.account.other.roster.last-roster", {
      schemaVersion: 4,
      value: { rows: [{ id: "other", name: "Other" }] },
    });
    await write(
      "sand.client.slice.account.google-oauth2%7Ctest.ui-agent-refs",
      {
        schemaVersion: 1,
        value: { pinnedAgentIds: ["current"] },
      },
    );
    await write("sand.client.slice.account.other.ui-agent-refs", {
      schemaVersion: 1,
      value: { pinnedAgentIds: ["newer"] },
    });
    assert.deepEqual(
      (await loadRoster(folder)).bots.map((bot) => bot.id),
      ["current", "newer"],
    );
    await write("sand.client.slice.client-meta.account-slot", {
      schemaVersion: 1,
      value: null,
    });
    await assert.rejects(() => loadRoster(folder), /sign in/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("builds stable chat links and rejects malformed IDs", () => {
  assert.equal(chatLink("bot-123"), "grokbot://app/v1/agent?id=bot-123");
  assert.throws(() => chatLink("../settings"), /Invalid/);
});
