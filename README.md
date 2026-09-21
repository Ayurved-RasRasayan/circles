# CircleSync — Cloudflare Deployment Guide

Deploy CircleSync permanently on Cloudflare's free tier. After deployment, you get a permanent URL that works with the Android APK.

## Architecture

| Component | Cloudflare Service | Free Tier |
|-----------|-------------------|-----------|
| Frontend + API (Next.js) | Cloudflare Pages | ✅ Unlimited |
| Database (SQLite → D1) | Cloudflare D1 | ✅ 5GB, 5M reads/day |
| Real-time (Socket.io → Durable Objects) | Cloudflare Durable Objects | ✅ Included |
| WebSocket routing | Pages Functions | ✅ Included |

**Total monthly cost: $0** (within free tier limits)

---

## Prerequisites

1. A **Cloudflare account** (free) — sign up at https://dash.cloudflare.com/sign-up
2. **Node.js 18+** installed on your computer — download from https://nodejs.org/
3. The **CircleSync deployment package** (this folder)

---

## Step-by-step Deployment

### Step 1: Install dependencies

Open a terminal in this folder and run:

```bash
npm install
```

### Step 2: Log in to Cloudflare

```bash
npx wrangler login
```

This opens your browser. Click **"Allow"** to authorize the Wrangler CLI.

### Step 3: Create the D1 database

```bash
npx wrangler d1 create circlesync
```

This outputs something like:
```
✅ Successfully created DB 'circlesync'
[[d1_databases]]
binding = "DB"
database_name = "circlesync"
database_id = "xxxx-xxxx-xxxx-xxxx-xxxx"
```

**Copy the `database_id` value** (the long string of letters/numbers).

### Step 4: Update wrangler.toml

Open `wrangler.toml` in a text editor. Find this line:
```toml
database_id = "<YOUR_D1_DATABASE_ID>"
```

Replace `<YOUR_D1_DATABASE_ID>` with the actual ID from Step 3.

### Step 5: Create the database tables

```bash
npx wrangler d1 execute circlesync --remote --file=schema.sql
```

You should see "3 queries executed" (creating the User, Circle, and CircleMember tables).

### Step 6: Build the app for Cloudflare

```bash
npm run build
```

This uses `@cloudflare/next-on-pages` to convert the Next.js app into a Cloudflare Pages-compatible format.

### Step 7: Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy
```

- When asked for a **project name**, type: `circlesync`
- When asked for a **production branch**, type: `main` (or press Enter)
- Wait ~1-2 minutes for the deployment to complete

**At the end, you'll see your permanent URL:**
```
✅ Deployment complete! Take a peek over at https://circlesync-xxx.pages.dev
```

**🎉 That URL is your permanent CircleSync server URL!** Copy it — you'll need it for the APK and to share with friends.

### Step 8: Test your deployment

Open the URL in your browser. You should see the CircleSync login page.

Sign up → Create a circle → Get your invite code → Share with friends!

---

## After Deployment: Updating the APK

The CircleSync APK asks for the server URL on first launch. After deploying:

1. Download the APK from this package (`public/downloads/CircleSync.apk`)
2. Install it on your Android phone
3. On first launch, enter your Cloudflare URL (e.g., `https://circlesync-xxx.pages.dev`)
4. Sign up and start using CircleSync!

### Optional: Bake the URL into the APK

If you want the APK to skip the URL input and connect automatically, edit the APK source in `android-apk/` and rebuild:

1. Open `android-apk/app/src/main/java/com/circlesync/app/MainActivity.java`
2. Find the line: `String savedUrl = prefs.getString(KEY_SERVER_URL, "");`
3. Change it to: `String savedUrl = prefs.getString(KEY_SERVER_URL, "https://circlesync-xxx.pages.dev");`
4. Rebuild using the build script: `bash build-apk.sh`

---

## Managing Your Deployment

### View your app
```bash
npx wrangler pages deployment list --project-name=circlesync
```

### View database
```bash
# List all users
npx wrangler d1 execute circlesync --remote --command="SELECT * FROM User"

# List all circles
npx wrangler d1 execute circlesync --remote --command="SELECT * FROM Circle"
```

### Push updates
After making code changes:
```bash
npm run build
npx wrangler pages deploy
```

### Delete everything (start fresh)
```bash
npx wrangler pages project delete circlesync
npx wrangler d1 delete circlesync
```

---

## Free Tier Limits

Cloudflare's free tier is very generous. CircleSync will stay free unless you have:
- **>100,000 page views per day** (Pages)
- **>5 million database reads per day** (D1)
- **>100,000 WebSocket connections per day** (Durable Objects)

For a friends-and-family circle, you'll never hit these limits.

---

## Troubleshooting

### "Error: wrangler not found"
Run `npm install` first, then use `npx wrangler` (not just `wrangler`).

### Database errors after deploy
Make sure you ran Step 5 with `--remote` flag. Without it, the tables are only created locally.

### WebSocket not connecting
- Make sure your Cloudflare Pages project has the Durable Object binding configured (check `wrangler.toml`)
- Check browser console for WebSocket errors
- Try redeploying: `npm run build && npx wrangler pages deploy`

### Build fails with "next-on-pages" error
- Delete `.next/` and `.vercel/` folders: `rm -rf .next .vercel`
- Run `npm install` again
- Retry `npm run build`

### "Durable Object class not found"
Make sure `wrangler.toml` has the migration section:
```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["CircleLocationDO"]
```

---

## File Structure

```
cloudflare-deploy/
├── wrangler.toml          ← Cloudflare config (edit database_id)
├── schema.sql             ← D1 database schema
├── package.json           ← Dependencies & scripts
├── next.config.js         ← Next.js config for edge runtime
├── schema.sql             ← Database migration
├── src/
│   ├── app/
│   │   ├── page.tsx       ← Main app (login, dashboard, map)
│   │   ├── layout.tsx     ← Root layout
│   │   ├── globals.css    ← Tailwind styles
│   │   └── api/           ← REST API routes (edge runtime)
│   │       ├── auth/      ← register, login, logout, me
│   │       └── circles/   ← create, join
│   ├── components/
│   │   ├── map-view.tsx   ← Leaflet map component
│   │   └── ui/            ← shadcn/ui components
│   ├── do/
│   │   └── circle-location.ts  ← Durable Object (replaces Socket.io)
│   ├── hooks/             ← React hooks
│   └── lib/
│       ├── db.ts          ← D1 database helper
│       ├── auth.ts        ← Web Crypto auth (edge-compatible)
│       └── utils.ts       ← Utilities
├── functions/
│   └── ws/[[route]].ts    ← Pages Function (WebSocket routing)
├── public/                ← Static assets (icons, manifest, APK)
└── android-apk/           ← Android APK source code
```

---

## Security Notes

- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations) using Web Crypto API
- Sessions use signed HttpOnly cookies
- Location data is only shared with members of circles you join
- The Durable Object only keeps locations in memory while you're actively sharing
- No location history is stored — when you stop sharing, your position disappears

---

## Need Help?

If something doesn't work, check:
1. The browser console (F12 → Console) for errors
2. Cloudflare dashboard → Pages → your project → Functions logs
3. `npx wrangler tail` to see real-time logs from your deployment
