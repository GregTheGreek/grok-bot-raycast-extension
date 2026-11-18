import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHistory } from "./history";

test("shows human messages and user-facing bot replies, excluding internal reasoning and bot exchanges", () => {
  const messages = parseHistory({
    schemaVersion: 1,
    value: {
      entries: [
        {
          kind: "message",
          id: "human",
          role: "user",
          content: "Hello",
          timestampMs: 1,
        },
        {
          kind: "message",
          id: "internal",
          role: "assistant",
          content: "Private internal process",
          timestampMs: 2,
        },
        {
          kind: "message",
          id: "exchange",
          role: "user",
          fromAgent: { id: "other" },
          content: "Another bot's instruction",
          timestampMs: 3,
        },
        {
          kind: "send-message",
          id: "reply",
          message: { type: "text", content: "Hello back" },
          timestampMs: 4,
        },
      ],
    },
  });
  assert.deepEqual(
    messages.map(({ id, role, text }) => ({ id, role, text })),
    [
      { id: "human", role: "user", text: "Hello" },
      { id: "reply", role: "assistant", text: "Hello back" },
    ],
  );
});

test("keeps message text literal and strips executable attachment paths", () => {
  const literal = '<img src="https://example.invalid" onerror="alert(1)">';
  const messages = parseHistory({
    schemaVersion: 1,
    value: {
      entries: [
        {
          kind: "send-message",
          id: "text",
          message: { type: "text", content: literal },
        },
        {
          kind: "send-message",
          id: "file",
          message: {
            type: "attachment",
            file_name: "report.csv",
            url: "file:///private/secret",
            source_path: "../../secret",
          },
        },
      ],
    },
  });
  assert.equal(messages[0].text, literal);
  assert.equal(messages[1].attachment, "report.csv");
  assert.ok(!JSON.stringify(messages).includes("/private/secret"));
  assert.ok(!JSON.stringify(messages).includes("../../secret"));
});

test("rejects unknown conversation formats and keeps the most recent sixty visible entries", () => {
  assert.throws(
    () => parseHistory({ schemaVersion: 2, value: { entries: [] } }),
    /Unsupported/,
  );
  const entries = Array.from({ length: 70 }, (_, id) => ({
    kind: "message",
    id: String(id),
    role: "user",
    content: String(id),
  }));
  const messages = parseHistory({ schemaVersion: 1, value: { entries } });
  assert.equal(messages.length, 60);
  assert.equal(messages[0].id, "10");
});
