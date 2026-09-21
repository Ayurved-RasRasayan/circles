// D1 Database helper
// Replaces Prisma with raw SQL queries against Cloudflare D1

export interface UserRow {
  id: string
  username: string
  displayName: string
  avatarColor: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  updatedAt: string
}

export interface CircleRow {
  id: string
  name: string
  inviteCode: string
  description: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CircleMemberRow {
  id: string
  userId: string
  circleId: string
  joinedAt: string
}

// Get the D1 binding from the request context
// On Cloudflare Pages, the binding is available via getRequestContext()
export function getDB(request) {
  // @cloudflare/next-on-pages provides getRequestContext()
  const { getRequestContext } = require('@cloudflare/next-on-pages')
  const ctx = getRequestContext()
  return ctx.env.DB
}

// Generate a unique ID (replaces Prisma's cuid())
export function generateId(): string {
  // Use Web Crypto API for edge compatibility
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a 6-character invite code
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  for (let i = 0; i < 6; i++) {
    code += chars[arr[i] % chars.length]
  }
  return code
}
