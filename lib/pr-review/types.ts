// ---------------------------------------------------------------------------
// PR Review types
// ---------------------------------------------------------------------------

export type PRReviewStatus = 'pending' | 'running' | 'completed' | 'failed'
export type PRRiskLevel = 'low' | 'medium' | 'high'
export type PRMergeRecommendation = 'pass' | 'review-carefully' | 'block'
export type PRSeverity = 'low' | 'medium' | 'high'
export type PRMaintainabilityStatus = 'improved' | 'neutral' | 'degraded'

export type PRFindingCategory =
  | 'logic'
  | 'maintainability'
  | 'naming'
  | 'tests'
  | 'security'
  | 'exposure'
  | 'workflow'

export interface NormalizedPRFile {
  path: string
  status?: string
  additions?: number
  deletions?: number
  patch?: string
}

export interface NormalizedPRPayload {
  prUrl: string
  repo: string
  number: number
  title: string
  author: string
  headRef: string
  baseRef: string
  checksStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  reviewerAssigned?: boolean
  updatedAt?: string
  files: NormalizedPRFile[]
}

export interface PRReviewFindingDraft {
  category: PRFindingCategory
  severity: PRSeverity
  ruleId: string
  title: string
  summary: string
  whyFlagged: string
  suggestion: string
  evidence: {
    filePath: string
    startLine?: number
    endLine?: number
    snippet?: string
  }
  scoreImpact?: number
  metadata?: Record<string, unknown>
}

export interface AnalyzerContext {
  reviewId: string
  pr: NormalizedPRPayload
}

export interface AnalyzerOutput {
  findings: PRReviewFindingDraft[]
  summaryPatches?: Partial<PRReviewResult['summary']>
  workflowPatches?: Partial<PRReviewResult['workflow']>
}

export interface PRReviewResult {
  id: string
  status: PRReviewStatus
  pr: {
    url: string
    repo: string
    number: number | null
    title: string
    author: string
    headRef: string
    baseRef: string
    checksStatus: 'pass' | 'warn' | 'fail' | 'unknown'
    reviewStatus?: string
  }
  summary: {
    overallRisk: PRRiskLevel
    mergeRecommendation: PRMergeRecommendation
    highRiskCount: number
    maintainabilityStatus: PRMaintainabilityStatus
    exposureRiskCount: number
    testGapCount: number
    anatomy: {
      logic: number
      tests: number
      config: number
      noise: number
    }
  }
  focusFiles: Array<{
    path: string
    reason: string
    severity: PRSeverity
  }>
  findings: Array<{
    id: string
    category: PRFindingCategory
    severity: PRSeverity
    ruleId: string
    title: string
    summary: string
    whyFlagged: string
    suggestion: string
    evidence: {
      filePath: string
      startLine?: number
      endLine?: number
      snippet?: string
    }
    metadata?: Record<string, unknown>
  }>
  workflow: {
    reviewerAssigned?: boolean
    prSize?: 'small' | 'medium' | 'large'
    stale?: boolean
    notes: string[]
  }
  errorMessage?: string
}
