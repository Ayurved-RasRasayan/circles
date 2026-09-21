// Pages Function: /ws
// Routes WebSocket upgrade requests to the CircleLocationDO Durable Object
// The circle ID is passed as a query parameter: /ws?circle=<circleId>&userId=...&username=...

export const onRequestGet = async (context) => {
  const { request, env } = context

  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }

  const url = new URL(request.url)
  const circleId = url.searchParams.get('circle')

  if (!circleId) {
    return new Response('Missing circle ID', { status: 400 })
  }

  // Get the Durable Object for this circle
  const id = env.CIRCLE_LOCATIONS.idFromName(circleId)
  const stub = env.CIRCLE_LOCATIONS.get(id)

  // Forward the request to the Durable Object
  return stub.fetch(request)
}
