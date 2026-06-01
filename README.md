# 🛶 Texas Family Getaway Poll — July 3–5

A shareable web page for our 3-day / 2-night Hill Country family getaway (12 people).
Browse 4 waterfront properties and vote live for the group's pick.

## Properties
- **Son's Rio Cibolo** — Cibolo Creek, Marion TX (the original inspiration)
- **Treetop River Cabins** — Guadalupe River, Center Point TX
- **Castell Cabins (El Castell)** — Llano River, Castell TX
- **Willow Point Resort** — Lake Buchanan, Buchanan Dam TX

Each card has location, estimated budget, amenities, activities, a phone number,
and a "View photos & book" link to the real property site.

## Deploy (GitHub → Vercel)
1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo. No build settings needed
   (static `public/` + serverless `api/`). Click **Deploy**.
3. The poll goes live immediately using an automatic keyless fallback store.

## Make votes fully reliable (recommended, ~1 min)
For rock-solid, shared server-side vote storage, enable **Vercel KV**:
1. In your Vercel project → **Storage** → **Create Database** → **KV** (Upstash Redis).
2. **Connect** it to this project (Vercel auto-adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` env vars).
3. **Redeploy**. The `/api/votes` function detects KV automatically — done.

No env vars needed to launch; KV just upgrades the storage when present.

## Structure
```
public/index.html     # the page + poll UI
public/img/*.svg      # property illustrations
api/votes.js          # serverless vote endpoint (Vercel KV + fallback)
vercel.json           # config
```

## Notes
- Photos on cards are stylized illustrations; real photos are one tap away via each
  "View photos & book" link (the properties block image hotlinking).
- Prices are estimates — confirm live rates/availability. July 4 weekend books fast.
