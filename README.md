# Reading Room

A minimal personal SAT practice app for Reading and Writing and Math. No login, server, or database required.

## Features

- Home dashboard with overall and per-section progress, difficulty breakdown, weekly activity, and recent answers.
- Reading and Writing and Math sections. Each section is divided into its official domains; choose a domain, then a skill (or all skills in the domain). Filter by difficulty and by new, all, incorrect, or bookmarked questions. Every domain/skill/filter combination keeps its own saved place.
- Math practice with the College Board exam version of the Desmos graphing calculator docked in a resizable split screen. The calculator keeps its work while you move between questions. Grid-in (student-produced response) questions accept any equivalent value, such as 6/34 for 3/17.
- Everything saves automatically: chosen answers, typed answers, timers, and checked answers. Reopen the site to continue exactly where you left off.
- Past questions: every answer is listed with its time, result, and a review of the question, your answer, the correct answer, and the explanation. Within a session, use Previous questions to look back.
- Bluebook practice tools: the answer eliminator (cross out choices), Mark for Review, highlights with notes on question text, a hideable timer, a text-size control (85–200%, remembered per browser), the line reader, and for Math the reference sheet plus a grid-in answer preview, input limits, and directions. Crossed-out choices and highlights save with your progress.
- Review mistakes and questions marked for review, export/restore backups, and restore automatic daily snapshots.

## Collection

3,770 questions from user-provided College Board question-bank exports: 1,845 Reading and Writing and 1,925 Math. The original 755 Reading and Writing questions keep their IDs and lossless original images; `scripts/import-qbank.py` imported the rest of `sat_qbank_all.json` (see `imports/qbank-all.json`), matching existing questions by answer choices and passage so none is added twice. Imported question HTML is loaded on demand from `public/bank/pNN.json` and sanitized before display; `public/bank/index.json` holds the metadata. Seven grid-in questions have no machine-readable answer key, so you mark those yourself after reading the explanation.

Reading Room is independent and is not affiliated with College Board. The question content remains attributable to College Board. The calculator is provided by Desmos.

## Cloudflare deployment

This repository is configured for the existing Worker **reading-room**. In Settings → Builds:

- Repository: `wiktorkaluzny2008-max/reading-room`
- Production branch: `main`
- Root directory: `/`
- Build command: leave empty (static app; Wrangler prepares the image assets automatically)
- Deploy command: `npx wrangler deploy`

The lossless question images are stored in JSON asset packs to keep repository transfers efficient. Wrangler runs `scripts/prepare-assets.mjs` automatically before deployment to write the original image files into `public/questions/`.

`wrangler.jsonc` serves `public/` and enables the Worker's `workers.dev` address. No D1 database or environment secrets are needed. A commit to main triggers the connected Cloudflare build. Get the actual URL from Cloudflare after the build succeeds. A private GitHub repo does not make the deployed website private: use Cloudflare Access if you want to restrict who can open it. There are no shared server-side personal results.

## Progress and backups

Progress is saved on every change to localStorage under `reading-room-v1` and mirrored to IndexedDB (`reading-room`), with a daily snapshot kept for 14 days. On load the copies are merged, so a damaged copy in one store is recovered from the other. Saves never overwrite progress another tab wrote in the meantime: answers from both are combined, so a tab left open in the background cannot undo newer work. Progress is separate per browser profile; use Export backup and Restore backup to move it. The app also asks the browser to keep its storage persistent. Earlier (version 1) progress is migrated automatically, and the untouched original is kept under `reading-room-v1-pre-v2`. Without sync, progress is separate for each browser and site origin, and clearing the site's browser data removes it. Settings → Export backup downloads results and checkpoints; Restore backup validates the file and replaces local progress after confirmation. Keep backups before changing computers or clearing storage. Existing progress on the previous ChatGPT-hosted site is not migrated automatically.

## Sync across browsers

Settings → Sync across browsers creates a 32-character sync code. Enter the same code in each Chrome profile, browser, or device to share one copy of progress. `src/worker.js` serves the API at `/api/sync`: each code maps to a SQLite-backed Durable Object (`Progress`, declared in `wrangler.jsonc`, created automatically on deploy) holding one copy of progress. Every upload is merged into the stored copy with the same merge used between tabs, so answers are never dropped, and the merged copy is returned only when the uploading browser was missing something. Each stored copy has a version number that goes up only when progress really changes. A browser uploads only when its progress changed since its last sync (timer ticks don't count); otherwise it sends a version check, which returns an empty reply when nothing is new. Browsers sync on load, a few seconds after each change, every minute, and when a tab is shown or hidden; offline changes stay saved locally and sync on reconnect. The code is the only credential and is sent in the Authorization header. It is kept in that browser only and is not included in exported backups.

## Timing

The SAT Reading and Writing section has 54 questions in 64 minutes: a rounded 71 seconds per question. Math has 44 questions in 70 minutes: a rounded 95 seconds per question. The optional 45–90-second skill budgets are practice heuristics, not official category time limits.
Source: https://satsuite.collegeboard.org/sat/whats-on-the-test/structure

## Local development

Use Node.js 22 or newer:

```sh
npm install
npm run dev
npm test
```

Alternatively, run `node scripts/prepare-assets.mjs` and serve `public/` using any local HTTP static server. Do not open index.html directly with file:// because module scripts and fetch need HTTP.

## Validation

`npm test` checks question data, pack and image completeness, the import manifest, scoring (including grid-in equivalence), unique statistics, independent session persistence, version 1 migration, filter queues, session completion, pacing, and backup validation. Browser checks cover grading, next question, switching modules, and reload/resume. Production deployment status must be checked in Cloudflare separately.

