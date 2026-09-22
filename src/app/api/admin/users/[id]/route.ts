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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }
  const { id } = await ctx.params
  const db = getDB()

  await db.prepare('DELETE FROM CircleMember WHERE userId = ?').bind(id).run()
  await db.prepare('DELETE FROM CircleMember WHERE circleId IN (SELECT id FROM Circle WHERE createdBy = ?)').bind(id).run()
  await db.prepare('DELETE FROM Circle WHERE createdBy = ?').bind(id).run()
  await db.prepare('DELETE FROM User WHERE id = ?').bind(id).run()

  return NextResponse.json({ success: true, deletedId: id }, { headers: CORS_HEADERS })
}