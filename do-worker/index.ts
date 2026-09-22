// Durable Object Worker for CircleSync  hibernation-safe version

export class CircleLocationDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const username = url.searchParams.get("username");
    const displayName = url.searchParams.get("displayName");
    const avatarColor = url.searchParams.get("avatarColor");

    if (!userId || !username) {
      return new Response("Missing user info", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);

    const userInfo = {
      userId,
      username,
      displayName: displayName || username,
      avatarColor: avatarColor || "#10b981",
    };

    // Attach user info directly to the WebSocket (survives hibernation)
    server.serializeAttachment({ userInfo, lastLocation: null });

    // Collect currently online members from all active WebSockets
    const onlineMembers = [];
    for (const ws of this.state.getWebSockets()) {
      if (ws === server) continue;
      const att = ws.deserializeAttachment();
      if (att && att.lastLocation) {
        onlineMembers.push({
          userId: att.userInfo.userId,
          username: att.userInfo.username,
          displayName: att.userInfo.displayName,
          avatarColor: att.userInfo.avatarColor,
          ...att.lastLocation,
        });
      }
    }

    server.send(JSON.stringify({
      type: "circle-state",
      members: onlineMembers,
    }));

    // Notify all other sockets that this user is online
    this.broadcast({
      type: "member-online",
      user: userInfo,
    }, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const att = ws.deserializeAttachment();
      if (!att) return;
      const { userInfo } = att;

      if (data.type === "location-update") {
        const newLocation = {
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy || null,
          heading: data.heading || null,
          speed: data.speed || null,
          timestamp: Date.now(),
          sharing: true,
        };

        // Persist to the WebSocket attachment
        ws.serializeAttachment({ userInfo, lastLocation: newLocation });

        // Broadcast to all other connected WebSockets
        this.broadcast({
          type: "location-update",
          userId: userInfo.userId,
          username: userInfo.username,
          displayName: userInfo.displayName,
          avatarColor: userInfo.avatarColor,
          ...newLocation,
        }, ws);
      } else if (data.type === "stop-sharing") {
        ws.serializeAttachment({ userInfo, lastLocation: null });
        this.broadcast({
          type: "member-left",
          userId: userInfo.userId,
        }, ws);
      } else if (data.type === "ping") {
        // Optional: reply to keepalive
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      }
    } catch (e) {
      console.error("Message error:", e);
    }
  }

  async webSocketClose(ws) {
    try {
      const att = ws.deserializeAttachment();
      if (att) {
        this.broadcast({
          type: "member-left",
          userId: att.userInfo.userId,
        }, ws);
      }
    } catch (e) {
      console.error("Close error:", e);
    }
  }

  async webSocketError(ws) {
    try {
      const att = ws.deserializeAttachment();
      if (att) {
        this.broadcast({
          type: "member-left",
          userId: att.userInfo.userId,
        }, ws);
      }
    } catch (e) {
      console.error("Error event:", e);
    }
  }

  broadcast(message, excludeSocket) {
    const msg = JSON.stringify(message);
    const sockets = this.state.getWebSockets();
    let sent = 0;
    for (const socket of sockets) {
      if (socket === excludeSocket) continue;
      try {
        socket.send(msg);
        sent++;
      } catch (e) {
        console.error("Broadcast error:", e);
      }
    }
    console.log(`broadcast ${message.type} to ${sent}/${sockets.length - 1} others`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (url.pathname !== "/ws" && !url.pathname.startsWith("/ws/")) {
      return new Response("CircleSync DO Worker. Use /ws?circle=<id>", {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const circleId = url.searchParams.get("circle");
    if (!circleId) {
      return new Response("Missing circle parameter", {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const id = env.CIRCLE_LOCATIONS.idFromName(circleId);
    const stub = env.CIRCLE_LOCATIONS.get(id);
    return stub.fetch(request);
  },
};