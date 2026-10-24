# Reading Room

Implementation branch for a personal SAT practice app. The dashboard, practice sessions, timer, review, and backup controls are built. Official question content and image uploads are awaiting explicit user confirmation required by automatic approval review. The empty public/questions.json is a placeholder, not the finished collection. Do not merge/deploy this branch until the question data is included.

Progress saves in this browser with JSON backup/restore; there is no account or cloud synchronization.

Cloudflare: Worker reading-room; no build command in dashboard; deploy command npx wrangler deploy. Wrangler automatically runs scripts/prepare-assets.mjs.

Local: npm install, npm run dev.
