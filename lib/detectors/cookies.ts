import { CookieData, FindingInput } from '../types'

const SENSITIVE_COOKIE_NAMES = /sess|session|auth|token|jwt|login|user|account|csrf|xsrf/i

export function detectInsecureCookies(cookies: CookieData[], url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const isHttps = url.startsWith('https://')

  for (const cookie of cookies) {
    const isSensitive = SENSITIVE_COOKIE_NAMES.test(cookie.name)
    const severity = isSensitive ? 'high' : 'medium'

    if (!cookie.httpOnly) {
      findings.push({
        severity,
        category: 'insecure_cookie',
        title: `Cookie missing HttpOnly flag: ${cookie.name}`,
        description: `The cookie "${cookie.name}" is accessible from JavaScript. Sensitive cookies should have HttpOnly set.`,
        url,
        evidence: `Cookie: ${cookie.name}; HttpOnly=false`,
        confidence: isSensitive ? 'high' : 'medium',
      })
    }

    if (isHttps && !cookie.secure) {
      findings.push({
        severity,
        category: 'insecure_cookie',
        title: `Cookie missing Secure flag: ${cookie.name}`,
        description: `The cookie "${cookie.name}" can be transmitted over non-HTTPS connections.`,
        url,
        evidence: `Cookie: ${cookie.name}; Secure=false`,
        confidence: 'high',
      })
    }

    if (!cookie.sameSite) {
      findings.push({
        severity: 'low',
        category: 'insecure_cookie',
        title: `Cookie missing SameSite attribute: ${cookie.name}`,
        description: `The cookie "${cookie.name}" has no SameSite attribute, which may allow cross-site request forgery.`,
        url,
        evidence: `Cookie: ${cookie.name}; SameSite=<not set>`,
        confidence: 'medium',
      })
    } else if (cookie.sameSite === 'None' && !cookie.secure) {
      findings.push({
        severity: 'high',
        category: 'insecure_cookie',
        title: `Cookie SameSite=None without Secure: ${cookie.name}`,
        description: `SameSite=None requires Secure flag. This configuration may be rejected by browsers.`,
        url,
        evidence: `Cookie: ${cookie.name}; SameSite=None; Secure=false`,
        confidence: 'high',
      })
    }

    if (isSensitive && cookie.expires) {
      const daysUntilExpiry = (cookie.expires - Date.now() / 1000) / 86400
      if (daysUntilExpiry > 365) {
        findings.push({
          severity: 'low',
          category: 'insecure_cookie',
          title: `Long-lived sensitive cookie: ${cookie.name}`,
          description: `The cookie "${cookie.name}" expires in ${Math.round(daysUntilExpiry)} days. Consider shorter TTL for sensitive cookies.`,
          url,
          evidence: `Cookie: ${cookie.name}; Expires in ~${Math.round(daysUntilExpiry)} days`,
          confidence: 'medium',
        })
      }
    }
  }

  return findings
}
