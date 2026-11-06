# Personal Dashboard

A single-page personal dashboard with a to-do list, focus timer, daily
goals tracker, quick notes, bookmarks, habits & streaks, and live weather.

This is the standalone version of the dashboard. It runs entirely in your
browser — there is no backend, no database to set up, and no API key
needed. All of your data is saved in your browser's localStorage.

## Features

- **To-do list** — priorities (high / medium / low) and all / active / done filters
- **Focus timer** — 15 / 25 / 50 minute presets or a custom length; finished sessions are saved automatically
- **Daily goals** — progress bars with targets and units; progress resets every morning (Asia/Kolkata date), targets stay
- **Quick notes** — colour-coded, pin and search
- **Bookmarks** — grouped by category
- **Habits & streaks** — tap to check in for today; streaks count consecutive days
- **Live weather** — defaults to Delhi, changeable to any city in the UI; fetched from Open-Meteo (no API key), cached for up to 3 hours
- **Morning overview** — tasks complete %, daily goals %, focus minutes today / all time

## Prerequisites

- Node.js 18 or newer
- npm (comes with Node.js)

Check yours with:

```bash
node --version
npm --version
```

## Run it locally

```bash
git clone https://github.com/srijan-dewangan/personal-dashboard.git
cd personal-dashboard
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Build for production

```bash
npm run build
npm run preview
```

`npm run build` type-checks the project and produces a production build in
`dist/`. `npm run preview` serves that build locally (by default at
http://localhost:4173).

## Your data

Everything you add — tasks, goals, notes, bookmarks, habits, focus
sessions — is stored in your browser under the localStorage key
`personal-dashboard-v1`. It stays on your own machine and is not sent
anywhere, except for weather requests, which go directly from your browser
to Open-Meteo (`api.open-meteo.com` and `geocoding-api.open-meteo.com`)
when you load the dashboard or change city. Clearing your browser data
for this site will erase your dashboard data.

## Tech stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- TanStack React Query
