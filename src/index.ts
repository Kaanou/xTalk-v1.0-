export interface Env {
  ROOMS: DurableObjectNamespace
}

const html = `<!doctype html><html><body><h1>xTalk backend ready</h1></body></html>`

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    if (url.pathname === '/api/rooms') return Response.json({ ok: true })
    return new Response('Not found', { status: 404 })
  }
}

export class RoomDO {
  state: DurableObjectState
  sessions = new Set<WebSocket>()
  roomCode = ''
  createdAt = Date.now()

  constructor(state: DurableObjectState) { this.state = state }

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      server.accept()
      this.sessions.add(server)
      server.send(JSON.stringify({ type: 'hello', room: this.roomCode }))
      server.addEventListener('message', (evt) => this.onMessage(server, String(evt.data)))
      server.addEventListener('close', () => this.sessions.delete(server))
      return new Response(null, { status: 101, webSocket: client })
    }
    if (url.pathname === '/join') {
      this.roomCode = url.searchParams.get('code') || this.roomCode
      return Response.json({ ok: true, code: this.roomCode })
    }
    if (url.pathname === '/state') {
      return Response.json({ code: this.roomCode, clients: this.sessions.size, createdAt: this.createdAt })
    }
    return new Response('Not found', { status: 404 })
  }

  onMessage(ws: WebSocket, raw: string) {
    let data: any
    try { data = JSON.parse(raw) } catch { return }
    if (data.type === 'message') {
      const payload = JSON.stringify({ type: 'message', text: String(data.text || ''), nick: String(data.nick || 'ghost'), ts: Date.now() })
      for (const session of this.sessions) session.send(payload)
    }
    if (data.type === 'join') {
      if (data.code) this.roomCode = String(data.code).toUpperCase()
      ws.send(JSON.stringify({ type: 'joined', code: this.roomCode }))
    }
  }
}
