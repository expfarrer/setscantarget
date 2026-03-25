import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { PRReviewResult } from '@/lib/pr-review/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const review = await prisma.pRReview.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Parse stored focus files and workflow notes — rawPayloadJson is internal and not forwarded
    let focusFiles: PRReviewResult['focusFiles'] = []
    let workflowNotes: string[] = []
    if (review.rawPayloadJson) {
      try {
        const raw = JSON.parse(review.rawPayloadJson) as {
          focusFiles?: PRReviewResult['focusFiles']
          workflowNotes?: string[]
        }
        focusFiles = raw.focusFiles ?? []
        workflowNotes = raw.workflowNotes ?? []
      } catch {
        // malformed payload — degrade gracefully
      }
    }

    const result: PRReviewResult = {
      id: review.id,
      status: review.status as PRReviewResult['status'],
      pr: {
        url: review.prUrl,
        repo: `${review.repoOwner}/${review.repoName}`,
        number: review.prNumber,
        title: review.title ?? '',
        author: review.author ?? '',
        headRef: review.headRef ?? '',
        baseRef: review.baseRef ?? '',
        checksStatus: (review.checksStatus as PRReviewResult['pr']['checksStatus']) ?? 'unknown',
        reviewStatus: review.reviewStatus ?? undefined,
      },
      summary: {
        overallRisk: (review.overallRisk as PRReviewResult['summary']['overallRisk']) ?? 'low',
        mergeRecommendation:
          (review.mergeRecommendation as PRReviewResult['summary']['mergeRecommendation']) ?? 'pass',
        highRiskCount: review.highRiskCount,
        maintainabilityStatus:
          (review.maintainabilityStatus as PRReviewResult['summary']['maintainabilityStatus']) ?? 'neutral',
        exposureRiskCount: review.exposureRiskCount,
        testGapCount: review.testGapCount,
        anatomy: {
          logic: review.anatomyLogicPct,
          tests: review.anatomyTestsPct,
          config: review.anatomyConfigPct,
          noise: review.anatomyNoisePct,
        },
      },
      focusFiles,
      findings: review.findings.map(f => ({
        id: f.id,
        category: f.category as PRReviewResult['findings'][number]['category'],
        severity: f.severity as PRReviewResult['findings'][number]['severity'],
        ruleId: f.ruleId,
        title: f.title,
        summary: f.summary,
        whyFlagged: f.whyFlagged,
        suggestion: f.suggestion,
        evidence: {
          filePath: f.filePath,
          startLine: f.startLine ?? undefined,
          endLine: f.endLine ?? undefined,
          // Always return the safe/redacted form — revealedSnippet is never included here
          snippet: f.snippet ?? undefined,
          isRedacted: f.isRedacted,
          canReveal: f.revealedSnippet != null,
        },
        metadata: f.metadataJson
          ? (JSON.parse(f.metadataJson) as Record<string, unknown>)
          : undefined,
      })),
      workflow: {
        reviewerAssigned: review.reviewerAssigned ?? undefined,
        prSize: (review.prSize as PRReviewResult['workflow']['prSize']) ?? undefined,
        stale: review.stale ?? undefined,
        notes: workflowNotes,
      },
      errorMessage: review.errorMessage ?? undefined,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[PR Review] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
