import { CookieData, FindingInput } from '../types'

// Cookies matching these patterns are treated as auth/session-sensitive.
// Findings for these cookies carry higher severity.
const AUTH_SESSION_PATTERN = /\b(?:sess(?:ion)?|sid|auth|token|jwt|access|refresh|connect\.sid|next[-_]?auth|supabase|clerk|firebase|amp[-_]?token|remember|logged[-_]?in|user[-_]?id|account|csrf|xsrf|login)\b/i

function isAuthCookie(name: string): boolean {
  return AUTH_SESSION_PATTERN.test(name)
}

function formatFlags(cookie: CookieData): string {
  const flags: string[] = []
  flags.push(`HttpOnly=${cookie.httpOnly ? 'true' : 'false'}`)
  flags.push(`Secure=${cookie.secure ? 'true' : 'false'}`)
  flags.push(`SameSite=${cookie.sameSite ?? 'not set'}`)
  if (cookie.expires) {
    const days = Math.round((cookie.expires - Date.now() / 1000) / 86400)
    flags.push(`Expires=~${days}d`)
  } else {
    flags.push('Expires=session')
  }
  return flags.join('; ')
}

export function detectInsecureCookies(cookies: CookieData[], url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const isHttps = url.startsWith('https://')

  for (const cookie of cookies) {
    const isAuth = isAuthCookie(cookie.name)
    const baseEvidence = `${cookie.name} [${formatFlags(cookie)}]`

    // --- HttpOnly ---
    if (!cookie.httpOnly) {
      findings.push({
        severity: isAuth ? 'high' : 'medium',
        category: 'insecure_cookie',
        title: isAuth
          ? `Auth/session cookie missing HttpOnly: ${cookie.name}`
          : `Cookie missing HttpOnly flag: ${cookie.name}`,
        description: isAuth
          ? `The auth/session cookie "${cookie.name}" is readable from JavaScript. If XSS occurs, this cookie can be stolen directly. Set HttpOnly to prevent JS access.`
          : `The cookie "${cookie.name}" has no HttpOnly flag and is accessible via JavaScript.`,
        url,
        evidence: baseEvidence,
        confidence: isAuth ? 'high' : 'medium',
      })
    }

    // --- Secure ---
    if (isHttps && !cookie.secure) {
      findings.push({
        severity: isAuth ? 'high' : 'medium',
        category: 'insecure_cookie',
        title: isAuth
          ? `Auth/session cookie missing Secure flag: ${cookie.name}`
          : `Cookie missing Secure flag: ${cookie.name}`,
        description: isAuth
          ? `The auth/session cookie "${cookie.name}" lacks the Secure flag and may be sent over unencrypted HTTP connections, exposing session credentials.`
          : `The cookie "${cookie.name}" can be transmitted over non-HTTPS connections.`,
        url,
        evidence: baseEvidence,
        confidence: 'high',
      })
    }

    // --- SameSite ---
    if (!cookie.sameSite) {
      findings.push({
        severity: isAuth ? 'medium' : 'low',
        category: 'insecure_cookie',
        title: isAuth
          ? `Auth/session cookie missing SameSite attribute: ${cookie.name}`
          : `Cookie missing SameSite attribute: ${cookie.name}`,
        description: isAuth
          ? `The auth/session cookie "${cookie.name}" has no SameSite attribute. Without SameSite, browsers may send this cookie with cross-origin requests, enabling CSRF attacks.`
          : `The cookie "${cookie.name}" has no SameSite attribute, which may allow cross-site request forgery.`,
        url,
        evidence: baseEvidence,
        confidence: isAuth ? 'high' : 'medium',
      })
    } else if (cookie.sameSite === 'None' && !cookie.secure) {
      findings.push({
        severity: 'high',
        category: 'insecure_cookie',
        title: `Cookie uses SameSite=None without Secure: ${cookie.name}`,
        description: `SameSite=None requires the Secure flag. Without it, browsers will reject or ignore this cookie. This combination is both insecure and likely broken.`,
        url,
        evidence: baseEvidence,
        confidence: 'high',
      })
    }

    // --- Long-lived auth/session cookie ---
    if (isAuth && cookie.expires) {
      const daysUntilExpiry = (cookie.expires - Date.now() / 1000) / 86400
      if (daysUntilExpiry > 90) {
        findings.push({
          severity: daysUntilExpiry > 365 ? 'medium' : 'low',
          category: 'insecure_cookie',
          title: `Long-lived auth/session cookie: ${cookie.name}`,
          description: `The auth/session cookie "${cookie.name}" expires in ~${Math.round(daysUntilExpiry)} days. Long-lived session tokens increase the window of opportunity if they are stolen or not revoked.`,
          url,
          evidence: baseEvidence,
          confidence: 'medium',
        })
      }
    }
  }

  return findings
}

// Summarise cookies seen on a page for use in reports/exports (no findings generated).
export interface CookieSummaryEntry {
  name: string
  isAuth: boolean
  httpOnly: boolean
  secure: boolean
  sameSite: string
  sessionOnly: boolean
}

export function summariseCookies(cookies: CookieData[]): CookieSummaryEntry[] {
  return cookies.map(c => ({
    name: c.name,
    isAuth: isAuthCookie(c.name),
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: c.sameSite ?? 'not set',
    sessionOnly: !c.expires || c.expires <= 0,
  }))
}
