import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { PRReviewResult } from '@/lib/pr-review/types'

// Explicit severity priority for sorting findings (high first)
const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const review = await prisma.pRReview.findUnique({
      where: { id },
      include: {
        findings: {
          // Fetch without DB-level ordering; we sort in memory below with explicit priority.
          // DB-level `severity asc` sorts alphabetically (high, low, medium) which is wrong.
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Sort findings: high → medium → low, then by createdAt within each group
    const sortedFindings = [...review.findings].sort((a, b) => {
      const pa = SEVERITY_ORDER[a.severity] ?? 3
      const pb = SEVERITY_ORDER[b.severity] ?? 3
      return pa - pb
    })

    // rawPayloadJson stores derived summary data (focusFiles + workflowNotes), not the raw diff.
    // The field name is a legacy artefact from the initial schema; a rename is deferred to avoid migration churn.
    let focusFiles: PRReviewResult['focusFiles'] = []
    let workflowNotes: string[] = []
    if (review.rawPayloadJson) {
      try {
        const stored = JSON.parse(review.rawPayloadJson) as {
          focusFiles?: PRReviewResult['focusFiles']
          workflowNotes?: string[]
        }
        focusFiles = stored.focusFiles ?? []
        workflowNotes = stored.workflowNotes ?? []
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
      findings: sortedFindings.map(f => ({
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
