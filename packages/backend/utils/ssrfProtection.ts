import dns from 'dns'
import net from 'net'
import http from 'http'
import https from 'https'

// Ranges that must never be reachable from this server's outbound requests.
const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4] // multicast + reserved (>= 224.0.0.0)
]

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + (parseInt(octet, 10) & 255), 0) >>> 0
}

function isBlockedV4(ip: string): boolean {
  const ipLong = ipToLong(ip)
  return BLOCKED_V4_RANGES.some(([base, prefix]) => {
    const baseLong = ipToLong(base)
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return (ipLong & mask) === (baseLong & mask)
  })
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true
  // fe80::/10 covers fe80-febf
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true // fc00::/7 (unique local)
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) - unwrap and check as v4
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedV4(mapped[1])
  return false
}

function isBlockedIp(ip: string, family: number): boolean {
  if (family === 4) return isBlockedV4(ip)
  if (family === 6) return isBlockedV6(ip)
  return true
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

export function assertPublicHttpUrl(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`Blocked non-http(s) scheme: ${parsed.protocol}`)
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname) === 6 ? 6 : 4
    if (isBlockedIp(hostname, family)) {
      throw new SsrfBlockedError(`Blocked literal IP address: ${hostname}`)
    }
  }
}

function safeLookup(
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
  dns.lookup(hostname, { ...options, all: false }, (err, address, family) => {
    if (err) return callback(err, address as any, family as any)
    if (isBlockedIp(address, family)) {
      return callback(
        new SsrfBlockedError(`Blocked resolved address for ${hostname}: ${address}`) as any,
        address,
        family
      )
    }
    callback(null, address, family)
  })
}

export const ssrfSafeHttpAgent = new http.Agent({
  lookup: safeLookup as any,
  keepAlive: false
})

export const ssrfSafeHttpsAgent = new https.Agent({
  lookup: safeLookup as any,
  keepAlive: false
})

export async function assertUrlResolvesPublic(rawUrl: string): Promise<void> {
  assertPublicHttpUrl(rawUrl)
  const parsed = new URL(rawUrl)
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname)) {
    // already checked as a literal IP in assertPublicHttpUrl
    return
  }
  await new Promise<void>((resolve, reject) => {
    dns.lookup(hostname, { all: false }, (err, address, family) => {
      if (err) return reject(err)
      if (isBlockedIp(address, family)) {
        return reject(new SsrfBlockedError(`Blocked resolved address for ${hostname}: ${address}`))
      }
      resolve()
    })
  })
}
