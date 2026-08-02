import test from "node:test";
import assert from "node:assert/strict";

function parseEntries(flat) {
  const entries = [];
  if (!flat) return entries;
  for (let i = 0; i < flat.length; i += 2) {
    entries.push({
      nickname: flat[i].split(":")[0],
      score: Number(flat[i + 1]),
    });
  }
  return entries;
}

function validateNickname(nickname) {
  return /^[A-Z0-9]{1,6}$/.test(String(nickname || "").toUpperCase());
}

function validateScore(score, maxScore = 10_000_000) {
  const s = Number(score);
  return Number.isInteger(s) && s > 0 && s <= maxScore;
}

test("parseEntries correctly splits NICKNAME:TIMESTAMP:RANDOM members", () => {
  const flatData = [
    "ACE:1710000000000:abc123", "5000",
    "BOB:1710000000100:def456", "3200"
  ];
  const entries = parseEntries(flatData);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].nickname, "ACE");
  assert.equal(entries[0].score, 5000);
  assert.equal(entries[1].nickname, "BOB");
  assert.equal(entries[1].score, 3200);
});

test("validateNickname enforces 1-6 alphanumeric constraint", () => {
  assert.equal(validateNickname("ALICE"), true);
  assert.equal(validateNickname("A1"), true);
  assert.equal(validateNickname("TOOLONGNAME"), false);
  assert.equal(validateNickname("BAD!"), false);
  assert.equal(validateNickname(""), false);
});

test("validateScore accepts valid positive integers", () => {
  assert.equal(validateScore(1250), true);
  assert.equal(validateScore(0), false);
  assert.equal(validateScore(-50), false);
  assert.equal(validateScore(99999999), false);
});
