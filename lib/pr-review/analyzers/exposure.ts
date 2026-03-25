import type { AnalyzerContext, AnalyzerOutput, PRReviewFindingDraft } from '../types'

// Auth guard patterns that might have been removed
const AUTH_GUARD_PATTERNS = [
  /requireAuth/,
  /authenticate/,
  /isAuthenticated/,
  /checkAuth/,
  /verifyToken/,
  /authMiddleware/,
  /passport\.authenticate/,
  /jwt\.verify/,
  /authorize/,
]

// Sensitive route patterns being exposed
const SENSITIVE_ROUTE_PATTERNS = [
  { pattern: /router\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]*\/(admin|internal|debug|root|superuser)[^'"`]*['"`]/, label: 'admin/internal' },
  { pattern: /router\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]*\/login[^'"`]*['"`]/, label: 'login' },
  { pattern: /app\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]*\/(admin|internal|debug)[^'"`]*['"`]/, label: 'admin/internal' },
]

// Secret / credential patterns
const SECRET_PATTERNS = [
  { pattern: /^\+.*(password|passwd|pwd)\s*[:=]\s*['"`][^'"`]{3,}['"`]/i, label: 'Hardcoded password', ruleId: 'exposure/hardcoded-secret' },
  { pattern: /^\+.*(api[_-]?key|apikey)\s*[:=]\s*['"`][A-Za-z0-9+/]{10,}['"`]/i, label: 'API key', ruleId: 'exposure/hardcoded-secret' },
  { pattern: /^\+.*Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, label: 'Bearer token', ruleId: 'exposure/hardcoded-secret' },
  { pattern: /^\+.*['"](sk|pk|rk)-[A-Za-z0-9]{16,}['"]/i, label: 'Service key', ruleId: 'exposure/hardcoded-secret' },
  { pattern: /^\+.*const\s+\w*(secret|token|key|password)\w*\s*=\s*['"`][^'"`]{6,}['"`]/i, label: 'Hardcoded credential', ruleId: 'exposure/hardcoded-secret' },
  { pattern: /^\+.*ADMIN[_-]?(SECRET|KEY|TOKEN|PASSWORD)\s*=\s*['"`][^'"`]{3,}['"`]/i, label: 'Admin credential', ruleId: 'exposure/hardcoded-secret' },
]

// Debug / dev artifacts in non-test files
const DEBUG_ARTIFACT_PATTERNS = [
  /^\+.*\bconsole\.(log|debug|info|warn)\s*\([^)]*(?:password|token|secret|key|auth|session|cvv|card)[^)]*\)/i,
  /^\+.*process\.env\.NODE_ENV.*===?\s*['"](?:dev|test|development|local)['"]/i,
]

const BYPASS_PATTERNS = [
  /^\+.*(?:skipAuth|bypassAuth|noAuth|disableAuth|authDisabled|testMode\s*=\s*true)/i,
  /^\+.*mock.*(?:user|auth|session|token)\s*=/i,
]

// Test/dev file patterns that should NOT appear in production code paths
const DEV_ARTIFACT_IN_PROD = [
  { pattern: /^\+.*\b(seed|fixture|factory|mock|fake|stub)\b.*(?:user|data|db)/i, label: 'seed/mock data reference' },
  { pattern: /^\+.*\btest[_-]?(?:user|password|token|key|secret)\b/i, label: 'test credential reference' },
]

function isTestFile(path: string): boolean {
  return /(__tests__|\.test\.|\.spec\.|\/tests\/|\/test\/)/.test(path)
}

function addedLines(patch: string): string[] {
  return patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
}

function removedLines(patch: string): string[] {
  return patch.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'))
}

function parseLineNumber(patch: string, matchLine: string): number | undefined {
  const lines = patch.split('\n')
  let currentLine = 0
  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (hunkMatch) currentLine = parseInt(hunkMatch[1], 10) - 1
    else if (line.startsWith('+')) {
      currentLine++
      if (line === matchLine) return currentLine
    } else if (!line.startsWith('-')) {
      currentLine++
    }
  }
  return undefined
}

export function runExposureAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const findings: PRReviewFindingDraft[] = []
  let exposureCount = 0

  for (const file of ctx.pr.files) {
    if (!file.patch) continue
    const added = addedLines(file.patch)
    const removed = removedLines(file.patch)
    const inTestFile = isTestFile(file.path)

    // 1. Removed auth guard
    const removedGuards = removed.filter(l =>
      AUTH_GUARD_PATTERNS.some(p => p.test(l))
    )
    if (removedGuards.length > 0 && !inTestFile) {
      exposureCount++
      findings.push({
        category: 'exposure',
        severity: 'high',
        ruleId: 'exposure/removed-auth-guard',
        title: 'Auth Guard Removed',
        summary: `\`${file.path}\` removes an authentication or authorization middleware/check. This may widen the access surface.`,
        whyFlagged: 'Removing auth guards without a clear replacement means previously protected endpoints may become publicly accessible. This is a high-impact change that should be reviewed carefully.',
        suggestion: 'Confirm the auth check is either moved to a higher-level middleware, replaced by a decorator, or intentionally removed for a publicly accessible route. Document the decision.',
        evidence: {
          filePath: file.path,
          snippet: removedGuards[0].replace(/^-/, '').trim(),
        },
        scoreImpact: 5,
      })
    }

    // 2. Sensitive routes being added
    for (const { pattern, label } of SENSITIVE_ROUTE_PATTERNS) {
      const matched = added.find(l => pattern.test(l))
      if (matched && !inTestFile) {
        exposureCount++
        findings.push({
          category: 'exposure',
          severity: 'high',
          ruleId: 'exposure/sensitive-route',
          title: 'Potential API Exposure',
          summary: `\`${file.path}\` registers a new ${label} route. Ensure appropriate authentication is required.`,
          whyFlagged: 'Routes under /admin, /internal, or /debug paths often access privileged data. If not properly protected, they represent a direct attack surface.',
          suggestion: 'Verify this route is protected by a role-based auth middleware. If it must be accessible publicly, document why and add rate limiting.',
          evidence: {
            filePath: file.path,
            snippet: matched.replace(/^\+/, '').trim(),
          },
          scoreImpact: 5,
        })
        break
      }
    }

    // 3. Hardcoded secrets / credentials
    for (const { pattern, label, ruleId } of SECRET_PATTERNS) {
      const matched = added.find(l => pattern.test(l))
      if (matched) {
        exposureCount++
        findings.push({
          category: 'security',
          severity: 'high',
          ruleId,
          title: 'Possible Secret Leakage',
          summary: `\`${file.path}\` appears to contain a hardcoded ${label}. Credentials committed to source control are a critical security risk.`,
          whyFlagged: 'Hardcoded secrets are frequently found by automated scanners and attackers who access code repositories. Even if later removed, secrets in git history remain exposed.',
          suggestion: 'Move credentials to environment variables or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault). Rotate any exposed credentials immediately.',
          evidence: {
            filePath: file.path,
            snippet: matched.replace(/^\+/, '').replace(/(['"`])[A-Za-z0-9+/]{4,}(\1)/g, '$1***$2').trim(),
          },
          scoreImpact: 5,
        })
        break
      }
    }

    // 4. Console logging of sensitive values
    const sensitiveLogLines = added.filter(l =>
      /^\+.*console\.(log|debug|info|warn)/.test(l) &&
      /password|token|secret|key|auth|session|cvv|card|ssn/i.test(l)
    )
    if (sensitiveLogLines.length > 0 && !inTestFile) {
      exposureCount++
      findings.push({
        category: 'exposure',
        severity: 'medium',
        ruleId: 'exposure/sensitive-console-log',
        title: 'Sensitive Data in Console Log',
        summary: `\`${file.path}\` logs values that may contain sensitive information (passwords, tokens, card data).`,
        whyFlagged: 'Console output is often captured in log aggregation systems, bug reports, and monitoring tools where it may be accessible to unintended parties.',
        suggestion: 'Remove logging of sensitive fields, or use a structured logger that supports field redaction. Never log raw payment, auth, or PII data.',
        evidence: {
          filePath: file.path,
          snippet: sensitiveLogLines[0].replace(/^\+/, '').trim(),
        },
        scoreImpact: 3,
      })
    }

    // 5. Bypass patterns
    const bypassLine = added.find(l => BYPASS_PATTERNS.some(p => p.test(l)))
    if (bypassLine && !inTestFile) {
      exposureCount++
      findings.push({
        category: 'exposure',
        severity: 'high',
        ruleId: 'exposure/auth-bypass',
        title: 'Auth Exposure Risk',
        summary: `\`${file.path}\` introduces a pattern that appears to bypass authentication or use mock credentials in non-test code.`,
        whyFlagged: 'Auth bypass patterns in production code paths are a critical vulnerability class. Even "temporary" bypasses get merged and forgotten.',
        suggestion: 'Remove the bypass entirely. If needed for testing, gate it strictly behind a test environment check that is verified server-side, not client-controllable.',
        evidence: {
          filePath: file.path,
          snippet: bypassLine.replace(/^\+/, '').trim(),
        },
        scoreImpact: 5,
      })
    }

    // 6. Dev artifacts in non-test code
    if (!inTestFile) {
      for (const { pattern, label } of DEV_ARTIFACT_IN_PROD) {
        const matched = added.find(l => pattern.test(l))
        if (matched) {
          findings.push({
            category: 'exposure',
            severity: 'medium',
            ruleId: 'exposure/dev-artifact',
            title: 'Development Artifact Left Behind',
            summary: `\`${file.path}\` references a ${label} in what appears to be production code.`,
            whyFlagged: 'Test fixtures, seed data, and mock references in production code can expose internal data structures or allow unintended data creation.',
            suggestion: 'Move test/seed helpers to test-only files or behind a strict environment gate. Production code should not depend on test utilities.',
            evidence: {
              filePath: file.path,
              snippet: matched.replace(/^\+/, '').trim(),
            },
            scoreImpact: 2,
          })
          break
        }
      }
    }
  }

  return {
    findings,
    summaryPatches: {
      exposureRiskCount: exposureCount,
    },
  }
}
