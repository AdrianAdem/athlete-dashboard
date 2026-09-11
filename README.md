<div align="center">

<img src="docs/hero-v2.png" alt="Athlete Dashboard — Training, nutrition and recovery in one personal dashboard." width="100%"/>

<br>

### Training, nutrition and recovery in one personal dashboard.

<br>

<a href="#setup"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React: 19"/></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-E87969?style=for-the-badge" alt="License: MIT"/></a> <a href="#try-it-without-a-backend"><img src="https://img.shields.io/badge/Preview-Local%20demo-E87969?style=for-the-badge" alt="Preview: Local demo"/></a> <a href="https://github.com/AdrianAdem/athlete-dashboard"><img src="https://img.shields.io/badge/Source-GitHub-737C88?style=for-the-badge&logo=github&logoColor=white" alt="Source: GitHub"/></a>

<br><br>

<a href="#screenshots">Screenshots</a> &nbsp; · &nbsp; <a href="#setup">Get started</a> &nbsp; · &nbsp; <a href="#license">License</a>

<br><br>

</div>

This repository contains my personal single-user app. For a backend-free preview with generated fixtures, use [local demo mode](#try-it-without-a-backend). The existing deployment is my personal instance, not a public demo.

**Before connecting real data:** the current app uses a fixed user ID and permissive RLS policies rather than Supabase Auth. Those policies do not provide user isolation. Review authentication and access policies before deploying your own instance.

Fitness data is fragmented across vendor silos: strength logs in one app, runs in Strava, sleep and HRV locked inside Garmin Connect, nutrition somewhere else. None of them answer a question like "did my HRV drop in the weeks my training volume spiked?" Athlete Dashboard pulls all of it into a single Postgres database behind a single UI, so the data can actually be correlated. It ships as an installable mobile web app deployed as a static bundle, with no backend server to maintain.

<br>

## Features

- **Strength training** — training plans, per-set logging (weight × reps), rest timer, exercise history
- **Training analytics** — estimated 1RM via the Brzycki formula, volume and max-weight trends per exercise, a 12-week training heatmap, and scored progress/consistency/intensity/volume metrics
- **Routines** — recurring routines with weekday scheduling and date ranges, per-step completion tracking, swipe-to-delete
- **Cardio** — Strava OAuth import plus manual entry, GPS live tracking on a Leaflet map with screen wake lock, and per-activity stream charts for pace, heart rate, and elevation
- **Nutrition** — barcode scanning, FatSecret database search, LLM-parsed freetext entry, macro and micronutrient tracking against RDA targets, water logging
- **Wearable biometrics** — daily Garmin sync of resting heart rate, HRV, sleep stages and score, Body Battery, stress, VO2max, and steps
- **Dashboard** — daily overview of calories, water, training status, routines, and the latest biometrics

<br>

## Screenshots

<p align="center">
<img src="docs/screenshots/dashboard.png" width="340" alt="Demo: daily training, nutrition and routines"/>
&nbsp;&nbsp;
<img src="docs/screenshots/stats.png" width="340" alt="Demo: training analytics and exercise progress"/>
</p>

<details>
<summary>Cardio and nutrition screens</summary>

<p align="center">
<img src="docs/screenshots/cardio.png" width="340" alt="Demo: cardio activities and route map"/>
&nbsp;&nbsp;
<img src="docs/screenshots/nutrition.png" width="340" alt="Demo: micronutrient intake"/>
</p>

</details>

Taken from demo mode, so the data shown is generated, not personal.

<br>

## Tech Stack


**Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI primitives, Recharts, Leaflet, React Router 7
**Backend** — Supabase (Postgres with row-level security, Deno edge functions)
**Integrations** — Garmin Connect, Strava, FatSecret, Anthropic Claude
**CI/CD** — GitHub Actions build and deploy to GitHub Pages

<br>

## Architecture

The app is a static SPA. Everything server-side runs either in Supabase edge functions or, for one specific case, on a local machine.

```mermaid
flowchart TB
    subgraph client["Browser — static SPA on GitHub Pages"]
        UI[React 19 + Vite]
    end

    subgraph supabase["Supabase"]
        DB[("Postgres · 22 tables<br/>row-level security")]
        EF1[food-lookup]
        EF2[strava-auth]
        EF3[strava-sync]
    end

    subgraph local["Local machine — launchd, every 30 min"]
        SYNC["garmin-sync.mjs<br/>zero-dependency Node"]
    end

    FS[FatSecret API]
    AN[Anthropic Claude]
    ST[Strava API]
    GA[Garmin Connect]

    UI -->|anon key, RLS| DB
    UI --> EF1
    UI --> EF2
    UI --> EF3
    EF1 --> FS
    EF1 --> AN
    EF2 --> ST
    EF3 --> ST
    EF3 -->|service role| DB
    SYNC -->|"OAuth1 → OAuth2"| GA
    SYNC -->|service role| DB
```

Two design decisions worth calling out:

**Garmin sync runs locally, not in an edge function.** Garmin's `connectapi.garmin.com` gateway hard-blocks datacenter IP ranges — every request from Supabase's infrastructure returns `429`. The sync therefore runs on a residential connection via a `launchd` job. `scripts/garmin-sync.mjs` implements Garmin's undocumented auth flow (SSO ticket → HMAC-SHA1-signed OAuth1 request → OAuth2 token exchange) with no third-party dependencies, and caches tokens locally so a 30-minute polling interval does not trigger a full SSO login on every run.

**Secrets never reach the browser.** Only the Supabase URL and anon key are inlined into the bundle. Third-party API credentials live in edge function secrets, and the service role key exists only in the local sync script's environment.

<br>

## Setup

### Try it without a backend

Demo mode runs the whole app against in-memory fixtures — no Supabase project,
no API keys, no `.env`:

```bash
git clone https://github.com/AdrianAdem/athlete-dashboard.git
cd athlete-dashboard
npm install
npm run demo           # http://localhost:5173/athlete-dashboard/
```

It ships twelve weeks of training logs, a week of meals, five runs with GPS
tracks, and two weeks of Garmin biometrics, all generated relative to today.
Writes work and persist for the session. The GPS tracks are synthetic loops
through a public park, not recorded routes.

### Full installation

- Node.js 20+
- A Supabase project

```bash
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:5173
```

### Environment variables

Anything prefixed with `VITE_` is inlined into the public browser bundle at build time. Never put a secret behind that prefix.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser (public) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser (public) | Supabase anon key, constrained by RLS |
| `GARMIN_EMAIL` | Local script | Garmin Connect account |
| `GARMIN_PASSWORD` | Local script | Garmin Connect password |
| `SUPABASE_SERVICE_ROLE_KEY` | Local script | Bypasses RLS for sync writes — server-side only |

Set these in the Supabase dashboard under **Edge Functions → Secrets**, not in `.env`:

| Secret | Used by |
| --- | --- |
| `FATSECRET_CLIENT_ID` / `FATSECRET_CLIENT_SECRET` | `food-lookup` |
| `ANTHROPIC_API_KEY` | `food-lookup` freetext parsing |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` / `STRAVA_REDIRECT_URI` | `strava-auth`, `strava-sync` |

### Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets first.

<br>

## Usage

```bash
npm run dev              # dev server with HMR
npm run demo             # dev server with in-memory fixtures, no backend needed
npm run build            # typecheck + production build
npm run preview          # serve the production build locally
npm run lint             # ESLint
npm run garmin:sync         # sync the last 7 days of Garmin data
npm run garmin:sync -- 30   # sync the last 30 days
```

To run the Garmin sync automatically every 30 minutes, generate the launchd
agent from the template (it substitutes your Node path and repo location):

```bash
sed -e "s|__NODE_BIN__|$(which node)|" -e "s|__PROJECT_DIR__|$PWD|" \
  scripts/com.athlete-dashboard.garmin-sync.plist \
  > ~/Library/LaunchAgents/com.athlete-dashboard.garmin-sync.plist
launchctl load ~/Library/LaunchAgents/com.athlete-dashboard.garmin-sync.plist
```

Edge functions deploy with the Supabase CLI:

```bash
supabase functions deploy food-lookup
```

<br>

## Project Structure

```
src/
  features/        one directory per feature area (dashboard, sport, nutrition, ausdauer, ...)
  components/      shared UI primitives and app layout
  lib/             Supabase client, API service wrappers, domain calculations
  types/           database row types
supabase/
  functions/       Deno edge functions
scripts/
  garmin-sync.mjs  local Garmin Connect sync
```

<br>

## Notes

This is a personal single-user application. It uses a fixed user ID rather than Supabase Auth, and the RLS policies on app tables are permissive by design. Adding real authentication would be a prerequisite for any multi-user deployment.

Garmin Connect exposes no public API for this data. The sync script targets an undocumented, unofficial endpoint set that Garmin may change or block at any time.

<br>

## License

MIT — see [LICENSE](LICENSE).
