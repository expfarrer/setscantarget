import { FindingInput } from '../types'
import { isLikelyPlaceholder, isHighEntropy } from './secrets'

// ---------------------------------------------------------------------------
// Password-specific placeholder / skip heuristics
// ---------------------------------------------------------------------------

const PASSWORD_PLACEHOLDER_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /^pass$/i,
  /^pwd$/i,
  /^secret$/i,
  /^<[^>]+>$/,           // <password>
  /^\{[^}]+\}$/,         // {password}
  /^\$\{[^}]+\}$/,       // ${PASSWORD} — template variable
  /^%[a-z(]/i,           // %s, %(name)s — format strings
  /^\*+$/,
  /^\.+$/,
  /^x+$/i,
  /^n\/?a$/i,
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
  /^your.?pass(word)?$/i,
  /^enter.?pass(word)?$/i,
  /^my.?pass(word)?$/i,
  /^test/i,
  /^demo/i,
  /^example/i,
  /^sample/i,
  /^fake/i,
  /^dummy/i,
  /^placeholder/i,
  /^insert.?here$/i,
  /^type.?here$/i,
  /^123+$/,              // 123, 1234, 12345, etc.
  /^abc+$/i,
]

// Still report but downgrade to low confidence
const TRIVIAL_DEFAULTS = new Set([
  'root', 'admin', 'toor', 'pass', 'qwerty', 'letmein',
  'welcome', 'monkey', 'dragon', 'password1', 'iloveyou',
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
  regex: RegExp
  context: string
  baseSeverity: 'high' | 'medium' | 'low'
}

// All password-like variable/key names to check for assignments
const PASSWORD_KEY_NAMES = [
  'password', 'passwd', 'pwd',
  'db_pass(?:word)?', 'database_pass(?:word)?',
  'redis_pass(?:word)?', 'mysql_pass(?:word)?',
  'postgres_pass(?:word)?', 'postgresql_pass(?:word)?', 'pg_pass(?:word)?',
  'mongo_pass(?:word)?', 'mongodb_pass(?:word)?',
  'admin_pass(?:word)?', 'root_pass(?:word)?',
  'user_pass(?:word)?', 'app_pass(?:word)?',
  'smtp_pass(?:word)?', 'mail_pass(?:word)?', 'email_pass(?:word)?',
  'api_pass(?:word)?', 'ftp_pass(?:word)?',
  'ldap_pass(?:word)?', 'ssh_pass(?:word)?',
].join('|')

const ASSIGNMENT_PATTERNS: PasswordPattern[] = [
  {
    name: 'Hardcoded password assignment',
    // Matches: password = "value", password: "value", PASSWORD = 'value'
    regex: new RegExp(
      `(?:^|[,;{\\s(])(?:${PASSWORD_KEY_NAMES})\\s*[=:]\\s*["']([^"']{3,})["']`,
      'gim'
    ),
    context: 'code assignment',
    baseSeverity: 'high',
  },
]

const ENV_PATTERNS: PasswordPattern[] = [
  {
    name: 'ENV password variable',
    // DB_PASSWORD=value, REDIS_PASSWORD="value", SMTP_PASS=unquoted, etc.
    regex: /\b(?:[A-Z][A-Z0-9]*_)?(?:PASSWORD|PASSWD|PASS)\s*=\s*(?:["']([^"'\r\n]{3,})["']|([^\s#"'\r\n]{3,}))/g,
    context: 'environment variable',
    baseSeverity: 'high',
  },
]

const URI_PATTERNS: PasswordPattern[] = [
  {
    name: 'PostgreSQL URI with embedded password',
    regex: /postgres(?:ql)?(?:\+\w+)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'MySQL/MariaDB URI with embedded password',
    regex: /(?:mysql|mariadb)(?:\+\w+)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'MongoDB URI with embedded password',
    regex: /mongodb(?:\+srv)?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'Redis URI with embedded password',
    regex: /rediss?:\/\/[^@\s"']*:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'AMQP URI with embedded password',
    regex: /amqps?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'FTP URI with embedded password',
    regex: /s?ftp:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
  {
    name: 'SMTP URI with embedded password',
    regex: /smtps?:\/\/[^:@\s"']+:([^@\s"']{3,})@/gi,
    context: 'connection URI',
    baseSeverity: 'high',
  },
]

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(
  value: string,
  baseSeverity: 'high' | 'medium' | 'low',
  isUri: boolean,
): { severity: 'high' | 'medium' | 'low'; confidence: string } | null {
  if (isPasswordPlaceholder(value)) return null

  if (isUri) {
    if (isTrivialDefault(value)) return { severity: 'medium', confidence: 'medium' }
    return { severity: baseSeverity, confidence: 'high' }
  }

  if (isTrivialDefault(value)) return { severity: 'low', confidence: 'low' }

  if (isHighEntropy(value)) return { severity: baseSeverity, confidence: 'high' }

  // Short/low-entropy value that isn't a known placeholder
  if (value.length >= 6) {
    const downgraded: 'high' | 'medium' | 'low' = baseSeverity === 'high' ? 'medium' : 'low'
    return { severity: downgraded, confidence: 'medium' }
  }

  return null
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

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
      const value = (match[1] || match[2] || '').trim()
      if (!value) continue

      const dedupeKey = `${pattern.name}:${value.substring(0, 24)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const result = classify(value, pattern.baseSeverity, isUri)
      if (!result) continue

      const snippet = buildSnippet(content, match.index, match[0].length)

      findings.push({
        severity: result.severity,
        category: 'hardcoded_password',
        title: `${pattern.name} in ${sourceContext}`,
        description: `A ${pattern.context} containing a hardcoded password was detected in ${sourceContext}. Credentials embedded in client-facing artifacts may be exposed to any user who inspects the page source.`,
        url,
        evidence: snippet.length > 300 ? snippet.substring(0, 300) + '…' : snippet,
        confidence: result.confidence,
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
