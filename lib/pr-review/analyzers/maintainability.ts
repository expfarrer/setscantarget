import type { AnalyzerContext, AnalyzerOutput, PRReviewFindingDraft } from '../types'

const TODO_FIXME = /^\+.*\b(TODO|FIXME|HACK|XXX)\b/

// Lines that look like hardcoded workaround patterns
const WORKAROUND_PATTERNS = [
  /^\+.*\btemp(orary)?\b/i,
  /^\+.*\bworkaround\b/i,
  /^\+.*\bquick[_-]?fix\b/i,
  /^\+.*hardcoded/i,
  /^\+.*bypass/i,
  /^\+.*skip.*for now/i,
]

function addedLines(patch: string): string[] {
  return patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
}

function countNestingDepth(line: string): number {
  let depth = 0
  for (const ch of line) {
    if (ch === '{') depth++
  }
  return depth
}

function findLargestAdditionBlock(patch: string): number {
  let maxBlock = 0
  let cur = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      cur++
      if (cur > maxBlock) maxBlock = cur
    } else {
      cur = 0
    }
  }
  return maxBlock
}

function extractSnippet(patch: string, pattern: RegExp, maxLines = 3): string {
  const lines = patch.split('\n')
  const idx = lines.findIndex(l => pattern.test(l))
  if (idx === -1) return ''
  return lines.slice(idx, idx + maxLines).join('\n').replace(/^\+/, '').trim()
}

export function runMaintainabilityAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const findings: PRReviewFindingDraft[] = []
  let hasDegradation = false

  for (const file of ctx.pr.files) {
    if (!file.patch) continue
    const added = addedLines(file.patch)
    if (added.length === 0) continue

    // 1. TODO / FIXME shortcuts
    const todoLines = added.filter(l => TODO_FIXME.test(l))
    if (todoLines.length > 0) {
      hasDegradation = true
      findings.push({
        category: 'maintainability',
        severity: 'low',
        ruleId: 'maint/todo-shortcut',
        title: 'Unresolved TODO / FIXME in new code',
        summary: `${todoLines.length} TODO or FIXME comment(s) added in \`${file.path}\`. These indicate deferred work being merged.`,
        whyFlagged: 'Merging code with explicit TODO/FIXME markers signals incomplete implementation or intentional shortcuts that may be forgotten.',
        suggestion: 'Resolve the deferred work before merging, or create a tracked issue and reference it in a comment instead of a bare TODO.',
        evidence: {
          filePath: file.path,
          snippet: todoLines.slice(0, 2).map(l => l.replace(/^\+/, '')).join('\n').trim(),
        },
        scoreImpact: 1,
      })
    }

    // 2. Hardcoded workaround patterns
    for (const pattern of WORKAROUND_PATTERNS) {
      const matched = added.find(l => pattern.test(l))
      if (matched) {
        hasDegradation = true
        findings.push({
          category: 'maintainability',
          severity: 'low',
          ruleId: 'maint/hardcoded-workaround',
          title: 'Hardcoded Workaround Pattern',
          summary: `A hardcoded workaround or temporary fix appears in \`${file.path}\`.`,
          whyFlagged: 'Workarounds merged to main tend to outlive their intended lifespan and accumulate technical debt.',
          suggestion: 'Either resolve the underlying issue properly, or document the workaround with a link to the tracking issue.',
          evidence: {
            filePath: file.path,
            snippet: matched.replace(/^\+/, '').trim(),
          },
          scoreImpact: 1,
        })
        break
      }
    }

    // 3. Complexity spike — large addition block
    const blockSize = findLargestAdditionBlock(file.patch)
    if (blockSize > 40) {
      hasDegradation = true
      findings.push({
        category: 'maintainability',
        severity: blockSize > 70 ? 'high' : 'medium',
        ruleId: 'maint/complexity-spike',
        title: 'Complexity Spike',
        summary: `\`${file.path}\` adds a consecutive block of ${blockSize} lines without interruption. This suggests a large, dense function or method.`,
        whyFlagged: 'Large monolithic code blocks are harder to review, test, and maintain. Complexity spikes correlate with higher defect density.',
        suggestion: 'Break the addition into smaller, single-responsibility functions. Aim for functions under 30 lines with clear names.',
        evidence: { filePath: file.path },
        scoreImpact: blockSize > 70 ? 3 : 2,
      })
    }

    // 4. Deep nesting
    const maxDepth = added.reduce((max, l) => Math.max(max, countNestingDepth(l)), 0)
    if (maxDepth >= 4) {
      hasDegradation = true
      findings.push({
        category: 'maintainability',
        severity: 'medium',
        ruleId: 'maint/deep-nesting',
        title: 'Deep Nesting Detected',
        summary: `\`${file.path}\` contains code with ${maxDepth} levels of nesting. This typically indicates complex branching logic.`,
        whyFlagged: 'Deeply nested code is difficult to read and reason about. It often signals missing early-returns or poorly separated concerns.',
        suggestion: 'Use early-return / guard clauses to flatten the structure. Extract nested blocks into named helper functions.',
        evidence: { filePath: file.path },
        scoreImpact: 2,
      })
    }

    // 5. Mixed responsibilities — multiple distinct import groups + multiple action patterns
    const importCount = added.filter(l => /import\s+.+from/.test(l)).length
    const asyncCallCount = added.filter(l => /await\s+\w/.test(l)).length
    if (importCount >= 5 && asyncCallCount >= 5) {
      hasDegradation = true
      findings.push({
        category: 'maintainability',
        severity: 'medium',
        ruleId: 'maint/mixed-responsibilities',
        title: 'Mixed Responsibilities',
        summary: `\`${file.path}\` imports ${importCount} modules and makes ${asyncCallCount} async calls, suggesting it handles multiple concerns in one place.`,
        whyFlagged: 'A function or module that orchestrates many unrelated operations violates the Single Responsibility Principle and is harder to test in isolation.',
        suggestion: 'Separate the concerns into distinct service functions or orchestration layers. Each function should do one thing clearly.',
        evidence: { filePath: file.path },
        scoreImpact: 2,
      })
    }

    // 6. Long conditional chains
    const condCount = added.filter(l => /^\+.*\b(else if|} else if|\|\||&&)\b/.test(l)).length
    if (condCount >= 5) {
      hasDegradation = true
      findings.push({
        category: 'maintainability',
        severity: 'low',
        ruleId: 'maint/long-conditional-chain',
        title: 'Long Conditional Chain',
        summary: `\`${file.path}\` adds ${condCount} chained conditional branches. This may indicate a missing strategy pattern or lookup table.`,
        whyFlagged: 'Long if/else-if chains or complex boolean expressions are fragile and hard to extend without introducing regressions.',
        suggestion: 'Consider a lookup table, strategy pattern, or a dedicated validator/switch that maps inputs to outcomes.',
        evidence: {
          filePath: file.path,
          snippet: extractSnippet(file.patch, /else if|\|\||&&/),
        },
        scoreImpact: 1,
      })
    }
  }

  const maintainabilityStatus = hasDegradation ? 'degraded' : 'neutral'

  return {
    findings,
    summaryPatches: { maintainabilityStatus },
  }
}
