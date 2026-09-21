#!/bin/bash
# CircleSync Cloudflare Deployment Script
# Run this after npm install and npx wrangler login

set -e

echo "🚀 CircleSync Cloudflare Deployment"
echo "===================================="
echo ""

# Step 1: Create D1 database
echo "📦 Step 1: Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create circlesync 2>&1 || true)
echo "$DB_OUTPUT"

# Extract database ID
DB_ID=$(echo "$DB_OUTPUT" | grep "database_id" | head -1 | sed 's/.*= "//' | sed 's/"//')
if [ -z "$DB_ID" ]; then
  echo "⚠️  Could not auto-extract database ID. The database may already exist."
  echo "   If it already exists, find the ID in your Cloudflare dashboard:"
  echo "   https://dash.cloudflare.com/ → Workers & Pages → D1 → circlesync"
  echo ""
  echo "   Then paste it into wrangler.toml and re-run this script starting from step 2."
  echo ""
  read -p "   Enter your D1 database ID (or press Ctrl+C to quit): " DB_ID
fi

# Step 2: Update wrangler.toml
echo ""
echo "📝 Step 2: Updating wrangler.toml with database ID..."
sed -i.bak "s/<YOUR_D1_DATABASE_ID>/$DB_ID/g" wrangler.toml
echo "   ✅ wrangler.toml updated"

# Step 3: Create database tables
echo ""
echo "🗄️  Step 3: Creating database tables..."
npx wrangler d1 execute circlesync --remote --file=schema.sql
echo "   ✅ Tables created"

# Step 4: Build
echo ""
echo "🔨 Step 4: Building app for Cloudflare..."
npm run build
echo "   ✅ Build complete"

# Step 5: Deploy
echo ""
echo "🚀 Step 5: Deploying to Cloudflare Pages..."
npx wrangler pages deploy

echo ""
echo "===================================="
echo "🎉 Deployment complete!"
echo ""
echo "Your CircleSync URL is shown above (https://circlesync-xxx.pages.dev)"
echo ""
echo "Next steps:"
echo "  1. Install CircleSync.apk on your Android phone"
echo "  2. Enter the URL above when the APK asks for a server URL"
echo "  3. Sign up, create a circle, and share the invite code with friends!"
echo ""
echo "===================================="
