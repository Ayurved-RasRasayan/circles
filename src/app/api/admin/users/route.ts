import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-please'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function checkAuth(req: Request) {
  return req.headers.get('x-admin-key') === ADMIN_KEY
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }
  const db = getDB()
  const users = await db.prepare(
    'SELECT id, username, displayName, avatarColor, createdAt FROM User ORDER BY createdAt DESC'
  ).all()
  const memberships = await db.prepare(
    'SELECT userId, COUNT(*) as count FROM CircleMember GROUP BY userId'
  ).all()
  const circles = await db.prepare(
    'SELECT createdBy, COUNT(*) as count FROM Circle GROUP BY createdBy'
  ).all()
  const memberMap = Object.fromEntries(memberships.results.map((r: any) => [r.userId, r.count]))
  const circleMap = Object.fromEntries(circles.results.map((r: any) => [r.createdBy, r.count]))
  const enriched = users.results.map((u: any) => ({
    ...u,
    memberships: memberMap[u.id] || 0,
    circlesCreated: circleMap[u.id] || 0,
  }))
  return NextResponse.json({ users: enriched }, { headers: CORS_HEADERS })
}