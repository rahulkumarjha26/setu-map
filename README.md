# Setu — The Map

A public, interactive map that reads civic/development problems from a Supabase database (filled by the [Setu Telegram Bot](https://t.me/SetuReportBot)) and renders them honestly on a Leaflet map.

**This is a static website** — no build step, no server, no framework. Deploys anywhere static files go.

## Prerequisites

- A Supabase project with the `problems` table (created by the Setu bot)
- The SQL migrations from `migrations/002_map_fields.sql` and `migrations/003_public_view.sql` run on that database
- A Vercel or Cloudflare Pages account (for deployment)

## Database setup

These migrations run on the **same database** the Setu bot uses. They add lifecycle fields and create a secure public view.

### 002_map_fields.sql
Adds `stage`, `gov_status`, `gov_days`, `is_sensitive` columns to `problems`.

### 003_public_view.sql
Creates the `public_problems` view that:
- Only shows `status = 'published'` rows
- OMITS `reporter_telegram_id` (never exposed to the browser)
- Grants `SELECT` to the `anon` role
- Revokes direct access to the base `problems` table from `anon`

## Configuration

Edit `config.js` with your Supabase credentials:

```js
window.SETU_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",  // Safe to commit — restricted by RLS
  BOT_URL: "https://t.me/SetuReportBot",
  CENTER: { lat: 28.7041, lng: 77.1025, zoom: 13 }  // Delhi
};
```

> **Security note:** The anon key is safe to commit. The service role key must NEVER appear here.

## Local testing

Just open `index.html` in a browser. No server needed. It loads Leaflet, Supabase JS, and data directly from the CDN.

## Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Framework Preset: **Other** (no build command, output = root directory)
4. Deploy
5. Open the live URL on your phone

Or use Cloudflare Pages: connect repo → no build command → deploy.

## How it works

- The map fetches from `public_problems` (a secure Postgres view) via the Supabase JS client
- Pins are colored by honesty, not optimism:
  - 🟢 Green = open for funding (CSR-fundable)
  - 🟤 Gold = needs reframe (partly statutory, partly fundable)
  - ⚪ Grey = government's duty (statutory — routed, not celebrated)
  - ✨ Glowing green = proven / healed
- Click a pin to open the dossier with **Heart** (trajectory) and **Ledger** (legal/financial) tabs
- Empty state shows a dignified message with a link to the bot
- Live updates via Supabase Realtime when new wounds are published

## Acceptance criteria (CHECKPOINT 4)

1. Map shows pins colored by their honest state
2. Statutory pins show "Government's duty — routed" (not celebratory)
3. Clicking a pin opens dossier with Heart/Ledger toggle
4. Ledger tab shows correct bin explanation + "₹0 taken by Setu"
5. Empty state appears when no matching rows
6. "Speak a wound →" button links to the Telegram bot
7. DevTools Network tab confirms `public_problems` response has NO `reporter_telegram_id`
