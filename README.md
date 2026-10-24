# Reading Room

A minimal personal SAT Reading and Writing practice app. No login, server, or database required.

## Features

- Dashboard: unique questions completed, latest-answer accuracy, correct/incorrect counts by difficulty, module progress, weekly activity, and recent answers.
- Four content-domain practice groups, with independent resumable sessions. Filter by skill, difficulty, incorrect answers, or bookmarks; filtered sessions save independently too.
- Immediate answer grading and original College Board explanations; original question images preserve charts and underlining.
- Saved choice, question index, answer reveal, and timer on reload. Timer pauses when away and never auto-submits.
- Review mistakes, bookmark questions, export/restore progress backups, and keyboard shortcuts.

## Collection

300 questions from user-provided College Board exports: 100 Information and Ideas, 100 Craft and Structure, and 100 Expression of Ideas. Standard English Conventions is not yet imported. This is not the entire official bank. The later full Information and Ideas PDF is not incorporated in this release.

These domain practice groups are not the SAT's two adaptive test modules. Reading Room is independent and is not affiliated with College Board. The question content remains attributable to College Board.

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

Progress is stored in localStorage under `reading-room-v1`, separately for each browser and site origin. It does not synchronize across devices. Clearing browser data removes it. Settings → Export backup downloads results and checkpoints; Restore backup validates the file and replaces local progress after confirmation. Keep backups before changing computers or clearing storage. Existing progress on the previous ChatGPT-hosted site is not migrated automatically.

## Timing

The SAT Reading and Writing section has 54 questions in 64 minutes: a rounded 71 seconds per question. The optional 45–90-second skill budgets are practice heuristics, not official category time limits.
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

`npm test` checks question data and image completeness, scoring and unique statistics, independent module persistence, filter queues, session completion, pacing, and backup validation. Browser checks cover grading, next question, switching modules, and reload/resume. Production deployment status must be checked in Cloudflare separately.
