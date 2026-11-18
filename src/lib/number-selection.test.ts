import assert from "node:assert/strict";
import { test } from "node:test";
import { numberSelection } from "./number-selection";

test("single digit shortcuts select immediately when there are fewer than ten bots", () => {
  assert.deepEqual(numberSelection("1", 6), {
    index: 0,
    waitForMoreDigits: false,
  });
  assert.deepEqual(numberSelection("6", 6), {
    index: 5,
    waitForMoreDigits: false,
  });
});

test("waits for a multi-digit number only when a longer valid slot exists", () => {
  assert.deepEqual(numberSelection("1", 18), {
    index: 0,
    waitForMoreDigits: true,
  });
  assert.deepEqual(numberSelection("10", 18), {
    index: 9,
    waitForMoreDigits: false,
  });
  assert.deepEqual(numberSelection("18", 18), {
    index: 17,
    waitForMoreDigits: false,
  });
  assert.deepEqual(numberSelection("2", 18), {
    index: 1,
    waitForMoreDigits: false,
  });
  assert.deepEqual(numberSelection("10", 100), {
    index: 9,
    waitForMoreDigits: true,
  });
});

test("bot names and invalid slot numbers keep normal search behavior", () => {
  for (const query of [
    "",
    "Research",
    "0",
    "01",
    "19",
    "-1",
    "1.5",
    "1x",
    "99999999999999999999",
  ]) {
    assert.equal(numberSelection(query, 18), undefined);
  }
});
