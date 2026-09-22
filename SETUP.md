# CircleSync - First-Time Setup

Complete walkthrough for deploying CircleSync from scratch on Cloudflare's free tier.

## Prerequisites

| Requirement | How to get it |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Git for Windows | https://git-scm.com/download/win |
| Cloudflare account | https://dash.cloudflare.com/sign-up |
| PowerShell 5+ | Built into Windows |

## 1. Clone the repo

    cd $HOME
    mkdir projects -Force
    cd projects
    git clone https://github.com/Ayurved-RasRasayan/circles.git
    cd circles

## 2. Install dependencies

    npm install --legacy-peer-deps

The --legacy-peer-deps flag is required because of a peer-dependency mismatch between Next.js 15 and some shadcn/ui packages.

## 3. Log in to Cloudflare

    npx wrangler login

A browser tab opens. Click Allow. Verify with: npx wrangler whoami

## 4. Create the D1 database

    npx wrangler d1 create circlesync

Copy the database_id from the output into wrangler.jsonc.

## 5. Apply the database schema

    npx wrangler d1 execute circlesync --remote --file=schema.sql

Expected: Executed 5 queries. This creates the User, Circle, and CircleMember tables.

## 6. Set the admin secret

    npx wrangler secret put ADMIN_KEY

Type a random string (e.g. myadmin2026). Save it for the admin tool.

## 7. Deploy the Durable Object worker

    cd do-worker
    npx wrangler deploy --config wrangler.toml
    cd ..

Expected: Uploaded circlesync-do. Note the URL.

## 8. Point the frontend at your DO worker

Open src/app/page.tsx and find:

    const wsUrl = `wss://circlesync-do.<your-subdomain>.workers.dev/ws?circle=...`

Replace <your-subdomain> with your actual subdomain.

## 9. Deploy the main worker

    .\deploy.ps1

Expected: Uploaded circlesync. Your app is live.

## 10. Test

Open the URL in a fresh Incognito window. Create account, create circle, open a second browser, join with the invite code. Both should show Live - 2 online.

## 11. Optional - Admin tool

    .\serve-admin.ps1

Open http://localhost:8080/admin.html and paste your ADMIN_KEY.

## 12. Optional - APK

Download public/downloads/CircleSync.apk, install on Android, enter your Worker URL on first launch.

## Updating Your Deployment

After code changes: .\deploy.ps1

After DB changes: npx wrangler d1 execute circlesync --remote --file=schema.sql

After DO worker changes:
    cd do-worker
    npx wrangler deploy --config wrangler.toml
    cd ..

## Troubleshooting

### npm install fails with ERESOLVE
Use --legacy-peer-deps.

### next-on-pages build fails on Windows
The OpenNext CLI needs bash on PATH. Install Git for Windows, then:
    $env:PATH = "C:\Program Files\Git\bin;" + $env:PATH

### wrangler deploy hangs on upload
Can take 3-5 minutes on slow connections. Just wait.

### WebSocket stays "Connecting..."
Check npx wrangler tail circlesync-do for DO worker logs.