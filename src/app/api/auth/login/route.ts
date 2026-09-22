import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { verifyPassword, createSessionCookie } from '@/lib/auth'


export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const db = getDB(req)
    const user = await db.prepare(
      'SELECT id, username, displayName, avatarColor, passwordHash, passwordSalt FROM User WHERE username = ?'
    ).bind(username).first()

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const res = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
      }
    })
    res.headers.set('Set-Cookie', createSessionCookie(user.id, user.username))
    return res
  } catch (e) {
    console.error('Login error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
