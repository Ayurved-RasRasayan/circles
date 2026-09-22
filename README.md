# CircleSync

See your circle of friends on a live map - anywhere in the world.

Create a circle, share your invite code, and start tracking each other's locations in real-time.

**Live demo:** https://circlesync.rasrasayan.workers.dev

---

## Architecture

CircleSync is a Next.js 15 app deployed on **Cloudflare Workers** via OpenNext.

| Component | Service | Purpose |
|---|---|---|
| Frontend + API | Cloudflare Workers (OpenNext) | Next.js 15, React 18, Tailwind v4 |
| Database | Cloudflare D1 (SQLite) | Users, circles, memberships |
| Real-time | Cloudflare Durable Objects | WebSocket per circle, location broadcast |
| Static assets | Cloudflare Workers Assets | Icons, APK, manifest |
| Admin | Secret-key API + local HTML tool | User management |

**Cost:** $0 - fits comfortably within Cloudflare's free tier.
---

## Features

- **Auth** - register, login, logout (PBKDF2-SHA256 password hashing, signed HttpOnly cookies)
- **Circles** - create, list, join via 6-character invite codes
- **Live map** - Leaflet map showing all circle members currently sharing
- **Click-to-zoom** - click any user in "Live now" to fly the map to their marker
- **Configurable refresh** - pick location broadcast interval (seconds / minutes / hours)
- **Auto-start sharing** - sharing starts automatically when entering a circle
- **Self-marker** - you always see your own marker + "online" status when sharing
- **Admin API** - list + cascade-delete users via /api/admin/users

---

## Deployment

### Prerequisites

- Node.js 18+
- Cloudflare account (free) - https://dash.cloudflare.com/sign-up
- Git for Windows (for the Windows PATH workaround)
- PowerShell 5+ (Windows) or a POSIX shell (macOS / Linux)

### First-time setup

    npm install --legacy-peer-deps
    npx wrangler login
    npx wrangler d1 create circlesync
    # -> paste the database_id into wrangler.jsonc
    npx wrangler d1 execute circlesync --remote --file=schema.sql
    cd do-worker
    npx wrangler deploy --config wrangler.toml
    cd ..
    npx wrangler secret put ADMIN_KEY
    # -> paste a random string
    .\deploy.ps1

See SETUP.md for a detailed walkthrough.
### Redeploying after code changes

    .\deploy.ps1

That runs:

1. npm run build - Next.js production build
2. npx opennextjs-cloudflare build - convert to Cloudflare Worker bundle
3. npx wrangler deploy - upload to Cloudflare

### Pushing to GitHub

    .\push-to-github.ps1

Guards against committing local-only files (admin tooling, backups, secrets).

---

## Admin Tools

### List and delete users

Start the local admin web server:

    .\serve-admin.ps1

Then open http://localhost:8080/admin.html and enter your ADMIN_KEY.

The tool lets you:

- View every user (username, display name, ID, membership count)
- Delete a user with one click (cascades to memberships and any circles they created)

### Direct API access

    $key = "your-admin-key"
    Invoke-WebRequest -Uri "https://circlesync.rasrasayan.workers.dev/api/admin/users" -Headers @{ "x-admin-key" = $key } | ConvertFrom-Json
---

## Project Structure

    circles/
      src/
        app/
          page.tsx               Main app (auth, dashboard, map, WebSocket)
          layout.tsx             Root layout
          globals.css            Tailwind v4 styles
          api/
            auth/                register, login, logout, me
            circles/             list, create, join
            admin/               list users, delete user (secret-key protected)
        components/
          map-view.tsx           Leaflet map with flyToUser
          ui/                    shadcn/ui primitives
        do/
          circle-location.ts     Original DO class (reference)
        hooks/                   React hooks
        lib/
          db.ts                  D1 helper (getCloudflareContext)
          auth.ts                Password hashing, session cookies
          utils.ts
      do-worker/
        index.ts                 Deployed DO class (hibernation-safe WebSocket)
        wrangler.toml            DO Worker config
      public/                    Static assets (icons, APK, manifest)
      android-apk/               Android APK source
      wrangler.jsonc             Main Worker config
      open-next.config.ts        OpenNext adapter config
      schema.sql                 D1 schema
      package.json

---

## Scripts (local, gitignored)

| Script | Purpose |
|---|---|
| deploy.ps1 | Rebuild + redeploy to Cloudflare |
| push-to-github.ps1 | Safe commit + push (guards secrets) |
| serve-admin.ps1 | Local HTTP server for admin.html |
| admin.html | Click-to-delete user management UI |

These files are NOT pushed to GitHub (see .gitignore).
---

## Cloudflare Resources

| Resource | Name | Notes |
|---|---|---|
| Worker (main) | circlesync | Next.js app via OpenNext |
| Worker (DO) | circlesync-do | Durable Object, WebSocket per circle |
| D1 database | circlesync | User, Circle, CircleMember tables |
| Secret | ADMIN_KEY | Admin API authentication |

---

## Security

- Passwords hashed with PBKDF2-SHA256 (100k iterations, Web Crypto API)
- Session cookies: HttpOnly, Secure, SameSite=Lax, 30-day expiry
- Admin API requires the x-admin-key header (Cloudflare secret)
- Location data is only shared with members of circles you have joined
- The Durable Object keeps positions in memory only - no location history stored
- When you stop sharing, your position disappears

---

## Free Tier Limits

| Service | Free tier |
|---|---|
| Workers requests | 100,000 / day |
| D1 reads | 5,000,000 / day |
| D1 writes | 100,000 / day |
| Durable Object requests | 1,000,000 / month |
| Durable Object duration | 400,000 GB-s / month |

For a friends-and-family circle, you will never come close.

---

## Troubleshooting

### Build fails on Windows with spawn npx ENOENT

The OpenNext CLI calls npx vercel build internally, which fails on Windows when it cannot find npx. The deploy.ps1 script handles this by hiding open-next.config.ts during wrangler deploy.

### wrangler deploy fails with "Completion token has already been consumed"

Transient Cloudflare API error. Just retry: npx wrangler deploy

### WebSocket shows "Connecting..." forever

Check DevTools -> Network -> WS. Look for wss://circlesync-do.<your-subdomain>.workers.dev/ws. Status 101 = connected.

### Geolocation times out on desktop

Desktop browsers use WiFi/IP triangulation. Increase the timeout in src/app/page.tsx.

---

## License

MIT

---

## Credits

- Next.js 15 - https://nextjs.org
- Cloudflare Workers - https://workers.cloudflare.com
- Cloudflare D1 - https://developers.cloudflare.com/d1/
- Cloudflare Durable Objects - https://developers.cloudflare.com/durable-objects/
- OpenNext Cloudflare adapter - https://opennext.js.org/cloudflare
- Leaflet - https://leafletjs.com
- shadcn/ui - https://ui.shadcn.com
- Tailwind CSS v4 - https://tailwindcss.com
<!-- Deployed via Cloudflare Workers Builds -->
