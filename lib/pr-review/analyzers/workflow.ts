import type { AnalyzerContext, AnalyzerOutput, PRReviewFindingDraft } from '../types'
import type { PRReviewResult } from '../types'

const LARGE_PR_FILE_THRESHOLD = 15
const LARGE_PR_ADDITION_THRESHOLD = 400
const STALE_DAYS = 7

export function runWorkflowAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const findings: PRReviewFindingDraft[] = []
  const notes: string[] = []
  const pr = ctx.pr

  const totalAdditions = pr.files.reduce((sum, f) => sum + (f.additions ?? 0), 0)
  const totalDeletions = pr.files.reduce((sum, f) => sum + (f.deletions ?? 0), 0)
  const fileCount = pr.files.length

  // 1. PR size
  let prSize: 'small' | 'medium' | 'large' = 'small'
  if (fileCount > LARGE_PR_FILE_THRESHOLD || totalAdditions > LARGE_PR_ADDITION_THRESHOLD) {
    prSize = 'large'
  } else if (fileCount > 5 || totalAdditions > 100) {
    prSize = 'medium'
  }

  if (prSize === 'large') {
    findings.push({
      category: 'workflow',
      severity: 'medium',
      ruleId: 'workflow/large-pr',
      title: 'Large PR',
      summary: `This PR touches ${fileCount} file(s) with ${totalAdditions} additions and ${totalDeletions} deletions. Large PRs are significantly harder to review thoroughly.`,
      whyFlagged: 'Research shows defect escape rate increases with PR size. Large PRs take longer to review, reviewers lose focus, and edge cases are missed.',
      suggestion: 'Consider splitting into smaller focused PRs: one for the refactor, one for the new feature, one for config changes.',
      evidence: {
        filePath: pr.files[0]?.path ?? '',
        snippet: `${fileCount} files changed, +${totalAdditions} -${totalDeletions}`,
      },
      scoreImpact: 1,
    })
    notes.push(`Large PR: ${fileCount} files, +${totalAdditions} lines`)
  }

  // 2. Reviewer not assigned
  const reviewerAssigned = pr.reviewerAssigned ?? false
  if (!reviewerAssigned) {
    findings.push({
      category: 'workflow',
      severity: 'low',
      ruleId: 'workflow/no-reviewer',
      title: 'No Reviewer Assigned',
      summary: 'This PR has no reviewer assigned. Unreviewed code is more likely to introduce regressions.',
      whyFlagged: 'PRs without assigned reviewers frequently merge without a second set of eyes, especially in high-velocity teams.',
      suggestion: 'Assign at least one reviewer with domain knowledge relevant to the changed files before merging.',
      evidence: { filePath: '' },
      scoreImpact: 0,
    })
    notes.push('No reviewer assigned')
  }

  // 3. Stale PR
  let stale = false
  if (pr.updatedAt) {
    const daysSinceUpdate = (Date.now() - new Date(pr.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > STALE_DAYS) {
      stale = true
      findings.push({
        category: 'workflow',
        severity: 'low',
        ruleId: 'workflow/stale-pr',
        title: 'Stale PR',
        summary: `This PR was last updated ${Math.round(daysSinceUpdate)} days ago. Stale PRs often accumulate merge conflicts and drift from the current state of main.`,
        whyFlagged: 'Stale PRs carry risk because the codebase may have changed significantly since the diff was created. Assumptions in the code may no longer hold.',
        suggestion: 'Rebase against main, resolve any conflicts, and re-run CI before merging.',
        evidence: {
          filePath: '',
          snippet: `Last updated: ${new Date(pr.updatedAt).toLocaleDateString()}`,
        },
        scoreImpact: 0,
      })
      notes.push(`Stale: last updated ${Math.round(daysSinceUpdate)} days ago`)
    }
  }

  // 4. CI checks
  if (pr.checksStatus === 'fail') {
    findings.push({
      category: 'workflow',
      severity: 'high',
      ruleId: 'workflow/checks-failing',
      title: 'CI Checks Failing',
      summary: 'One or more CI checks are failing for this PR. Merging with failing checks bypasses automated quality gates.',
      whyFlagged: 'Failing CI checks indicate tests, linting, or other automated validations are not passing. These exist precisely to catch issues before merge.',
      suggestion: 'Do not merge until all required checks pass. Investigate the failure and fix the root cause.',
      evidence: { filePath: '', snippet: 'checksStatus: fail' },
      scoreImpact: 2,
    })
    notes.push('CI checks failing')
  } else if (pr.checksStatus === 'warn') {
    notes.push('CI checks have warnings')
  }

  const workflowPatches: Partial<PRReviewResult['workflow']> = {
    reviewerAssigned,
    prSize,
    stale,
    notes,
  }

  return { findings, workflowPatches }
}
