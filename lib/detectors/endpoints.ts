import { FindingInput } from '../types'

const SUSPICIOUS_PATTERNS = [
  { regex: /["'`](\/admin(?:\/[^\s"'`]*)?)["'`]/gi, name: 'admin endpoint', severity: 'medium' as const },
  { regex: /["'`](\/internal(?:\/[^\s"'`]*)?)["'`]/gi, name: 'internal endpoint', severity: 'medium' as const },
  { regex: /["'`](\/debug(?:\/[^\s"'`]*)?)["'`]/gi, name: 'debug endpoint', severity: 'medium' as const },
  { regex: /["'`](\/staging(?:\/[^\s"'`]*)?)["'`]/gi, name: 'staging endpoint', severity: 'low' as const },
  { regex: /["'`](\/test(?:\/[^\s"'`]*)?)["'`]/gi, name: 'test endpoint', severity: 'low' as const },
  { regex: /["'`](\/api\/private(?:\/[^\s"'`]*)?)["'`]/gi, name: 'private API endpoint', severity: 'medium' as const },
  { regex: /["'`](\/api\/admin(?:\/[^\s"'`]*)?)["'`]/gi, name: 'admin API endpoint', severity: 'medium' as const },
]

export function detectSuspiciousEndpoints(content: string, url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const seen = new Set<string>()

  for (const pattern of SUSPICIOUS_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const endpoint = match[1]
      if (seen.has(endpoint)) continue
      seen.add(endpoint)

      const start = Math.max(0, match.index - 40)
      const end = Math.min(content.length, match.index + match[0].length + 40)
      const snippet = content.slice(start, end).replace(/\n/g, ' ').trim()

      findings.push({
        severity: pattern.severity,
        category: 'suspicious_endpoint_reference',
        title: `Reference to ${pattern.name}: ${endpoint}`,
        description: `A reference to "${endpoint}" was found in client-side code. Verify this endpoint is not unintentionally exposed.`,
        url,
        evidence: snippet.substring(0, 300),
        confidence: 'medium',
      })
    }
  }

  return findings
}

export function detectRobotsIssues(content: string, url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const disallowedPaths: string[] = []

  for (const line of content.split('\n')) {
    const match = line.match(/^Disallow:\s*(.+)$/i)
    if (match) {
      const p = match[1].trim()
      if (/admin|internal|debug|private|staging|test|backup|config/i.test(p)) {
        disallowedPaths.push(p)
      }
    }
  }

  if (disallowedPaths.length > 0) {
    findings.push({
      severity: 'info',
      category: 'suspicious_endpoint_reference',
      title: 'Sensitive paths revealed in robots.txt',
      description: 'The robots.txt file disallows access to paths that suggest admin or internal functionality.',
      url,
      evidence: disallowedPaths.map(p => `Disallow: ${p}`).join('\n'),
      confidence: 'medium',
    })
  }

  return findings
}
