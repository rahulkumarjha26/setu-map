# Setu Map — Build Plan

## Stack
Plain static HTML + CSS + vanilla JavaScript · Leaflet 1.9 (CDN) · Supabase JS v2 (CDN) · CartoDB tiles · Vercel/Cloudflare Pages. No framework, no bundler, no build.

## PHASE 0 — Project scaffold
Create: index.html, style.css, app.js, config.js, .gitignore, README.md

## PHASE 1 — Database prep (SQL migrations)
Run 002_map_fields.sql and 003_public_view.sql in Supabase SQL Editor.

## PHASE 2 — HTML structure (index.html)
Full static page with Leaflet map, top bar, category bar, legend, dock, empty state, dossier, toast.

## PHASE 3 — Styling (style.css)
Green/linen palette, all components styled.

## PHASE 4 — App logic (app.js)
Fetch from public_problems view, render pins with honest states, dossier with Heart/Ledger tabs.

## PHASE 5 — Deploy (Vercel/Cloudflare Pages)

## Hard rules
- Read ONLY from public_problems view, never base problems table.
- Never expose reporter_telegram_id.
- No inline event handlers — use addEventListener only.
- Show wounds honestly — statutory wounds get non-celebratory state.
