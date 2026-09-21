// Durable Object: CircleLocationDO
// One instance per circle. Handles WebSocket connections and real-time location broadcasts.
// Replaces the Socket.io location-service from the original app.

export class CircleLocationDO {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Map() // websocket -> { userInfo, lastLocation }
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const username = url.searchParams.get('username')
    const displayName = url.searchParams.get('displayName')
    const avatarColor = url.searchParams.get('avatarColor')

    if (!userId || !username) {
      return new Response('Missing user info', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Use hibernation API for better resource management
    this.state.acceptWebSocket(server)

    const userInfo = {
      userId,
      username,
      displayName: displayName || username,
      avatarColor: avatarColor || '#10b981',
    }

    this.sessions.set(server, { userInfo, lastLocation: null })

    // Send current circle state to the new client
    const onlineMembers = []
    for (const [, session] of this.sessions) {
      if (session.lastLocation && session.userInfo.userId !== userId) {
        onlineMembers.push({
          userId: session.userInfo.userId,
          username: session.userInfo.username,
          displayName: session.userInfo.displayName,
          avatarColor: session.userInfo.avatarColor,
          ...session.lastLocation,
        })
      }
    }
    server.send(JSON.stringify({
      type: 'circle-state',
      members: onlineMembers,
    }))

    // Notify others
    this.broadcast({
      type: 'member-online',
      user: userInfo,
    }, server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  // Hibernation API: handle messages
  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message)
      const session = this.sessions.get(ws)
      if (!session) return

      if (data.type === 'location-update') {
        session.lastLocation = {
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy || null,
          heading: data.heading || null,
          speed: data.speed || null,
          timestamp: Date.now(),
          sharing: true,
        }
        this.broadcast({
          type: 'location-update',
          userId: session.userInfo.userId,
          username: session.userInfo.username,
          displayName: session.userInfo.displayName,
          avatarColor: session.userInfo.avatarColor,
          ...session.lastLocation,
        }, ws)
      } else if (data.type === 'stop-sharing') {
        session.lastLocation = null
        this.broadcast({
          type: 'member-left',
          userId: session.userInfo.userId,
        }, ws)
      }
    } catch (e) {
      console.error('Message error:', e)
    }
  }

  async webSocketClose(ws) {
    const session = this.sessions.get(ws)
    if (session) {
      this.broadcast({
        type: 'member-left',
        userId: session.userInfo.userId,
      }, ws)
      this.sessions.delete(ws)
    }
  }

  async webSocketError(ws) {
    const session = this.sessions.get(ws)
    if (session) {
      this.sessions.delete(ws)
    }
  }

  broadcast(message, excludeSocket) {
    const msg = JSON.stringify(message)
    for (const [socket] of this.sessions) {
      if (socket !== excludeSocket && socket.readyState === 1) { // OPEN
        try {
          socket.send(msg)
        } catch (e) {
          console.error('Broadcast error:', e)
        }
      }
    }
  }
}
