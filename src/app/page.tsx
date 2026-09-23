'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
// Native WebSocket (replaces socket.io-client for Cloudflare Durable Objects)
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  MapPin, Users, LogOut, Plus, UserPlus, Copy, RefreshCw,
  Navigation, Eye, EyeOff, ChevronLeft, Globe, Share2, Loader2, Wifi, WifiOff, Check
} from 'lucide-react'

const MapView = dynamic(() => import('@/components/map-view'), { ssr: false })

interface User {
  id: string
  username: string
  displayName: string
  avatarColor: string
}

interface CircleMember {
  id: string
  username: string
  displayName: string
  avatarColor: string
  joinedAt: string
}

interface Circle {
  id: string
  name: string
  description?: string | null
  inviteCode: string
  createdBy: string
  createdAt: string
  members: CircleMember[]
}

interface LiveMember {
  userId: string
  username: string
  displayName: string
  avatarColor: string
  lat: number
  lng: number
  accuracy?: number
  heading?: number
  timestamp: number
}

type View = 'login' | 'dashboard' | 'circle'

export default function Home() {
  const { toast } = useToast()
  const [view, setView] = useState<View>('login')
  const [user, setUser] = useState<User | null>(null)
  const [circles, setCircles] = useState<Circle[]>([])
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null)
  const [liveMembers, setLiveMembers] = useState<LiveMember[]>([])
  const [loading, setLoading] = useState(true)
  const [isSharing, setIsSharing] = useState(true)
  const [myPos, setMyPos] = useState<{ lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null; timestamp: number } | null>(null)
  const [followMe, setFollowMe] = useState(true)
  const [socketConnected, setSocketConnected] = useState(false)
  const [refreshValue, setRefreshValue] = useState<number>(() => {
    if (typeof window === 'undefined') return 10
    const v = Number(localStorage.getItem('circlesync_refresh_value'))
    return v > 0 ? v : 10
  })
  const [refreshUnit, setRefreshUnit] = useState<'seconds' | 'minutes' | 'hours'>(() => {
    if (typeof window === 'undefined') return 'seconds'
    const u = localStorage.getItem('circlesync_refresh_unit')
    return (u === 'minutes' || u === 'hours') ? u : 'seconds'
  })

  const socketRef = useRef<WebSocket | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastSentRef = useRef<number>(0)
  const lastPosRef = useRef<{ lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null } | null>(null)
  const recenterRef = useRef<(() => void) | null>(null)
  const flyToUserRef = useRef<((userId: string) => void) | null>(null)

  const loadCircles = useCallback(async () => {
    try {
      const r = await fetch('/api/circles')
      const data = await r.json()
      setCircles(data.circles || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  // Check current session
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
          setView('dashboard')
          loadCircles()
        }
      })
      .finally(() => setLoading(false))
  }, [loadCircles])

  // -- Auth handlers --
  const handleAuth = async (action: 'login' | 'register', body: Record<string, string>) => {
    try {
      const r = await fetch(`/api/auth/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) {
        toast({ title: 'Error', description: data.error || 'Something went wrong', variant: 'destructive' })
        return
      }
      setUser(data.user)
      setView('dashboard')
      await loadCircles()
      toast({ title: `Welcome, ${data.user.displayName}!` })
    } catch (e) {
      toast({ title: 'Network error', variant: 'destructive' })
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setCircles([])
    setActiveCircle(null)
    setLiveMembers([])
    setView('login')
  }

  // -- Circle handlers --
  const handleCreateCircle = async (name: string, description: string) => {
    try {
      const r = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
        return
      }
      await loadCircles()
      toast({ title: 'Circle created!', description: `Invite code: ${data.circle.inviteCode}` })
      return data.circle as Circle
    } catch (e) {
      toast({ title: 'Network error', variant: 'destructive' })
    }
  }

  const handleJoinCircle = async (inviteCode: string) => {
    try {
      const r = await fetch('/api/circles/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
        return null
      }
      await loadCircles()
      toast({ title: `Joined ${data.circle.name}!` })
      return data.circle as Circle
    } catch (e) {
      toast({ title: 'Network error', variant: 'destructive' })
    }
    return null
  }

  const openCircle = (circle: Circle) => {
    setActiveCircle(circle)
    setLiveMembers([])
    setView('circle')
  }

  const closeCircle = () => {
    // Stop sharing and disconnect WebSocket
    stopLocationSharing()
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'stop-sharing' }))
      socketRef.current.close()
      socketRef.current = null
    }
    setSocketConnected(false)
    setActiveCircle(null)
    setLiveMembers([])
    setView('dashboard')
  }

  // -- WebSocket connection when entering a circle --
  // Uses native WebSocket instead of Socket.io (Cloudflare Durable Objects)
  useEffect(() => {
    if (view !== 'circle' || !activeCircle || !user) return

    // Build WebSocket URL: ws://host/ws?circle=<circleId>&userId=...&username=...
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `wss://circlesync-do.rasrasayan.workers.dev/ws?circle=${activeCircle.id}&userId=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username)}&displayName=${encodeURIComponent(user.displayName)}&avatarColor=${encodeURIComponent(user.avatarColor)}`

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      ws = new WebSocket(wsUrl)
      socketRef.current = ws

      ws.onopen = () => {
        setSocketConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'circle-state') {
            const byId = new Map<string, LiveMember>()
            for (const m of (data.members || [])) {
              const existing = byId.get(m.userId)
              if (!existing || (m.timestamp || 0) > (existing.timestamp || 0)) {
                byId.set(m.userId, m)
              }
            }
            setLiveMembers(Array.from(byId.values()))
          } else if (data.type === 'location-update') {
            const loc: LiveMember = {
              userId: data.userId,
              username: data.username,
              displayName: data.displayName,
              avatarColor: data.avatarColor,
              lat: data.lat,
              lng: data.lng,
              accuracy: data.accuracy,
              heading: data.heading,
              timestamp: data.timestamp,
            }
            setLiveMembers((prev) => {
              const next = prev.filter((m) => m.userId !== loc.userId)
              next.push(loc)
              return next
            })
          } else if (data.type === 'member-left') {
            setLiveMembers((prev) => prev.filter((m) => m.userId !== data.userId))
          } else if (data.type === 'member-online') {
            toast({ title: `${data.user.displayName} came online` })
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e)
        }
      }

      ws.onclose = () => {
        setSocketConnected(false)
        // Auto-reconnect unless we closed intentionally
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        setSocketConnected(false)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop-sharing' }))
        ws.close()
      }
      socketRef.current = null
      setSocketConnected(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeCircle, user])

  // -- Location sharing --
  const startLocationSharing = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: 'Geolocation not supported', variant: 'destructive' })
      return
    }
    if (watchIdRef.current !== null) return

    setIsSharing(true)

    // Notify native Android service to start background sharing
    try {
      if (typeof window !== 'undefined' && (window as any).AndroidBridge?.startSharing) {
        const bridgeWsUrl = "wss://circlesync-do.rasrasayan.workers.dev/ws?circle=" + (activeCircle?.id || "")
        ;(window as any).AndroidBridge.startSharing(
          bridgeWsUrl,
          user?.id || "",
          user?.username || "",
          user?.displayName || "",
          user?.avatarColor || "#10b981",
          refreshValue * (refreshUnit === "seconds" ? 1000 : refreshUnit === "minutes" ? 60000 : 3600000)
        )
      }
    } catch (e) { console.log('AndroidBridge not available') }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords

        // Store latest position
        lastPosRef.current = { lat: latitude, lng: longitude, accuracy, heading, speed }
        setMyPos({ lat: latitude, lng: longitude, accuracy, heading, speed, timestamp: Date.now() })

        // Throttle: only send at the user-selected interval
        const UNIT_MS = { seconds: 1000, minutes: 60000, hours: 3600000 }
        const intervalMs = Math.max(1000, refreshValue * UNIT_MS[refreshUnit])
        const now = Date.now()
        if (now - lastSentRef.current < intervalMs) return
        lastSentRef.current = now

        socketRef.current?.send(JSON.stringify({
          type: 'location-update',
          lat: latitude,
          lng: longitude,
          accuracy,
          heading,
          speed,
          sharing: true,
        }))
      },
      (err) => {
        console.error('Geolocation error:', err)
        let msg = 'Failed to get location'
        if (err.code === 1) msg = 'Location permission denied'
        else if (err.code === 2) msg = 'Position unavailable'
        else if (err.code === 3) msg = 'Location timeout'
        toast({ title: msg, variant: 'destructive' })
        setIsSharing(false)
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    )
  }, [toast, activeCircle, user, refreshValue, refreshUnit])

  // Auto-start location sharing when entering a circle
  useEffect(() => {
    if (view !== 'circle' || !activeCircle || !socketConnected) return
    if (isSharing && watchIdRef.current !== null) return
    console.log('[auto-start] triggering startLocationSharing')
    startLocationSharing()
  }, [view, activeCircle, socketConnected, isSharing, startLocationSharing])

  const stopLocationSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsSharing(false)
    socketRef.current?.send(JSON.stringify({ type: 'stop-sharing' }))

    // Stop native Android service
    try {
      if (typeof window !== 'undefined' && (window as any).AndroidBridge?.stopSharing) {
        ;(window as any).AndroidBridge.stopSharing()
      }
    } catch (e) {}
  }, [])

  const toggleSharing = () => {
    if (isSharing) stopLocationSharing()
    else startLocationSharing()
  }

  // Persist refresh settings
  useEffect(() => {
    localStorage.setItem('circlesync_refresh_value', String(refreshValue))
    localStorage.setItem('circlesync_refresh_unit', refreshUnit)
  }, [refreshValue, refreshUnit])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      socketRef.current?.close()
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  // ---------- LOGIN VIEW ----------
  if (view === 'login') {
    return (
      <LoginView onAuth={handleAuth} />
    )
  }

  // ---------- DASHBOARD VIEW ----------
  if (view === 'dashboard' && user) {
    return (
      <DashboardView
        user={user}
        circles={circles}
        onLogout={handleLogout}
        onCreate={handleCreateCircle}
        onJoin={handleJoinCircle}
        onOpenCircle={openCircle}
      />
    )
  }

  // ---------- CIRCLE VIEW ----------
  if (view === 'circle' && activeCircle && user) {
    const selfEntry = (isSharing && myPos) ? {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      lat: myPos.lat,
      lng: myPos.lng,
      accuracy: myPos.accuracy ?? undefined,
      heading: myPos.heading ?? undefined,
      timestamp: myPos.timestamp,
      isMe: true,
    } : null

    const othersMap = liveMembers.filter((m) => m.userId !== user.id).map((m) => ({
      ...m,
      isMe: false,
    }))

    const mapMembers = selfEntry ? [selfEntry, ...othersMap] : othersMap
    return (
      <CircleView
        circle={activeCircle}
        user={user}
        liveMembers={liveMembers}
        mapMembers={mapMembers}
        isSharing={isSharing}
        socketConnected={socketConnected}
        refreshValue={refreshValue}
        refreshUnit={refreshUnit}
        onRefreshValueChange={setRefreshValue}
        onRefreshUnitChange={setRefreshUnit}
        followMe={followMe}
        onToggleFollow={() => setFollowMe(!followMe)}
        onToggleSharing={toggleSharing}
        onClose={closeCircle}
        onRecenter={(cb) => { recenterRef.current = cb }}
        onRecenterClick={() => recenterRef.current?.()}
        onMemberClick={(userId) => {
          // Pause auto-follow if the user clicked someone other than themselves
          if (userId === user.id) {
            setFollowMe(true)
          } else {
            setFollowMe(false)
          }
          flyToUserRef.current?.(userId)
        }}
        onFlyToUserReady={(cb) => { flyToUserRef.current = cb }}
        myPos={myPos}
      />
    )
  }

  return null
}

// ============== LOGIN VIEW ==============
function LoginView({ onAuth }: {
  onAuth: (action: 'login' | 'register', body: Record<string, string>) => void
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [regForm, setRegForm] = useState({ username: '', displayName: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [serverUrl] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''))

  const copyUrl = () => {
    navigator.clipboard.writeText(serverUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submit = async () => {
    setLoading(true)
    if (tab === 'login') {
      await onAuth('login', loginForm)
    } else {
      await onAuth('register', regForm)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Server URL banner */}
      {serverUrl && (
        <div className="bg-emerald-700 text-white px-4 py-3 text-center text-sm">
          <div className="font-semibold mb-0.5">Your CircleSync Server URL</div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <code className="bg-emerald-900/40 px-2 py-0.5 rounded font-mono text-xs break-all">{serverUrl}</code>
            <button
              onClick={copyUrl}
              className="inline-flex items-center gap-1 bg-white text-emerald-700 px-2 py-0.5 rounded text-xs font-semibold hover:bg-emerald-50"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="text-xs text-emerald-100 mt-1">
            Type this URL into the CircleSync APK on first launch
          </div>
        </div>
      )}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Logo / Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-200">
              <Globe className="h-10 w-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">CircleSync</h1>
              <p className="mt-2 text-sm text-slate-600">
                See your circle of friends on a live map â€” anywhere in the world.
              </p>
            </div>
          </div>

          {/* Auth card */}
          <Card className="border-0 shadow-xl shadow-slate-200/60">
            <CardContent className="pt-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Create Account</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="lu">Username</Label>
                    <Input
                      id="lu"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      placeholder="your_username"
                      autoCapitalize="none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lp">Password</Label>
                    <Input
                      id="lp"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="register" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ru">Username</Label>
                    <Input
                      id="ru"
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                      placeholder="your_username"
                      autoCapitalize="none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rd">Display name</Label>
                    <Input
                      id="rd"
                      value={regForm.displayName}
                      onChange={(e) => setRegForm({ ...regForm, displayName: e.target.value })}
                      placeholder="Alex Lee"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rp">Password</Label>
                    <Input
                      id="rp"
                      type="password"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="At least 4 characters"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                className="w-full mt-6 h-11 text-base"
                size="lg"
                disabled={loading}
                onClick={submit}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  tab === 'login' ? 'Sign In' : 'Create Account'
                )}
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500">
            Your location is shared only with members of circles you join.
          </p>
        </div>
      </main>
      <Toaster />
    </div>
  )
}

// ============== DASHBOARD VIEW ==============
function DashboardView({ user, circles, onLogout, onCreate, onJoin, onOpenCircle }: {
  user: User
  circles: Circle[]
  onLogout: () => void
  onCreate: (name: string, description: string) => Promise<Circle | undefined>
  onJoin: (code: string) => Promise<Circle | null>
  onOpenCircle: (c: Circle) => void
}) {
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setBusy(true)
    const c = await onCreate(newName, newDesc)
    setBusy(false)
    if (c) {
      setCreateOpen(false)
      setNewName('')
      setNewDesc('')
      onOpenCircle(c)
    }
  }

  const handleJoin = async () => {
    if (joinCode.trim().length !== 6) {
      toast({ title: 'Invite code must be 6 characters', variant: 'destructive' })
      return
    }
    setBusy(true)
    const c = await onJoin(joinCode.trim().toUpperCase())
    setBusy(false)
    if (c) {
      setJoinOpen(false)
      setJoinCode('')
      onOpenCircle(c)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({ title: 'Invite code copied', description: `Share "${code}" with your friends` })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900 leading-tight">CircleSync</div>
              <div className="text-xs text-slate-500 leading-tight">{circles.length} circles</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-100">
              <Avatar className="h-6 w-6" style={{ backgroundColor: user.avatarColor }}>
                <AvatarFallback style={{ backgroundColor: user.avatarColor, color: 'white' }} className="text-xs">
                  {user.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-slate-700">{user.displayName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onLogout} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-auto py-4 flex flex-col items-center gap-1 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-5 w-5" />
                <span className="text-sm font-semibold">Create Circle</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new circle</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label htmlFor="cn">Circle name</Label>
                  <Input id="cn" value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Travel Buddies" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cd">Description (optional)</Label>
                  <Input id="cd" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="A short description" />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <UserPlus className="h-5 w-5" />
                <span className="text-sm font-semibold">Join Circle</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a circle</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="jc">Invite code</Label>
                <Input
                  id="jc"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="6-CHAR CODE"
                  maxLength={6}
                  className="text-center text-2xl font-mono tracking-[0.5em]"
                />
                <p className="text-xs text-slate-500">Ask your friend for the 6-character invite code.</p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleJoin} disabled={busy || joinCode.length !== 6}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Circles list */}
        {circles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Users className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-700 mb-1">No circles yet</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                Create a new circle or join one with an invite code to start sharing your location with friends.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {circles.map((c) => (
              <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onOpenCircle(c)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{c.name}</h3>
                      {c.description && (
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>
                      )}
                    </div>
                    <div className="flex -space-x-2 ml-2">
                      {c.members.slice(0, 3).map((m) => (
                        <Avatar key={m.id} className="h-7 w-7 border-2 border-white" style={{ backgroundColor: m.avatarColor }}>
                          <AvatarFallback style={{ backgroundColor: m.avatarColor, color: 'white' }} className="text-xs">
                            {m.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {c.members.length > 3 && (
                        <div className="h-7 w-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600">
                          +{c.members.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono tracking-wider">
                      {c.inviteCode}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyCode(c.inviteCode)
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {c.members.length} member{c.members.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      Open map <ChevronLeft className="h-3 w-3 rotate-180" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Toaster />
    </div>
  )
}

// ============== CIRCLE VIEW ==============
function CircleView({
  circle, user, liveMembers, mapMembers, isSharing, socketConnected,
  refreshValue, refreshUnit, onRefreshValueChange, onRefreshUnitChange,
  followMe, onToggleFollow, onToggleSharing, onClose, onRecenter, onRecenterClick, onMemberClick, onFlyToUserReady, myPos,
}: {
  refreshValue: number
  refreshUnit: 'seconds' | 'minutes' | 'hours'
  onRefreshValueChange: (v: number) => void
  onRefreshUnitChange: (u: 'seconds' | 'minutes' | 'hours') => void
  circle: Circle
  user: User
  liveMembers: LiveMember[]
  mapMembers: Array<LiveMember & { isMe: boolean }>
  isSharing: boolean
  socketConnected: boolean
  followMe: boolean
  onToggleFollow: () => void
  onToggleSharing: () => void
  onClose: () => void
  onRecenter: (cb: () => void) => void
  onRecenterClick: () => void
  onMemberClick: (userId: string) => void
  onFlyToUserReady: (cb: (userId: string) => void) => void
  myPos: { lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null; timestamp: number } | null
}) {
  const { toast } = useToast()
  const [showMembers, setShowMembers] = useState(true)
  // Build self entry from myPos so we always appear online when sharing
  const selfEntry = (myPos && isSharing) ? {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    lat: myPos.lat,
    lng: myPos.lng,
    accuracy: myPos.accuracy ?? undefined,
    heading: myPos.heading ?? undefined,
    timestamp: myPos.timestamp,
  } : null

  // Merge self entry + other members, then dedupe by userId (keep latest)
  const liveMap = new Map<string, any>()
  if (selfEntry) liveMap.set(user.id, selfEntry)
  for (const m of liveMembers) {
    if (m.userId === user.id) continue
    if (Date.now() - m.timestamp >= 5 * 60 * 1000) continue
    const existing = liveMap.get(m.userId)
    if (!existing || (m.timestamp || 0) > (existing.timestamp || 0)) {
      liveMap.set(m.userId, m)
    }
  }
  const live = Array.from(liveMap.values())
  const myLive = liveMembers.find((m) => m.userId === user.id)

  const copyCode = () => {
    navigator.clipboard.writeText(circle.inviteCode)
    toast({ title: 'Invite code copied', description: circle.inviteCode })
  }

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col">
      {/* Map */}
      <div className="absolute inset-0">
        <MapView
          members={mapMembers}
          followUserId={followMe ? user.id : null}
          onRecenter={onRecenter}
          onFlyToUser={onFlyToUserReady}
        />
      </div>

      {/* Top bar overlay */}
      <div className="pointer-events-none relative z-[1000] flex items-center justify-end gap-2 p-3 bg-gradient-to-b from-slate-900/80 to-transparent">
        <Button variant="secondary" size="icon" onClick={onClose} className="pointer-events-auto bg-white/95 hover:bg-white shadow-lg">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="pointer-events-auto w-[calc(50%-8px)] max-w-md bg-white/95 backdrop-blur rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate text-sm">{circle.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {socketConnected ? (
                  <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Live Â· {live.length} online</span>
                ) : (
                  <span className="flex items-center gap-1"><WifiOff className="h-3 w-3" /> Connectingâ€¦</span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={copyCode} className="font-mono tracking-wider text-emerald-700">
              {circle.inviteCode} <Copy className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Recenter / Follow controls */}
      <div className="absolute right-3 bottom-32 z-[1000] flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="bg-white/95 hover:bg-white shadow-lg h-11 w-11"
          onClick={onToggleFollow}
          title={followMe ? 'Following you' : 'Not following'}
        >
          <Navigation className={`h-4 w-4 ${followMe ? 'text-emerald-600' : 'text-slate-400'}`} />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-white/95 hover:bg-white shadow-lg h-11 w-11"
          onClick={onRecenterClick}
          title="Fit all members"
        >
          <RefreshCw className="h-4 w-4 text-slate-700" />
        </Button>
      </div>
      {/* Refresh interval control */}
      <div className="absolute bottom-20 left-3 right-3 z-[1000] flex items-center justify-between gap-2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 font-medium">Refresh</span>
          <input
            type="number"
            min={1}
            max={999}
            value={refreshValue}
            onChange={(e) => onRefreshValueChange(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 text-sm border border-slate-300 rounded text-center"
          />
          <select
            value={refreshUnit}
            onChange={(e) => onRefreshUnitChange(e.target.value as 'seconds' | 'minutes' | 'hours')}
            className="px-2 py-1 text-sm border border-slate-300 rounded bg-white"
          >
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
          </select>
        </div>
        <span className="text-xs text-slate-500">
          every {refreshValue} {refreshUnit === 'seconds' ? (refreshValue === 1 ? 'second' : 'seconds') : refreshUnit === 'minutes' ? (refreshValue === 1 ? 'minute' : 'minutes') : (refreshValue === 1 ? 'hour' : 'hours')}
        </span>
      </div>


      {/* Coordinate bar with copy button */}
      {myPos && (
        <div className="absolute bottom-32 left-3 right-3 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span className="text-xs font-mono text-slate-700 truncate flex-1">
            {myPos.lat.toFixed(6)}, {myPos.lng.toFixed(6)}
          </span>
          <button
            type="button"
            onClick={async () => {
              const text = `${myPos.lat.toFixed(6)}, ${myPos.lng.toFixed(6)}`
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(text)
                } else {
                  const ta = document.createElement('textarea')
                  ta.value = text
                  document.body.appendChild(ta)
                  ta.select()
                  document.execCommand('copy')
                  document.body.removeChild(ta)
                }
                toast({ title: 'Coordinates copied!', description: text })
              } catch (e) {
                toast({ title: 'Copy failed', description: text, variant: 'destructive' })
              }
            }}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center gap-1 shrink-0"
            title="Copy coordinates to clipboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
      )}

      {/* Sharing toggle (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] p-3 bg-gradient-to-t from-slate-900/90 to-transparent">
        <Button
          onClick={onToggleSharing}
          className={`w-full h-12 text-base font-semibold shadow-xl ${
            isSharing
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-white text-slate-900 hover:bg-slate-100'
          }`}
        >
          {isSharing ? (
            <>
              <MapPin className="h-5 w-5 mr-2 animate-pulse" />
              Sharing your location â€” tap to stop
            </>
          ) : (
            <>
              <EyeOff className="h-5 w-5 mr-2" />
              Start sharing your location
            </>
          )}
        </Button>
        {isSharing && myLive && (
          <div className="text-center text-xs text-white/80 mt-2">
            {myLive.lat.toFixed(5)}, {myLive.lng.toFixed(5)}
            {myLive.accuracy ? ` Â· Â±${Math.round(myLive.accuracy)}m` : ''}
          </div>
        )}
      </div>

      {/* Members sheet (top-right toggle) */}
      <div className="absolute top-20 right-3 z-[1000]">
        <Button
          variant="secondary"
          size="sm"
          className="bg-white/95 hover:bg-white shadow-lg"
          onClick={() => setShowMembers(!showMembers)}
        >
          <Users className="h-4 w-4 mr-1" /> {circle.members.length}
        </Button>
      </div>
      {showMembers && (
        <div className="absolute top-32 right-3 z-[1000] w-64 max-h-[50vh] bg-white/95 backdrop-blur rounded-lg shadow-xl overflow-hidden">
          <ScrollArea className="h-full max-h-[50vh]">
            <div className="p-2">
              <div className="text-xs font-semibold text-slate-500 px-2 py-1.5 uppercase tracking-wide">
                Live now ({live.length})
              </div>
              {live.length === 0 && (
                <div className="px-2 py-3 text-xs text-slate-500 text-center">
                  {isSharing ? 'Waiting for othersâ€¦' : 'Start sharing to see live positions'}
                </div>
              )}
              {live.map((m) => (
                <button type="button" onClick={() => onMemberClick(m.userId)} key={m.userId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 text-left w-full cursor-pointer">
                  <Avatar className="h-7 w-7" style={{ backgroundColor: m.avatarColor }}>
                    <AvatarFallback style={{ backgroundColor: m.avatarColor, color: 'white' }} className="text-xs">
                      {m.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {m.displayName} {m.userId === user.id && <span className="text-emerald-600 text-xs">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{timeAgo(m.timestamp)}</div>
                  </div>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                </button>
              ))}
              <Separator className="my-2" />
              <div className="text-xs font-semibold text-slate-500 px-2 py-1.5 uppercase tracking-wide">
                Circle members ({circle.members.length})
              </div>
              {circle.members
                .filter((m) => !live.find((l) => l.userId === m.id))
                .map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded opacity-60">
                    <Avatar className="h-7 w-7" style={{ backgroundColor: m.avatarColor }}>
                      <AvatarFallback style={{ backgroundColor: m.avatarColor, color: 'white' }} className="text-xs">
                        {m.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {m.displayName} {m.id === user.id && <span className="text-emerald-600 text-xs">(you)</span>}
                      </div>
                      <div className="text-xs text-slate-500">Offline</div>
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </div>
      )}
      <Toaster />
    </div>
  )
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}