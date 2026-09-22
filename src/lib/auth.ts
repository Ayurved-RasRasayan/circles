// Edge-compatible authentication using Web Crypto API
// Replaces bcrypt + Node.js crypto with PBKDF2 (available in Workers runtime)

export const SESSION_COOKIE = 'circlesync_session'

// Hash a password using PBKDF2 with SHA-256
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16)
  crypto.getRandomValues(saltBytes)
  const salt = bufferToHex(saltBytes)

  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )

  const hash = bufferToHex(new Uint8Array(derivedBits))
  return { hash, salt }
}

// Verify a password against the stored hash and salt
export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const saltBytes = hexToBuffer(salt)
  const encoder = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )

  const computedHash = bufferToHex(new Uint8Array(derivedBits))
  return computedHash === storedHash
}

// Convert ArrayBuffer to hex string
function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Convert hex string to Uint8Array
function hexToBuffer(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return arr
}

// Base64 encode (edge-compatible)
function base64Encode(str: string): string {
  // Use btoa if available, otherwise manual
  if (typeof btoa !== 'undefined') {
    return btoa(str)
  }
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

// Base64 decode (edge-compatible)
function base64Decode(str: string): string {
  if (typeof atob !== 'undefined') {
    return atob(str)
  }
  return Buffer.from(str, 'base64').toString('utf-8')
}

export function createSessionCookie(userId: string, username: string): string {
  const value = base64Encode(`${userId}|${username}`)
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`
}

export function clearSessionCookie(): string {
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT'
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=${expires}`
}

export function parseSession(cookieHeader: string | null): { userId: string; username: string } | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!match) return null
  try {
    const decoded = base64Decode(match[1])
    const [userId, username] = decoded.split('|')
    if (!userId || !username) return null
    return { userId, username }
  } catch {
    return null
  }
}
