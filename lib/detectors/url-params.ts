import { FindingInput } from '../types'
import { isLikelyPlaceholder, isHighEntropy } from './secrets'

const SENSITIVE_PARAMS = new Set([
  'token', 'access_token', 'auth', 'auth_token', 'api_key', 'apikey',
  'key', 'secret', 'password', 'passwd', 'pwd', 'session', 'sid',
  'jwt', 'code', 'refresh_token', 'client_secret', 'authorization',
  'bearer', 'credential', 'credentials', 'pass', 'private_key',
])

const TOKEN_PARAMS = new Set([
  'token', 'access_token', 'auth_token', 'jwt', 'refresh_token',
  'bearer', 'authorization', 'session', 'sid',
])

const PASSWORD_PARAMS = new Set([
  'password', 'passwd', 'pwd', 'pass', 'private_key', 'client_secret',
])

function redact(value: string): string {
  if (value.length <= 8) return '[redacted]'
  return value.substring(0, 4) + '…[redacted]'
}

export function detectSensitiveUrlParams(url: string): FindingInput[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return []
  }

  const findings: FindingInput[] = []
  const seen = new Set<string>()

  for (const [name, value] of parsed.searchParams) {
    const nameLower = name.toLowerCase()
    if (!SENSITIVE_PARAMS.has(nameLower)) continue

    // Skip very short values unless it's a password param (even short passwords matter)
    if (value.length < 6 && !PASSWORD_PARAMS.has(nameLower)) continue

    // Deduplicate by param name + URL path (same endpoint, same param)
    const dedupeKey = `${parsed.origin}${parsed.pathname}:${nameLower}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const placeholder = isLikelyPlaceholder(value)
    const highEnt = isHighEntropy(value)

    let severity: 'high' | 'medium' | 'low'
    let confidence: string

    if (placeholder) {
      severity = 'low'
      confidence = 'low'
    } else if (highEnt || value.length > 20) {
      severity = 'high'
      confidence = 'high'
    } else {
      severity = 'medium'
      confidence = 'medium'
    }

    let title: string
    let description: string

    if (TOKEN_PARAMS.has(nameLower)) {
      title = 'Sensitive token-like value in URL parameter'
      description = `The URL contains a "${name}" parameter that may carry an auth token or session credential. URL parameters appear in browser history, server access logs, and Referer headers, making them a poor location for sensitive values.`
    } else if (PASSWORD_PARAMS.has(nameLower)) {
      title = 'Password-like value in URL parameter'
      description = `The URL contains a "${name}" parameter that may carry a password or credential. Credentials in URLs are logged and cached in plaintext across multiple systems.`
    } else {
      title = 'API key-like parameter in URL'
      description = `The URL contains a "${name}" parameter that may carry a sensitive key or secret. URL parameters are not confidential and can leak through browser history, proxies, and analytics pipelines.`
    }

    const evidence = `param "${name}" = ${redact(value)}\nfull path: ${parsed.origin}${parsed.pathname}`

    findings.push({
      severity,
      category: 'sensitive_url_parameter',
      title,
      description,
      url,
      evidence,
      confidence,
    })
  }

  return findings
}
