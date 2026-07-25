// Central highscore leaderboard, backed by Vercel KV (Upstash Redis REST API).
// Zero dependencies — talks to the REST API directly with the built-in fetch.
//
// Scores live in separate sorted sets by platform ("pc" or "mobile").
// Members are "NICKNAME:TIMESTAMP:RANDOM" so repeat nicknames/scores stay
// distinct entries; the nickname (never containing ":", enforced by validation
// below) is recovered by splitting off everything before the first colon.

const KEY_PREFIX = "smooth-snake:highscores";
const MAX_ENTRIES = 100; // trimmed after every write to bound storage
const TOP_N = 10;
const MAX_SCORE = 10_000_000; // generous ceiling, well above any legitimate run

function getKey(platform) {
  const p = platform === "mobile" ? "mobile" : "pc";
  return `${KEY_PREFIX}:${p}`;
}

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
  if (!flat) return entries;
  for (let i = 0; i < flat.length; i += 2) {
    entries.push({
      nickname: flat[i].split(":")[0],
      score: Number(flat[i + 1]),
    });
  }
  return entries;
}

async function topScores(platform) {
  const key = getKey(platform);
  let flat = await kv("zrevrange", key, "0", String(TOP_N - 1), "withscores");
  // Fallback to legacy key for PC if the new PC key is empty
  if (platform !== "mobile" && (!flat || flat.length === 0)) {
    flat = await kv("zrevrange", KEY_PREFIX, "0", String(TOP_N - 1), "withscores");
  }
  return parseEntries(flat);
}

export default async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    res.status(503).json({ error: "Highscore service not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const platformParam = url.searchParams.get("platform");
      if (platformParam === "all" || !platformParam) {
        const [pc, mobile] = await Promise.all([topScores("pc"), topScores("mobile")]);
        res.status(200).json({ pc, mobile });
        return;
      }
      const platform = platformParam === "mobile" ? "mobile" : "pc";
      const scores = await topScores(platform);
      res.status(200).json({ platform, scores });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const nickname = String(body.nickname || "").toUpperCase();
      const score = Number(body.score);
      const platform = body.platform === "mobile" ? "mobile" : "pc";
      const key = getKey(platform);

      if (!/^[A-Z0-9]{1,6}$/.test(nickname)) {
        res.status(400).json({ error: "Nickname must be 1-6 alphanumeric characters" });
        return;
      }
      if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
        res.status(400).json({ error: "Invalid score" });
        return;
      }

      const member = `${nickname}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      await kv("zadd", key, String(score), member);
      await kv("zremrangebyrank", key, "0", String(-(MAX_ENTRIES + 1)));

      const scores = await topScores(platform);
      res.status(200).json({ platform, scores });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch {
    res.status(500).json({ error: "Highscore service error" });
  }
}

