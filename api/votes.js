// Live voting backend for the Texas getaway poll.
// Storage priority:
//   1. Vercel KV (Upstash Redis) — persistent, shared across all visitors  [recommended]
//   2. If KV isn't configured, responds storage:'none' so the client uses
//      a keyless shared fallback automatically. No setup required to go live.

const VALID = ['sons', 'treetop', 'castell', 'willow'];
const KEY = 'getaway:votes'; // hash of voterId -> choice

function tally(map) {
  const counts = { sons: 0, treetop: 0, castell: 0, willow: 0 };
  for (const choice of Object.values(map || {})) {
    if (counts[choice] !== undefined) counts[choice]++;
  }
  return counts;
}

const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!kvConfigured) {
    return res.status(200).json({ counts: tally({}), storage: 'none' });
  }

  let kv;
  try {
    ({ kv } = await import('@vercel/kv'));
  } catch (e) {
    return res.status(200).json({ counts: tally({}), storage: 'none' });
  }

  try {
    if (req.method === 'GET') {
      const map = (await kv.hgetall(KEY)) || {};
      return res.status(200).json({ counts: tally(map), storage: 'kv' });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { voter, choice } = body || {};
      if (!voter || !VALID.includes(choice)) {
        return res.status(400).json({ error: 'bad input' });
      }
      await kv.hset(KEY, { [voter]: choice }); // one vote per voter; overwrites prior
      const map = (await kv.hgetall(KEY)) || {};
      return res.status(200).json({ counts: tally(map), storage: 'kv' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(200).json({ counts: tally({}), storage: 'error', detail: String(e) });
  }
}
