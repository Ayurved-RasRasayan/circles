import { NextRequest, NextResponse } from 'next/server'
import { getDB, generateId } from '@/lib/db'
import { hashPassword, createSessionCookie } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { username, displayName, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
    }

    if (password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }

    const db = getDB(req)

    // Check if username exists
    const existing = await db.prepare('SELECT id FROM User WHERE username = ?').bind(username).first()
    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    // Hash password
    const { hash, salt } = await hashPassword(password)

    // Pick a random avatar color
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6']
    const avatarColor = colors[Math.floor(Math.random() * colors.length)]

    const id = generateId()
    const name = displayName || username

    await db.prepare(
      'INSERT INTO User (id, username, displayName, avatarColor, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, username, name, avatarColor, hash, salt).run()

    const res = NextResponse.json({
      user: { id, username, displayName: name, avatarColor }
    })
    res.headers.set('Set-Cookie', createSessionCookie(id, username))
    return res
  } catch (e) {
    console.error('Register error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
