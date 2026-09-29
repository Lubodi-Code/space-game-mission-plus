const stunServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

type IceServer = { urls: string | string[]; username?: string; credential?: string }
let cached: IceServer[] | null = null
let cachedUntil = 0

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()
  const turnKeyId = config.turnKeyId || process.env.TURN_KEY_ID
  const turnKeyToken = config.turnKeyToken || process.env.TURN_KEY_TOKEN
  if (!turnKeyId || !turnKeyToken) return { iceServers: stunServers }
  if (cached && Date.now() < cachedUntil) return { iceServers: cached }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(String(turnKeyId))}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${turnKeyToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout(2500),
      },
    )
    if (!response.ok) throw new Error('TURN unavailable')
    const data = await response.json() as { iceServers?: IceServer[] }
    if (!Array.isArray(data.iceServers)) throw new Error('Invalid TURN response')
    cached = [...stunServers, ...data.iceServers]
    cachedUntil = Date.now() + 3600000
    return { iceServers: cached }
  } catch {
    return { iceServers: stunServers }
  }
})
