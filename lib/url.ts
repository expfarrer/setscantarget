export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')
  return `${url.protocol}//${url.host}${pathname}${url.search}`
}

export function getOrigin(url: string): string {
  return new URL(url).origin
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.searchParams.sort()
    const pathname = u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, '')
    return `${u.protocol}//${u.host}${pathname}${u.search}`
  } catch {
    return url
  }
}

const DESTRUCTIVE_PATTERNS = [
  /logout/i, /sign.?out/i, /log.?out/i, /delete/i, /remove/i,
  /unsubscribe/i, /checkout/i, /purchase/i, /pay/i, /destroy/i,
]

export function isDestructiveLink(url: string): boolean {
  return DESTRUCTIVE_PATTERNS.some(p => p.test(url))
}

export function isSkippableScheme(url: string): boolean {
  return /^(mailto:|tel:|javascript:|blob:|data:)/i.test(url)
}
