/**
 * Passive Common Endpoint Checker
 *
 * Performs safe, GET-only requests against a small fixed allowlist of
 * common API/admin/debug paths on the same origin.
 *
 * Rules:
 * - Same origin only
 * - GET requests only
 * - Fixed, non-generated path list
 * - No authentication bypass, fuzzing, or mutation
 * - 401/403/404 responses are not flagged
 * - Only 200 responses with meaningful content are surfaced
 */

import { FindingInput } from '../types'

// ---------------------------------------------------------------------------
// Fixed allowlist — intentionally small and transparent
// ---------------------------------------------------------------------------

export const PASSIVE_CHECK_PATHS = [
  '/api/users',
  '/api/user',
  '/api/admin',
  '/api/auth/me',
  '/api/me',
  '/api/profile',
  '/api/debug',
  '/api/internal',
  '/api/config',
  '/api/settings',
  '/admin',
  '/debug',
  '/internal',
  '/dashboard',
  '/health',
  '/status',
  '/.env',
  '/config.json',
  '/api.json',
] as const

// Fields in a JSON response body that suggest sensitive data exposure
const SENSITIVE_JSON_FIELDS = new Set([
  'email', 'emails',
  'role', 'roles',
  'permission', 'permissions', 'scopes',
  'userId', 'user_id', 'uid',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'apiKey', 'api_key', 'apikey',
  'secret', 'clientSecret', 'client_secret',
  'password', 'passwd', 'hash',
  'config', 'configuration',
  'admin', 'isAdmin', 'is_admin', 'superuser',
  'ssn', 'dob', 'dateOfBirth',
  'creditCard', 'credit_card', 'cardNumber', 'card_number',
])

const PREVIEW_MAX = 400

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PassiveEndpointResult {
  path: string
  url: string
  statusCode: number
  contentType: string | null
  responseHeaders: Record<string, string>
  preview: string | null
  findings: FindingInput[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractContentType(headers: Record<string, string>): string | null {
  return headers['content-type'] ?? headers['Content-Type'] ?? null
}

function isSensitiveJsonField(key: string): boolean {
  return SENSITIVE_JSON_FIELDS.has(key) || SENSITIVE_JSON_FIELDS.has(key.toLowerCase())
}

function summariseJson(obj: unknown, depth = 0): { sensitiveKeys: string[]; preview: string } {
  const sensitiveKeys: string[] = []

  function walk(node: unknown, d: number) {
    if (d > 4 || node === null || typeof node !== 'object') return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (isSensitiveJsonField(k)) sensitiveKeys.push(k)
      if (typeof v === 'object') walk(v, d + 1)
    }
  }
  walk(obj, depth)

  const preview = JSON.stringify(obj, null, 2)
  return {
    sensitiveKeys: [...new Set(sensitiveKeys)],
    preview: preview.length > PREVIEW_MAX ? preview.substring(0, PREVIEW_MAX) + '\n…' : preview,
  }
}

function isAdminOrDebugPath(path: string): boolean {
  return /\/(admin|debug|internal|config|\.env)/i.test(path)
}

function buildFindings(
  path: string,
  fullUrl: string,
  statusCode: number,
  contentType: string | null,
  preview: string | null,
  sensitiveKeys: string[],
): FindingInput[] {
  const findings: FindingInput[] = []

  if (statusCode !== 200) return findings

  const isHighRiskPath = isAdminOrDebugPath(path)
  const hasSensitiveData = sensitiveKeys.length > 0
  const isJson = contentType?.includes('json') || contentType?.includes('javascript')
  const isText = contentType?.includes('text') || contentType?.includes('html')

  // Case 1: JSON with sensitive fields
  if (isJson && hasSensitiveData) {
    findings.push({
      severity: isHighRiskPath ? 'high' : 'medium',
      category: 'possible_public_data_exposure',
      title: `Passive check: ${path} returned sensitive JSON data`,
      description: `The path "${path}" returned HTTP 200 with JSON that contains sensitive-looking fields: ${sensitiveKeys.join(', ')}. This endpoint may be publicly accessible without authentication.`,
      url: fullUrl,
      evidence: `[Passive endpoint check] GET ${path} → 200 ${contentType}\nSensitive fields: ${sensitiveKeys.join(', ')}\n\nPreview:\n${preview ?? '(empty)'}`,
      confidence: 'high',
    })
  }

  // Case 2: Admin/debug/internal path accessible
  if (isHighRiskPath && !hasSensitiveData && (isJson || isText)) {
    findings.push({
      severity: 'medium',
      category: 'suspicious_endpoint_reference',
      title: `Passive check: admin/debug path publicly accessible: ${path}`,
      description: `The path "${path}" returned HTTP 200. Admin, debug, and internal paths should not be publicly reachable without authentication.`,
      url: fullUrl,
      evidence: `[Passive endpoint check] GET ${path} → 200 ${contentType}\n\nPreview:\n${preview ?? '(no text preview)'}`,
      confidence: 'medium',
    })
  }

  // Case 3: .env or config file exposed
  if (path === '/.env' || path === '/config.json' || path === '/api.json') {
    findings.push({
      severity: 'high',
      category: 'secret_exposure',
      title: `Passive check: configuration file publicly accessible: ${path}`,
      description: `The file "${path}" returned HTTP 200 and is publicly accessible. Configuration files often contain secrets, credentials, and environment variables.`,
      url: fullUrl,
      evidence: `[Passive endpoint check] GET ${path} → 200 ${contentType}\n\nPreview:\n${preview ?? '(no preview)'}`,
      confidence: 'high',
    })
  }

  return findings
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runPassiveEndpointChecks(
  targetUrl: string,
  timeoutMs: number,
): Promise<PassiveEndpointResult[]> {
  const origin = new URL(targetUrl).origin
  const results: PassiveEndpointResult[] = []

  for (const path of PASSIVE_CHECK_PATHS) {
    const fullUrl = `${origin}${path}`

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10000))

      const res = await fetch(fullUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'Accept': 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; SiteSecurityReviewScanner/1.0)',
        },
      })
      clearTimeout(timer)

      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => { responseHeaders[k] = v })

      const contentType = extractContentType(responseHeaders)
      const statusCode = res.status

      // 401/403/404 — expected, skip quietly
      if ([401, 403, 404, 405, 410].includes(statusCode)) {
        results.push({ path, url: fullUrl, statusCode, contentType, responseHeaders, preview: null, findings: [] })
        continue
      }

      let preview: string | null = null
      let sensitiveKeys: string[] = []

      const isJsonResponse = contentType?.includes('json')
      const isTextResponse = contentType?.includes('text') || contentType?.includes('html')
      const isBinary = !isJsonResponse && !isTextResponse

      if (!isBinary) {
        const raw = await res.text()

        if (isJsonResponse) {
          try {
            const parsed = JSON.parse(raw)
            const summary = summariseJson(parsed)
            preview = summary.preview
            sensitiveKeys = summary.sensitiveKeys
          } catch {
            preview = raw.substring(0, PREVIEW_MAX)
          }
        } else if (isTextResponse) {
          preview = raw.substring(0, PREVIEW_MAX)
        }
      }

      const findings = buildFindings(path, fullUrl, statusCode, contentType, preview, sensitiveKeys)

      results.push({ path, url: fullUrl, statusCode, contentType, responseHeaders, preview, findings })
    } catch {
      // Network error or timeout — skip silently
      results.push({
        path,
        url: fullUrl,
        statusCode: 0,
        contentType: null,
        responseHeaders: {},
        preview: null,
        findings: [],
      })
    }
  }

  return results
}
