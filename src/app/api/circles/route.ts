import { NextRequest, NextResponse } from 'next/server'
import { getDB, generateId, generateInviteCode } from '@/lib/db'
import { parseSession } from '@/lib/auth'

export const runtime = 'edge'

async function getUniqueInviteCode(db): Promise<string> {
  let code = generateInviteCode()
  let existing = await db.prepare('SELECT id FROM Circle WHERE inviteCode = ?').bind(code).first()
  let attempts = 0
  while (existing && attempts < 10) {
    code = generateInviteCode()
    existing = await db.prepare('SELECT id FROM Circle WHERE inviteCode = ?').bind(code).first()
    attempts++
  }
  return code
}

// GET /api/circles - list circles for the current user
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie')
  const session = parseSession(cookieHeader)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDB(req)

  // Get all circles the user is a member of
  const memberships = await db.prepare(`
    SELECT Circle.id, Circle.name, Circle.inviteCode, Circle.description, Circle.createdBy, Circle.createdAt
    FROM CircleMember
    JOIN Circle ON CircleMember.circleId = Circle.id
    WHERE CircleMember.userId = ?
    ORDER BY CircleMember.joinedAt DESC
  `).bind(session.userId).all()

  const circles = []
  for (const c of memberships.results) {
    // Get members of each circle
    const membersResult = await db.prepare(`
      SELECT User.id, User.username, User.displayName, User.avatarColor, CircleMember.joinedAt
      FROM CircleMember
      JOIN User ON CircleMember.userId = User.id
      WHERE CircleMember.circleId = ?
    `).bind(c.id).all()

    circles.push({
      id: c.id,
      name: c.name,
      description: c.description,
      inviteCode: c.inviteCode,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      members: membersResult.results,
    })
  }

  return NextResponse.json({ circles })
}

// POST /api/circles - create a new circle
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie')
  const session = parseSession(cookieHeader)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, description } = await req.json()
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Circle name must be at least 2 characters' }, { status: 400 })
    }

    const db = getDB(req)
    const inviteCode = await getUniqueInviteCode(db)
    const id = generateId()

    // Create the circle
    await db.prepare(
      'INSERT INTO Circle (id, name, description, inviteCode, createdBy) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, name.trim(), description?.trim() || null, inviteCode, session.userId).run()

    // Add the creator as a member
    const memberId = generateId()
    await db.prepare(
      'INSERT INTO CircleMember (id, userId, circleId) VALUES (?, ?, ?)'
    ).bind(memberId, session.userId, id).run()

    // Get the creator's info for the response
    const creator = await db.prepare(
      'SELECT id, username, displayName, avatarColor FROM User WHERE id = ?'
    ).bind(session.userId).first()

    return NextResponse.json({
      circle: {
        id,
        name: name.trim(),
        description: description?.trim() || null,
        inviteCode,
        createdBy: session.userId,
        createdAt: new Date().toISOString(),
        members: [{
          id: creator.id,
          username: creator.username,
          displayName: creator.displayName,
          avatarColor: creator.avatarColor,
          joinedAt: new Date().toISOString(),
        }],
      }
    })
  } catch (e) {
    console.error('Create circle error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
