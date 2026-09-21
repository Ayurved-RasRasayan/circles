import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export const runtime = 'edge'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.headers.set('Set-Cookie', clearSessionCookie())
  return res
}
