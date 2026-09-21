import { NextRequest, NextResponse } from 'next/server'
import { getDB, generateId } from '@/lib/db'
import { parseSession } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie')
  const session = parseSession(cookieHeader)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { inviteCode } = await req.json()
    if (!inviteCode || inviteCode.length !== 6) {
      return NextResponse.json({ error: 'Invite code must be 6 characters' }, { status: 400 })
    }

    const code = inviteCode.toUpperCase().trim()
    const db = getDB(req)

    // Find the circle
    const circle = await db.prepare(
      'SELECT id, name, description, inviteCode, createdBy, createdAt FROM Circle WHERE inviteCode = ?'
    ).bind(code).first()

    if (!circle) {
      return NextResponse.json({ error: 'Circle not found. Check the invite code.' }, { status: 404 })
    }

    // Check if already a member
    const existing = await db.prepare(
      'SELECT id FROM CircleMember WHERE userId = ? AND circleId = ?'
    ).bind(session.userId, circle.id).first()

    if (!existing) {
      // Add as member
      const memberId = generateId()
      await db.prepare(
        'INSERT INTO CircleMember (id, userId, circleId) VALUES (?, ?, ?)'
      ).bind(memberId, session.userId, circle.id).run()
    }

    // Get all members
    const membersResult = await db.prepare(`
      SELECT User.id, User.username, User.displayName, User.avatarColor, CircleMember.joinedAt
      FROM CircleMember
      JOIN User ON CircleMember.userId = User.id
      WHERE CircleMember.circleId = ?
    `).bind(circle.id).all()

    return NextResponse.json({
      circle: {
        ...circle,
        members: membersResult.results,
      }
    })
  } catch (e) {
    console.error('Join circle error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
