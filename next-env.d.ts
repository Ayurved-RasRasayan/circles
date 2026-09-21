# Cloudflare Pages environment types
# This file tells TypeScript about Cloudflare bindings

interface CloudflareEnv {
  DB: D1Database
  CIRCLE_LOCATIONS: DurableObjectNamespace
  ENVIRONMENT: string
}

declare global {
  interface Env extends CloudflareEnv {}
}
