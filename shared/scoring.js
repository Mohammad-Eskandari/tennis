export function newScore(format = "quick") {
  return {
    points: [0, 0],
    games: [0, 0],
    sets: [0, 0],
    history: [],
    server: 0,
    tiebreak: false,
    tieFirst: 0,
    winner: null,
    target: format === "quick" ? 3 : 6,
    bestOf: format === "best3" ? 3 : 1,
    totalPoints: 0,
  };
}
export function pointLabel(s, i) {
  if (s.tiebreak) return String(s.points[i]);
  let a = s.points[i],
    b = s.points[1 - i];
  if (a >= 3 && b >= 3) return a === b ? "40" : a > b ? "AD" : "40";
  return ["0", "15", "30", "40"][Math.min(a, 3)];
}
function finishSet(s, w) {
  s.sets[w]++;
  s.history.push([...s.games]);
  s.games = [0, 0];
  s.points = [0, 0];
  s.tiebreak = false;
  if (s.sets[w] > s.bestOf / 2) s.winner = w;
}
export function awardPoint(s, w) {
  if (s.winner !== null) return;
  s.points[w]++;
  s.totalPoints++;
  const other = 1 - w;
  if (s.tiebreak) {
    const n = s.points[0] + s.points[1];
    if (s.points[w] >= 7 && s.points[w] - s.points[other] >= 2) {
      s.games[w]++;
      s.server = 1 - s.tieFirst;
      finishSet(s, w);
    } else s.server = (s.tieFirst + Math.floor((n + 1) / 2)) % 2;
    return;
  }
  if (s.points[w] >= 4 && s.points[w] - s.points[other] >= 2) {
    s.games[w]++;
    s.points = [0, 0];
    s.server = 1 - s.server;
    if (s.games[w] >= s.target && s.games[w] - s.games[other] >= 2)
      finishSet(s, w);
    else if (s.games[0] === s.target && s.games[1] === s.target) {
      s.tiebreak = true;
      s.tieFirst = s.server;
    }
  }
}
export const serveCourt = (s) =>
  (s.points[0] + s.points[1]) % 2 === 0 ? 1 : -1;
