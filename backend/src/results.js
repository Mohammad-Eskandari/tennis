import { fail } from "./security.js";
export function ratingDelta(winnerRating, loserRating) {
  return Math.round(
    24 * (1 - 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))),
  );
}
export async function applyResult(
  db,
  matchId,
  winner,
  state,
  reason = "Match completed",
) {
  return db.transaction(async (c) => {
    const m = (
      await c.query("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [matchId])
    ).rows[0];
    if (!m) fail(404, "Match not found");
    if (m.result_applied) return false;
    if (!m.player2 || ![m.player1, m.player2].includes(winner))
      fail(400, "Invalid match result");
    const loser = winner === m.player1 ? m.player2 : m.player1;
    const users = (
      await c.query(
        "SELECT id,rating FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[winner, loser]],
      )
    ).rows;
    const change = m.ranked
      ? ratingDelta(
          users.find((u) => u.id === winner).rating,
          users.find((u) => u.id === loser).rating,
        )
      : 0;
    await c.query("UPDATE users SET wins=wins+1,rating=rating+$1 WHERE id=$2", [
      change,
      winner,
    ]);
    await c.query(
      "UPDATE users SET losses=losses+1,rating=GREATEST(0,rating-$1) WHERE id=$2",
      [change, loser],
    );
    await c.query(
      "UPDATE matches SET status='COMPLETED',winner=$1,result_applied=true,state=$2,reason=$3,finished_at=now() WHERE id=$4",
      [winner, state, reason, matchId],
    );
    return true;
  });
}
