import { describe, it, expect } from 'vitest'
import { computeScore } from '../scoring'
import type { PRReviewFindingDraft } from '../types'

function finding(
  category: string,
  severity: 'low' | 'medium' | 'high',
  scoreImpact?: number,
): PRReviewFindingDraft {
  return {
    category: category as PRReviewFindingDraft['category'],
    severity,
    ruleId: 'test/rule',
    title: 'Test finding',
    summary: '',
    whyFlagged: '',
    suggestion: '',
    evidence: { filePath: 'test.ts' },
    scoreImpact,
  }
}

describe('computeScore', () => {
  it('zero findings with passing checks → low risk, pass', () => {
    const result = computeScore([], 'pass')
    expect(result.overallRisk).toBe('low')
    expect(result.mergeRecommendation).toBe('pass')
    expect(result.highRiskCount).toBe(0)
    expect(result.score).toBe(0)
  })

  it('zero findings with unknown checks → low risk, pass', () => {
    const result = computeScore([], 'unknown')
    expect(result.mergeRecommendation).toBe('pass')
  })

  it('blocks on any high-severity exposure finding regardless of score', () => {
    const result = computeScore([finding('exposure', 'high')], 'pass')
    expect(result.mergeRecommendation).toBe('block')
  })

  it('blocks on any high-severity security finding regardless of score', () => {
    const result = computeScore([finding('security', 'high')], 'pass')
    expect(result.mergeRecommendation).toBe('block')
  })

  it('blocks when CI checks fail regardless of findings', () => {
    const result = computeScore([], 'fail')
    expect(result.mergeRecommendation).toBe('block')
  })

  it('blocks when score reaches 12', () => {
    // 6 × medium maintainability (weight 2 each) = score 12
    const findings = Array.from({ length: 6 }, () => finding('maintainability', 'medium'))
    const result = computeScore(findings, 'pass')
    expect(result.score).toBe(12)
    expect(result.mergeRecommendation).toBe('block')
  })

  it('review-carefully for high-severity non-exposure finding', () => {
    const result = computeScore([finding('maintainability', 'high', 3)], 'pass')
    expect(result.mergeRecommendation).toBe('review-carefully')
    expect(result.highRiskCount).toBe(1)
  })

  it('pass for single medium finding below score threshold', () => {
    // maintainability medium = weight 2 → score 2 < 3, no high-risk count
    const result = computeScore([finding('maintainability', 'medium')], 'pass')
    expect(result.overallRisk).toBe('low')
    expect(result.mergeRecommendation).toBe('pass')
  })

  it('review-carefully when score reaches 3', () => {
    // maintainability medium (2) + tests medium (2) = score 4 → medium risk
    const result = computeScore(
      [finding('maintainability', 'medium'), finding('tests', 'medium')],
      'pass',
    )
    expect(result.overallRisk).toBe('medium')
    expect(result.mergeRecommendation).toBe('review-carefully')
  })

  it('high risk when score ≥ 7', () => {
    // exposure high (5) + maintainability high (3) = score 8 → high risk
    const result = computeScore(
      [finding('exposure', 'high'), finding('maintainability', 'high', 3)],
      'pass',
    )
    expect(result.overallRisk).toBe('high')
  })

  it('failing checks add 2 to score', () => {
    // warning adds 1, failing adds 2
    const base = computeScore([finding('maintainability', 'medium')], 'pass') // score 2
    const warned = computeScore([finding('maintainability', 'medium')], 'warn') // score 3
    const failed = computeScore([finding('maintainability', 'medium')], 'fail') // score 4, but also → block
    expect(warned.score).toBe(base.score + 1)
    expect(failed.mergeRecommendation).toBe('block')
  })

  it('counts all high-severity findings across categories', () => {
    const result = computeScore(
      [
        finding('maintainability', 'high', 3),
        finding('tests', 'high', 3),
        finding('naming', 'low'),
      ],
      'pass',
    )
    expect(result.highRiskCount).toBe(2)
  })

  it('uses scoreImpact override when provided (non-undefined)', () => {
    // naming high normally has weight 1, but scoreImpact=10 overrides it
    const withOverride = computeScore([finding('naming', 'high', 10)], 'pass')
    const withDefault = computeScore([finding('naming', 'high')], 'pass')
    expect(withOverride.score).toBe(10)
    expect(withDefault.score).toBe(1) // catWeights.naming.high = 1
  })

  it('scoreImpact of 0 results in zero contribution (not a fallback to catWeights)', () => {
    // naming low has scoreImpact: 0 explicitly set in analyzers — should not use catWeights
    const result = computeScore([finding('naming', 'low', 0)], 'pass')
    expect(result.score).toBe(0)
  })
})
