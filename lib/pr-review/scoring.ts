import type { PRReviewFindingDraft, PRRiskLevel, PRMergeRecommendation } from './types'

interface ScoreResult {
  score: number
  overallRisk: PRRiskLevel
  mergeRecommendation: PRMergeRecommendation
  highRiskCount: number
}

const WEIGHTS: Record<string, Record<string, number>> = {
  exposure: { high: 5, medium: 3, low: 1 },
  security: { high: 5, medium: 3, low: 1 },
  maintainability: { high: 3, medium: 2, low: 0 },
  naming: { high: 1, medium: 1, low: 0 },
  tests: { high: 3, medium: 2, low: 0 },
  workflow: { high: 2, medium: 1, low: 0 },
  logic: { high: 3, medium: 2, low: 0 },
}

export function computeScore(
  findings: PRReviewFindingDraft[],
  checksStatus: string,
): ScoreResult {
  let score = 0
  let highRiskCount = 0

  for (const f of findings) {
    if (f.severity === 'high') highRiskCount++
    const catWeights = WEIGHTS[f.category] ?? WEIGHTS.logic
    const weight = f.scoreImpact ?? catWeights[f.severity] ?? 0
    score += weight
  }

  // Failing checks add to score
  if (checksStatus === 'fail') score += 2
  else if (checksStatus === 'warn') score += 1

  const overallRisk: PRRiskLevel = score >= 7 ? 'high' : score >= 3 ? 'medium' : 'low'

  let mergeRecommendation: PRMergeRecommendation
  const hasHighExposure = findings.some(
    f => f.severity === 'high' && (f.category === 'exposure' || f.category === 'security'),
  )

  if (hasHighExposure || checksStatus === 'fail' || score >= 12) {
    mergeRecommendation = 'block'
  } else if (score >= 3 || highRiskCount > 0) {
    mergeRecommendation = 'review-carefully'
  } else {
    mergeRecommendation = 'pass'
  }

  return { score, overallRisk, mergeRecommendation, highRiskCount }
}
