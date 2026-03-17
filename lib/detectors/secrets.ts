import { FindingInput } from '../types'

interface SecretPattern {
  name: string
  regex: RegExp
  severity: 'high' | 'medium' | 'low'
  category: 'secret_exposure' | 'token_exposure'
}

const PATTERNS: SecretPattern[] = [
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/g, severity: 'high', category: 'secret_exposure' },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g, severity: 'high', category: 'secret_exposure' },
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, severity: 'medium', category: 'token_exposure' },
  { name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*/g, severity: 'medium', category: 'token_exposure' },
  { name: 'Generic API Key Assignment', regex: /(?:api[_-]?key|apikey)\s*[=:]\s*["']([A-Za-z0-9\-_.]{16,})["']/gi, severity: 'medium', category: 'secret_exposure' },
  { name: 'Secret Assignment', regex: /(?:secret|client[_-]?secret)\s*[=:]\s*["']([A-Za-z0-9\-_.]{16,})["']/gi, severity: 'high', category: 'secret_exposure' },
  { name: 'Access Token Assignment', regex: /(?:access[_-]?token|auth[_-]?token)\s*[=:]\s*["']([A-Za-z0-9\-_.]{20,})["']/gi, severity: 'medium', category: 'token_exposure' },
  { name: 'Private Key Header', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, severity: 'high', category: 'secret_exposure' },
]

const PLACEHOLDER_PATTERNS = [
  /your[_-]?api[_-]?key/i, /your[_-]?token/i, /your[_-]?secret/i,
  /example/i, /placeholder/i, /xxxx/i, /1234/, /test[_-]?key/i,
  /demo/i, /changeme/i, /\*{4,}/,
]

export function isLikelyPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some(p => p.test(value))
}

export function isHighEntropy(str: string): boolean {
  if (str.length < 16) return false
  return new Set(str).size > 10
}

export function detectSecrets(content: string, url: string, context: string): FindingInput[] {
  const findings: FindingInput[] = []
  const seen = new Set<string>()

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0]
      const capturedValue = match[1] || fullMatch

      if (isLikelyPlaceholder(capturedValue)) continue

      const dedupeKey = `${pattern.name}:${capturedValue.substring(0, 20)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      let severity = pattern.severity
      let confidence = 'medium'

      if (isHighEntropy(capturedValue)) {
        confidence = 'high'
      } else {
        severity = severity === 'high' ? 'medium' : 'low'
        confidence = 'low'
      }

      const start = Math.max(0, match.index - 60)
      const end = Math.min(content.length, match.index + fullMatch.length + 60)
      const snippet = content.slice(start, end).replace(/\n/g, ' ').trim()

      findings.push({
        severity,
        category: pattern.category,
        title: `${pattern.name} detected in ${context}`,
        description: `A potential ${pattern.name} was found exposed in ${context}. Verify this is not a real credential.`,
        url,
        evidence: snippet.length > 300 ? snippet.substring(0, 300) + '…' : snippet,
        confidence,
      })
    }
  }

  return findings
}

export function detectNextPublicEnv(content: string, url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const regex = /NEXT_PUBLIC_[A-Z0-9_]+\s*[=:]\s*["']?([^"'\s,;]{4,})["']?/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const varName = match[0].split(/[=:]/)[0].trim()
    const value = match[1] || ''
    const looksLikeSecret = /key|secret|token|password|credential/i.test(varName) && new Set(value).size > 10

    findings.push({
      severity: looksLikeSecret ? 'medium' : 'info',
      category: looksLikeSecret ? 'secret_exposure' : 'info',
      title: `NEXT_PUBLIC_ variable exposed: ${varName}`,
      description: `The environment variable ${varName} is exposed client-side. Ensure it does not contain sensitive values.`,
      url,
      evidence: match[0].substring(0, 200),
      confidence: looksLikeSecret ? 'medium' : 'low',
    })
  }

  return findings
}
