import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { parseSession } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie')
  const session = parseSession(cookieHeader)

  if (!session) {
    return NextResponse.json({ user: null })
  }

  const db = getDB(req)
  const user = await db.prepare(
    'SELECT id, username, displayName, avatarColor FROM User WHERE id = ?'
  ).bind(session.userId).first()

  if (!user) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({ user })
}
