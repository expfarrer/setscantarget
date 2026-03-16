import { FindingInput } from '../types'

const REQUIRED_HEADERS = [
  { name: 'content-security-policy', severity: 'high' as const, description: 'Content-Security-Policy header is missing. This increases risk of XSS attacks.' },
  { name: 'strict-transport-security', severity: 'medium' as const, description: 'Strict-Transport-Security (HSTS) header is missing. This may allow downgrade attacks.' },
  { name: 'x-content-type-options', severity: 'medium' as const, description: 'X-Content-Type-Options header is missing. Browsers may perform MIME type sniffing.' },
  { name: 'referrer-policy', severity: 'low' as const, description: 'Referrer-Policy header is missing. Referrer information may leak to third parties.' },
  { name: 'permissions-policy', severity: 'low' as const, description: 'Permissions-Policy header is missing. Browser features are not explicitly restricted.' },
  { name: 'cross-origin-opener-policy', severity: 'low' as const, description: 'Cross-Origin-Opener-Policy header is missing.' },
  { name: 'cross-origin-resource-policy', severity: 'info' as const, description: 'Cross-Origin-Resource-Policy header is missing.' },
]

export function detectMissingHeaders(headers: Record<string, string>, url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const lowerHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v

  for (const check of REQUIRED_HEADERS) {
    if (!lowerHeaders[check.name]) {
      findings.push({
        severity: check.severity,
        category: 'missing_security_header',
        title: `Missing header: ${check.name}`,
        description: check.description,
        url,
        evidence: `Header "${check.name}" was not present in the HTTP response.`,
        confidence: 'high',
      })
    }
  }

  if (lowerHeaders['x-powered-by']) {
    findings.push({
      severity: 'low',
      category: 'framework_leakage',
      title: 'X-Powered-By header reveals server technology',
      description: 'The X-Powered-By header discloses server-side technology information.',
      url,
      evidence: `X-Powered-By: ${lowerHeaders['x-powered-by']}`,
      confidence: 'high',
    })
  }

  const acao = lowerHeaders['access-control-allow-origin']
  if (acao === '*') {
    const allowCredentials = lowerHeaders['access-control-allow-credentials']
    findings.push({
      severity: allowCredentials === 'true' ? 'high' : 'medium',
      category: 'cors_risk',
      title: 'Wildcard CORS policy detected',
      description: allowCredentials === 'true'
        ? 'Access-Control-Allow-Origin: * combined with credentials is a serious misconfiguration.'
        : 'Access-Control-Allow-Origin: * allows any origin to read responses.',
      url,
      evidence: `Access-Control-Allow-Origin: ${acao}${allowCredentials ? `\nAccess-Control-Allow-Credentials: ${allowCredentials}` : ''}`,
      confidence: 'high',
    })
  }

  return findings
}
