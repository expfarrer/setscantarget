import type { AnalyzerContext, AnalyzerOutput, PRReviewFindingDraft } from '../types'

function isTestFile(path: string): boolean {
  return /(__tests__|\.test\.|\.spec\.|\/tests\/|\/test\/)/.test(path)
}

function isLogicFile(path: string): boolean {
  if (isTestFile(path)) return false
  return /\.(ts|tsx|js|jsx|py|go|rb|java|cs|php|swift|kt)$/.test(path)
}

// Patterns that indicate business logic / validation changes
const LOGIC_PATTERNS = [
  /^\+.*(function|const\s+\w+\s*=\s*(?:async\s+)?\()/,
  /^\+.*\bvalidat/i,
  /^\+.*\bprocessOrder|checkout|payment|refund|authorize|authenticate/i,
  /^\+.*\b(if|switch|try|catch)\b.*\{/,
  /^\+.*throw\s+new\s+Error/,
  /^\+.*return\s+\w/,
]

function hasLogicChanges(patch: string): boolean {
  const lines = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  const logicLineCount = lines.filter(l => LOGIC_PATTERNS.some(p => p.test(l))).length
  return logicLineCount >= 3
}

// Paths that strongly suggest business logic
const SERVICE_PATH_PATTERNS = [
  /\/(service|services)\//i,
  /\/(controller|controllers)\//i,
  /\/(handler|handlers)\//i,
  /\/(api|routes|router)\//i,
  /\/(domain|usecase|usecases|use-case)\//i,
  /\/(middleware)\//i,
  /\/(validator|validation)\//i,
]

function isServicePath(path: string): boolean {
  return SERVICE_PATH_PATTERNS.some(p => p.test(path))
}

export function runTestImpactAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const findings: PRReviewFindingDraft[] = []
  const files = ctx.pr.files

  const changedLogicFiles = files.filter(f => isLogicFile(f.path))
  const changedTestFiles = files.filter(f => isTestFile(f.path))

  const hasTestChanges = changedTestFiles.length > 0

  // Logic files with actual logic changes, no corresponding test changes
  const logicFilesWithChanges = changedLogicFiles.filter(f =>
    f.patch && hasLogicChanges(f.patch)
  )

  if (logicFilesWithChanges.length > 0 && !hasTestChanges) {
    const highValueFiles = logicFilesWithChanges.filter(f => isServicePath(f.path))
    const severity = highValueFiles.length > 0 ? 'high' : 'medium'

    findings.push({
      category: 'tests',
      severity,
      ruleId: 'tests/no-test-update',
      title: 'Missing Test Coverage Update',
      summary: `${logicFilesWithChanges.length} logic file(s) were modified with no corresponding test files changed. Files: ${logicFilesWithChanges.slice(0, 3).map(f => `\`${f.path}\``).join(', ')}.`,
      whyFlagged: 'Logic changes without test updates increase the risk of undetected regressions. Test coverage should be maintained or extended when behaviour changes.',
      suggestion: 'Add or update unit/integration tests for the changed logic. Focus especially on error paths, edge cases, and the changed conditional branches.',
      evidence: {
        filePath: logicFilesWithChanges[0].path,
      },
      scoreImpact: severity === 'high' ? 3 : 2,
    })
  } else if (logicFilesWithChanges.length > 0 && hasTestChanges) {
    // Check if service-layer files were changed without matching test files
    const untestedServices = logicFilesWithChanges.filter(f => {
      if (!isServicePath(f.path)) return false
      // Check if any test file path somewhat corresponds to this logic file
      const baseName = f.path.replace(/\.[^.]+$/, '').split('/').pop() || ''
      return !changedTestFiles.some(tf => tf.path.includes(baseName))
    })

    if (untestedServices.length > 0) {
      findings.push({
        category: 'tests',
        severity: 'medium',
        ruleId: 'tests/service-without-test',
        title: 'Logic Changed Without Test Evidence',
        summary: `${untestedServices.length} service/controller file(s) were modified but no matching test files were updated: ${untestedServices.slice(0, 2).map(f => `\`${f.path}\``).join(', ')}.`,
        whyFlagged: 'Service and controller changes often modify business rules. If the corresponding tests were not updated, they may not exercise the new behavior.',
        suggestion: 'Verify that existing tests still cover the changed paths. Add new test cases that specifically target the modified logic.',
        evidence: {
          filePath: untestedServices[0].path,
        },
        scoreImpact: 2,
      })
    }
  }

  return {
    findings,
    summaryPatches: {
      testGapCount: findings.length,
    },
  }
}
