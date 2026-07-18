// Central highscore leaderboard, backed by Vercel KV (Upstash Redis REST API).
// Zero dependencies — talks to the REST API directly with the built-in fetch.
//
// Scores live in one sorted set. Members are "NICKNAME:TIMESTAMP:RANDOM" so
// repeat nicknames/scores stay distinct entries; the nickname (never
// containing ":", enforced by validation below) is recovered by splitting
// off everything before the first colon.

const KEY = "smooth-snake:highscores";
const MAX_ENTRIES = 100; // trimmed after every write to bound storage
const TOP_N = 10;
const MAX_SCORE = 10_000_000; // generous ceiling, well above any legitimate run

function kvUrl(...parts) {
  return `${process.env.KV_REST_API_URL}/${parts.map(encodeURIComponent).join("/")}`;
}

async function kv(...parts) {
  const res = await fetch(kvUrl(...parts), {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function parseEntries(flat) {
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) {
    entries.push({
      nickname: flat[i].split(":")[0],
      score: Number(flat[i + 1]),
    });
  }
  return entries;
}

async function topScores() {
  const flat = await kv("zrevrange", KEY, "0", String(TOP_N - 1), "withscores");
  return parseEntries(flat);
}

export default async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    res.status(503).json({ error: "Highscore service not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      res.status(200).json({ scores: await topScores() });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const nickname = String(body.nickname || "").toUpperCase();
      const score = Number(body.score);

      if (!/^[A-Z0-9]{1,6}$/.test(nickname)) {
        res.status(400).json({ error: "Nickname must be 1-6 alphanumeric characters" });
        return;
      }
      if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
        res.status(400).json({ error: "Invalid score" });
        return;
      }

      const member = `${nickname}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      await kv("zadd", KEY, String(score), member);
      await kv("zremrangebyrank", KEY, "0", String(-(MAX_ENTRIES + 1)));

      res.status(200).json({ scores: await topScores() });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch {
    res.status(500).json({ error: "Highscore service error" });
  }
}
