import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newScore,
  awardPoint,
  pointLabel,
  serveCourt,
} from "../shared/scoring.js";
const game = (s, w) => {
  for (let i = 0; i < 4; i++) awardPoint(s, w);
};
test("points use 0 / 15 / 30 / 40; game rotates server", () => {
  const s = newScore();
  assert.equal(pointLabel(s, 0), "0");
  awardPoint(s, 0);
  assert.equal(pointLabel(s, 0), "15");
  awardPoint(s, 0);
  assert.equal(pointLabel(s, 0), "30");
  awardPoint(s, 0);
  assert.equal(pointLabel(s, 0), "40");
  awardPoint(s, 0);
  assert.deepEqual(s.games, [1, 0]);
  assert.equal(s.server, 1);
});
test("deuce and advantage require a two point lead", () => {
  const s = newScore();
  for (let i = 0; i < 3; i++) {
    awardPoint(s, 0);
    awardPoint(s, 1);
  }
  assert.equal(pointLabel(s, 0), "40");
  awardPoint(s, 0);
  assert.equal(pointLabel(s, 0), "AD");
  awardPoint(s, 1);
  assert.equal(pointLabel(s, 0), "40");
  awardPoint(s, 1);
  awardPoint(s, 1);
  assert.deepEqual(s.games, [0, 1]);
});
test("quick format completes at three games with two game margin", () => {
  const s = newScore();
  game(s, 0);
  game(s, 1);
  game(s, 0);
  game(s, 0);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.history, [[3, 1]]);
  const before = structuredClone(s);
  awardPoint(s, 1);
  assert.deepEqual(s, before);
});
test("tie-break rotates service after one then every two points", () => {
  const s = newScore();
  for (let i = 0; i < 3; i++) {
    game(s, 0);
    game(s, 1);
  }
  assert.equal(s.tiebreak, true);
  const first = s.server;
  awardPoint(s, 0);
  assert.equal(s.server, 1 - first);
  awardPoint(s, 1);
  assert.equal(s.server, 1 - first);
  awardPoint(s, 0);
  assert.equal(s.server, first);
  for (let i = 0; i < 5; i++) awardPoint(s, 0);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.history, [[4, 3]]);
  assert.equal(s.server, 1 - first);
});
test("best of three needs two sets", () => {
  const s = newScore("best3");
  for (let i = 0; i < 6; i++) game(s, 0);
  assert.equal(s.winner, null);
  for (let i = 0; i < 6; i++) game(s, 0);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.sets, [2, 0]);
});
test("service court alternates by point parity", () => {
  const s = newScore();
  assert.equal(serveCourt(s), 1);
  awardPoint(s, 1);
  assert.equal(serveCourt(s), -1);
});
