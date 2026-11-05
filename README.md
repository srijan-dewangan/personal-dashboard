# Personal Dashboard

A single-page personal dashboard built with Muse.

## What it includes

- Todo list with priorities and filters
- Focus timer with 15, 25, and 50 minute presets, or a custom time
- Daily goals tracker with progress bars that reset every morning at 6 AM IST
- Quick notes, colour-coded, with pin and search
- Bookmarks grouped by category
- Habits and streaks
- Live weather, defaulting to Delhi and changeable to any city (Open-Meteo, no API key)
- Morning overview with task, goal, and focus stats

## How it is built

- React client in `client/`
- Server actions in `server/src/actions.ts`
- Schema in `server/src/schema.ts`
- Drizzle SQL migrations in `drizzle/`

This is a Muse TypeScript space (see `space.json` and `AGENTS.md`). It runs in Muse with its space runtime and database. It is not a standalone Vite app, so cloning this repo alone will not run it without that runtime.

## Data

User data (todos, notes, bookmarks, habits, focus sessions) lives in the app database and is not included in this repo. No secrets are included.
