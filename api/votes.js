// Live voting backend for the Texas getaway poll.
// Storage priority:
//   1. Vercel KV (Upstash Redis) — persistent, shared across all visitors  [recommended]
//   2. If KV isn't configured, responds storage:'none' so the client uses
//      a keyless shared fallback automatically. No setup required to go live.

const VALID = ['sons', 'treetop', 'castell', 'willow'];
const KEY = 'getaway:votes'; // hash of voterId -> choice
const VISITORS_KEY = 'getaway:visitors'; // set of unique visitor IDs

function tally(map) {
  const counts = { sons: 0, treetop: 0, castell: 0, willow: 0 };
  for (const choice of Object.values(map || {})) {
    if (counts[choice] !== undefined) counts[choice]++;
  }
  return counts;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendVoteEmail(voter, choice) {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SIMULATION] Vote cast by ${voter} for ${choice}`);
    return;
  }

  const propertyNames = {
    sons: "Son's Rio Cibolo",
    treetop: "Treetop River Cabins",
    castell: "Castell Cabins (El Castell)",
    willow: "Willow Point Resort"
  };
  const propName = propertyNames[choice] || choice;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Getaway Poll <onboarding@resend.dev>',
        to: 'raju1410@gmail.com',
        subject: `🛶 New Vote Cast for ${propName}!`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #d8cfb8; border-radius: 12px; background-color: #fbf8f0;">
            <h2 style="color: #2a5232; margin-top: 0;">Texas Family Getaway Poll</h2>
            <p>A new vote has been cast in the group getaway planning poll!</p>
            <hr style="border: 0; border-top: 1px dashed #d8cfb8; margin: 20px 0;" />
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #3a6b43; width: 140px;">Property Choice:</td>
                <td style="padding: 8px 0; font-size: 16px;"><strong>${propName}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #3a6b43;">Voter ID:</td>
                <td style="padding: 8px 0; font-family: monospace; color: #c8643c;">${voter}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #3a6b43;">Time (UTC):</td>
                <td style="padding: 8px 0; color: #5a6150;">${new Date().toUTCString()}</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px dashed #d8cfb8; margin: 20px 0;" />
            <p style="margin-bottom: 0;"><a href="https://texas-getaway.vercel.app" style="display: inline-block; padding: 10px 20px; background-color: #3a6b43; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">View Live Poll Results ↗</a></p>
          </div>
        `
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Resend API failed: ${errText}`);
    } else {
      console.log(`Email notification sent successfully for voter ${voter}`);
    }
  } catch (e) {
    console.error(`Error sending email via Resend:`, e);
  }
}

const FB_BASE = 'https://api.counterapi.dev/v1';

// Proxy function to get counts from Counter API
async function getCounterApiCounts(ns) {
  const counts = { sons: 0, treetop: 0, castell: 0, willow: 0 };
  await Promise.all(VALID.map(async id => {
    try {
      const r = await fetch(`${FB_BASE}/${ns}/${id}/`);
      if (r.ok) {
        const j = await r.json();
        counts[id] = (j && (j.count ?? j.value)) || 0;
      }
    } catch(e) {
      console.error(`Counter API fetch error for ${id}:`, e);
    }
  }));
  return counts;
}

const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const host = req.headers.host || 'poll';
  const ns = 'tx-getaway-' + (host.split('.')[0] || 'poll');

  if (!kvConfigured) {
    try {
      if (req.method === 'GET') {
        const newVisit = req.query.new_visit === '1';
        let visitorsCount = 0;
        try {
          let url = `${FB_BASE}/${ns}/visitors/`;
          if (newVisit) {
            url = `${FB_BASE}/${ns}/visitors/up/`;
          }
          const r = await fetch(url);
          if (r.ok) {
            const j = await r.json();
            visitorsCount = (j && (j.count ?? j.value)) || 0;
          }
        } catch (e) {}

        const counts = await getCounterApiCounts(ns);
        return res.status(200).json({ counts, visitors: visitorsCount, storage: 'counterapi' });
      }

      if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
        const { voter, choice, prevChoice } = body || {};
        if (!voter || !VALID.includes(choice)) {
          return res.status(400).json({ error: 'bad input' });
        }

        // Increment the selected choice
        try {
          await fetch(`${FB_BASE}/${ns}/${choice}/up/`);
        } catch (e) {}

        // Decrement previous choice if changed
        if (prevChoice && prevChoice !== choice && VALID.includes(prevChoice)) {
          try {
            await fetch(`${FB_BASE}/${ns}/${prevChoice}/down/`);
          } catch (e) {}
        }

        // Get updated counts
        const counts = await getCounterApiCounts(ns);

        // Get current visitors count
        let visitorsCount = 0;
        try {
          const r = await fetch(`${FB_BASE}/${ns}/visitors/`);
          if (r.ok) {
            const j = await r.json();
            visitorsCount = (j && (j.count ?? j.value)) || 0;
          }
        } catch (e) {}

        // Send email in background
        sendVoteEmail(voter, choice);

        return res.status(200).json({ counts, visitors: visitorsCount, storage: 'counterapi' });
      }
    } catch (e) {
      return res.status(200).json({ counts: tally({}), visitors: 0, storage: 'error', detail: String(e) });
    }
  }

  // Vercel KV Implementation
  let kv;
  try {
    ({ kv } = await import('@vercel/kv'));
  } catch (e) {
    return res.status(200).json({ counts: tally({}), visitors: 0, storage: 'none' });
  }

  try {
    if (req.method === 'GET') {
      const vid = req.query.vid;
      if (vid) {
        await kv.sadd(VISITORS_KEY, vid);
      }
      const [map, visitorsCount] = await Promise.all([
        kv.hgetall(KEY) || {},
        kv.scard(VISITORS_KEY) || 0
      ]);
      return res.status(200).json({ counts: tally(map), visitors: visitorsCount, storage: 'kv' });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { voter, choice } = body || {};
      if (!voter || !VALID.includes(choice)) {
        return res.status(400).json({ error: 'bad input' });
      }
      
      await Promise.all([
        kv.hset(KEY, { [voter]: choice }),
        kv.sadd(VISITORS_KEY, voter)
      ]);
      
      const [map, visitorsCount] = await Promise.all([
        kv.hgetall(KEY) || {},
        kv.scard(VISITORS_KEY) || 0
      ]);

      sendVoteEmail(voter, choice);

      return res.status(200).json({ counts: tally(map), visitors: visitorsCount, storage: 'kv' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(200).json({ counts: tally({}), visitors: 0, storage: 'error', detail: String(e) });
  }
}
