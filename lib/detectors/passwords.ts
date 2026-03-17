import { FindingInput } from '../types'
import { isLikelyPlaceholder, isHighEntropy } from './secrets'

// ---------------------------------------------------------------------------
// Additional placeholder / skip heuristics specific to passwords
// ---------------------------------------------------------------------------

const PASSWORD_PLACEHOLDER_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /^pass$/i,
  /^pwd$/i,
  /^secret$/i,
  /^<[^>]+>$/,           // <password>, <secret>
  /^\{[^}]+\}$/,         // {password}, {pass}
  /^\$\{[^}]+\}$/,       // ${PASSWORD} — template variable, not a literal
  /^%[a-z(]/i,           // %s, %(name)s — format strings
  /^\*+$/,               // ****
  /^\.+$/,               // ....
  /^x+$/i,               // xxxx
  /^n\/?a$/i,            // n/a
  /^null$/i,
  /^undefined$/i,
  /^none$/i,
  /^empty$/i,
  /^required$/i,
  /^todo$/i,
  /^fixme$/i,
  /^changeme$/i,
  /^changeit$/i,
  /^replace.?me$/i,
  /^your.?password$/i,
  /^your.?pass$/i,
  /^enter.?password$/i,
  /^my.?password$/i,
  /^test/i,
  /^demo/i,
  /^example/i,
  /^sample/i,
  /^fake/i,
  /^dummy/i,
  /^placeholder/i,
  /^root$/i,              // Very common default but also very common real value; flag only as low
]

// Values that are clearly trivial defaults — still flag but downgrade to low/info
const TRIVIAL_DEFAULTS = new Set([
  'root', 'admin', 'toor', 'pass', '1234', '12345', '123456',
  'password1', 'qwerty', 'letmein', 'welcome', 'monkey', 'dragon',
])

function isPasswordPlaceholder(value: string): boolean {
  if (isLikelyPlaceholder(value)) return true
  return PASSWORD_PLACEHOLDER_PATTERNS.some(p => p.test(value))
}

function isTrivialDefault(value: string): boolean {
  return TRIVIAL_DEFAULTS.has(value.toLowerCase())
}

function buildSnippet(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 60)
  const end = Math.min(content.length, index + length + 60)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Pattern set
// ---------------------------------------------------------------------------

interface PasswordPattern {
  name: string
  // Full regex — capture group 1 should be the credential value
  regex: RegExp
  context: string
  baseSeverity: 'high' | 'medium' | 'low'
}

const ASSIGNMENT_PATTERNS: PasswordPattern[] = [
  {
    name: 'Hardcoded password assignment',
    regex: /(?:^|[,;{\s(])(?:password|passwd|db_pass(?:word)?|redis_password|app_password|admin_password)\s*[=:]\s*["']([^"']{3,})["']/gim,
    context: 'assignment',
    baseSeverity: 'high',
  },
  {
    name: 'Hardcoded pwd assignment',
    regex: /(?:^|[,;{\s(])pwd\s*[=:]\s*["']([^"']{3,})["']/gim,
    context: 'assignment',
    baseSeverity: 'medium',  // `pwd` is ambiguous (could be working directory)
  },
]

const ENV_PATTERNS: PasswordPattern[] = [
  {
    name: 'ENV password variable',
    // Matches: DB_PASSWORD=value, REDIS_PASSWORD=value, etc. (unquoted and quoted)
    regex: /\b(?:[A-Z][A-Z0-9]*_)?(?:PASSWORD|PASSWD|DB_PASS(?:WORD)?|REDIS_PASS(?:WORD)?)\s*=\s*(?:["']([^"'\r\n]{3,})["']|([^\s#"'\r\n]{3,}))/g,
    context: '.env / config',
    baseSeverity: 'high',
  },
]

const URI_PATTERNS: PasswordPattern[] = [
  {
    name: 'PostgreSQL connection URI with password',
    regex: /postgres(?:ql)?(?:\+\w+)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'MySQL connection URI with password',
    regex: /mysql(?:\+\w+)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'MongoDB connection URI with password',
    regex: /mongodb(?:\+srv)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'Redis connection URI with password',
    // redis://:password@host or redis://user:password@host
    regex: /redis(?:s)?:\/\/[^@\s"']*:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'AMQP connection URI with password',
    regex: /amqps?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
]

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

function classifyValue(
  value: string,
  baseSeverity: 'high' | 'medium' | 'low',
  isUri: boolean,
): { severity: 'high' | 'medium' | 'low'; confidence: string } | null {
  if (isPasswordPlaceholder(value)) return null

  // URI credentials are almost always real — high confidence regardless of entropy
  if (isUri) {
    if (isTrivialDefault(value)) {
      return { severity: 'medium', confidence: 'medium' }
    }
    return { severity: baseSeverity, confidence: 'high' }
  }

  if (isTrivialDefault(value)) {
    // Still report, but downgrade
    return { severity: 'low', confidence: 'low' }
  }

  if (isHighEntropy(value)) {
    return { severity: baseSeverity, confidence: 'high' }
  }

  // Short/low-entropy value that isn't a known placeholder — possible but uncertain
  if (value.length >= 6) {
    const downgraded: 'high' | 'medium' | 'low' = baseSeverity === 'high' ? 'medium' : 'low'
    return { severity: downgraded, confidence: 'medium' }
  }

  // Too short to be meaningful
  return null
}

function runPatternSet(
  patterns: PasswordPattern[],
  content: string,
  url: string,
  sourceContext: string,
  seen: Set<string>,
  isUri: boolean,
): FindingInput[] {
  const findings: FindingInput[] = []

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      // Capture group 1 is primary value; group 2 is fallback for unquoted ENV matches
      const value = (match[1] || match[2] || '').trim()
      if (!value) continue

      const dedupeKey = `${pattern.name}:${value.substring(0, 24)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const classification = classifyValue(value, pattern.baseSeverity, isUri)
      if (!classification) continue

      const snippet = buildSnippet(content, match.index, match[0].length)

      findings.push({
        severity: classification.severity,
        category: 'secret_exposure',
        title: `${pattern.name} in ${sourceContext}`,
        description: `A ${pattern.context} containing a hardcoded password was found in ${sourceContext}. Credentials should never be embedded in client-side code or public assets.`,
        url,
        evidence: snippet.length > 300 ? snippet.substring(0, 300) + '…' : snippet,
        confidence: classification.confidence,
      })
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectHardcodedPasswords(
  content: string,
  url: string,
  sourceContext: string,
): FindingInput[] {
  const findings: FindingInput[] = []
  const seen = new Set<string>()

  findings.push(...runPatternSet(ASSIGNMENT_PATTERNS, content, url, sourceContext, seen, false))
  findings.push(...runPatternSet(ENV_PATTERNS, content, url, sourceContext, seen, false))
  findings.push(...runPatternSet(URI_PATTERNS, content, url, sourceContext, seen, true))

  return findings
}
