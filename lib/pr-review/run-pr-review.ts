import { prisma } from '../db'
import { parseGitHubPRUrl, fetchGitHubPR } from './github'
import { runAnatomyAnalyzer } from './analyzers/anatomy'
import { runMaintainabilityAnalyzer } from './analyzers/maintainability'
import { runNamingAnalyzer } from './analyzers/naming'
import { runExposureAnalyzer } from './analyzers/exposure'
import { runTestImpactAnalyzer } from './analyzers/test-impact'
import { runWorkflowAnalyzer } from './analyzers/workflow'
import { buildFocusFiles } from './analyzers/focus-files'
import { computeScore } from './scoring'
import { aiExplainFindings } from './ai-explain'
import type { NormalizedPRPayload, PRReviewFindingDraft, AnalyzerOutput } from './types'

export async function runPRReview(reviewId: string): Promise<void> {
  const review = await prisma.pRReview.findUnique({ where: { id: reviewId } })
  if (!review) throw new Error(`PRReview ${reviewId} not found`)

  console.log(`[PR Review ${reviewId}] Starting analysis of ${review.prUrl}`)

  await prisma.pRReview.update({
    where: { id: reviewId },
    data: { status: 'running' },
  })

  try {
    await performReview(reviewId, review.prUrl, review.repoOwner, review.repoName, review.prNumber)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[PR Review ${reviewId}] Failed:`, msg)
    await prisma.pRReview.update({
      where: { id: reviewId },
      data: { status: 'failed', errorMessage: msg },
    })
  }
}

async function performReview(
  reviewId: string,
  prUrl: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  // 1. Fetch PR payload
  let pr: NormalizedPRPayload

  const useMock = process.env.PR_REVIEW_USE_MOCK === 'true'

  if (useMock) {
    console.log(`[PR Review ${reviewId}] Using mock payload`)
    const { MOCK_PR_PAYLOAD } = await import('./mock')
    pr = { ...MOCK_PR_PAYLOAD, prUrl, repo: `${owner}/${repo}`, number: prNumber }
  } else {
    console.log(`[PR Review ${reviewId}] Fetching from GitHub`)
    pr = await fetchGitHubPR(owner, repo, prNumber)
    console.log(`[PR Review ${reviewId}] Fetched ${pr.files.length} files from GitHub`)
  }

  // Store raw payload for debugging
  await prisma.pRReview.update({
    where: { id: reviewId },
    data: {
      title: pr.title,
      author: pr.author,
      headRef: pr.headRef,
      baseRef: pr.baseRef,
      checksStatus: pr.checksStatus,
      reviewerAssigned: pr.reviewerAssigned,
      rawPayloadJson: JSON.stringify(pr).slice(0, 50000),
    },
  })

  // 2. Run analyzers
  const ctx = { reviewId, pr }
  const analyzerResults: AnalyzerOutput[] = []

  console.log(`[PR Review ${reviewId}] Running analyzers`)

  const analyzers = [
    { name: 'anatomy', fn: runAnatomyAnalyzer },
    { name: 'maintainability', fn: runMaintainabilityAnalyzer },
    { name: 'naming', fn: runNamingAnalyzer },
    { name: 'exposure', fn: runExposureAnalyzer },
    { name: 'test-impact', fn: runTestImpactAnalyzer },
    { name: 'workflow', fn: runWorkflowAnalyzer },
  ]

  for (const { name, fn } of analyzers) {
    try {
      const result = fn(ctx)
      analyzerResults.push(result)
      console.log(`[PR Review ${reviewId}] ${name}: ${result.findings.length} finding(s)`)
    } catch (err) {
      console.warn(`[PR Review ${reviewId}] Analyzer ${name} failed:`, err)
    }
  }

  // 3. Merge all findings
  let allFindings: PRReviewFindingDraft[] = analyzerResults.flatMap(r => r.findings)

  // 4. Optional AI enrichment
  try {
    allFindings = await aiExplainFindings(allFindings, pr.title)
  } catch {
    // non-fatal
  }

  // 5. Build focus files
  const focusFiles = buildFocusFiles(allFindings)

  // 6. Compute score / risk
  const { overallRisk, mergeRecommendation, highRiskCount } = computeScore(
    allFindings,
    pr.checksStatus,
  )

  // 7. Merge summary patches from analyzers
  let anatomy = { logic: 0, tests: 0, config: 0, noise: 0 }
  let maintainabilityStatus: string = 'neutral'
  let exposureRiskCount = 0
  let testGapCount = 0
  const workflowNotes: string[] = []
  let reviewerAssigned: boolean | undefined = pr.reviewerAssigned
  let prSize: string | undefined = undefined
  let stale: boolean | undefined = undefined

  for (const result of analyzerResults) {
    if (result.summaryPatches?.anatomy) anatomy = result.summaryPatches.anatomy
    if (result.summaryPatches?.maintainabilityStatus) maintainabilityStatus = result.summaryPatches.maintainabilityStatus
    if (result.summaryPatches?.exposureRiskCount) exposureRiskCount += result.summaryPatches.exposureRiskCount
    if (result.summaryPatches?.testGapCount) testGapCount += result.summaryPatches.testGapCount
    if (result.workflowPatches?.notes) workflowNotes.push(...result.workflowPatches.notes)
    if (result.workflowPatches?.reviewerAssigned !== undefined) reviewerAssigned = result.workflowPatches.reviewerAssigned
    if (result.workflowPatches?.prSize) prSize = result.workflowPatches.prSize
    if (result.workflowPatches?.stale !== undefined) stale = result.workflowPatches.stale
  }

  // 8. Persist findings
  console.log(`[PR Review ${reviewId}] Persisting ${allFindings.length} finding(s)`)

  for (const f of allFindings) {
    await prisma.pRReviewFinding.create({
      data: {
        prReviewId: reviewId,
        category: f.category,
        severity: f.severity,
        ruleId: f.ruleId,
        title: f.title,
        summary: f.summary,
        whyFlagged: f.whyFlagged,
        suggestion: f.suggestion,
        filePath: f.evidence.filePath,
        startLine: f.evidence.startLine,
        endLine: f.evidence.endLine,
        snippet: f.evidence.snippet?.slice(0, 1000),
        scoreImpact: f.scoreImpact ?? 0,
        metadataJson: f.metadata ? JSON.stringify(f.metadata) : null,
      },
    })
  }

  // 9. Persist focus files as metadata on the review (stored in rawPayloadJson extension)
  // Store focus files in a separate field via JSON extension in the rawPayload
  const focusJson = JSON.stringify(focusFiles)

  // 10. Update PRReview to completed
  await prisma.pRReview.update({
    where: { id: reviewId },
    data: {
      status: 'completed',
      overallRisk,
      mergeRecommendation,
      maintainabilityStatus,
      highRiskCount,
      exposureRiskCount,
      testGapCount,
      anatomyLogicPct: anatomy.logic,
      anatomyTestsPct: anatomy.tests,
      anatomyConfigPct: anatomy.config,
      anatomyNoisePct: anatomy.noise,
      reviewerAssigned,
      prSize,
      stale,
      // Store focus files JSON appended to raw payload field
      rawPayloadJson: JSON.stringify({ pr, focusFiles, workflowNotes }),
    },
  })

  console.log(`[PR Review ${reviewId}] Complete — risk: ${overallRisk}, recommendation: ${mergeRecommendation}`)
}
