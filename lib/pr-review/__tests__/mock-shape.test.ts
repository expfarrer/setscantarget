/**
 * Mock payload end-to-end shape tests.
 *
 * Runs all analyzers against MOCK_PR_PAYLOAD and verifies:
 * - each analyzer produces structurally valid output
 * - the mock payload triggers expected findings (exposure/naming/maintainability)
 * - scoring produces a block recommendation (mock is intentionally problematic)
 * - focus files are computed and non-empty
 *
 * These tests do not touch Prisma or the runner — they validate the pure
 * analysis pipeline in isolation, which is the correct unit of confidence here.
 */
import { describe, it, expect } from 'vitest'
import { MOCK_PR_PAYLOAD } from '../mock'
import { runAnatomyAnalyzer } from '../analyzers/anatomy'
import { runMaintainabilityAnalyzer } from '../analyzers/maintainability'
import { runNamingAnalyzer } from '../analyzers/naming'
import { runExposureAnalyzer } from '../analyzers/exposure'
import { runTestImpactAnalyzer } from '../analyzers/test-impact'
import { runWorkflowAnalyzer } from '../analyzers/workflow'
import { buildFocusFiles } from '../analyzers/focus-files'
import { computeScore } from '../scoring'
import type { AnalyzerContext, PRReviewFindingDraft } from '../types'

const ctx: AnalyzerContext = { reviewId: 'mock-test', pr: MOCK_PR_PAYLOAD }

const ALL_ANALYZERS = [
  runAnatomyAnalyzer,
  runMaintainabilityAnalyzer,
  runNamingAnalyzer,
  runExposureAnalyzer,
  runTestImpactAnalyzer,
  runWorkflowAnalyzer,
]

describe('mock payload — analyzer output shape', () => {
  it('every analyzer returns an object with a findings array', () => {
    for (const fn of ALL_ANALYZERS) {
      const result = fn(ctx)
      expect(result).toHaveProperty('findings')
      expect(Array.isArray(result.findings)).toBe(true)
    }
  })

  it('all findings across all analyzers have required fields', () => {
    for (const fn of ALL_ANALYZERS) {
      const { findings } = fn(ctx)
      for (const f of findings) {
        expect(f.category).toBeTruthy()
        expect(f.severity).toMatch(/^(low|medium|high)$/)
        expect(f.ruleId).toBeTruthy()
        expect(f.title).toBeTruthy()
        expect(f.summary).toBeTruthy()
        expect(f.whyFlagged).toBeTruthy()
        expect(f.suggestion).toBeTruthy()
        // filePath may be '' for meta-findings (e.g. workflow/no-reviewer, workflow/stale-pr)
        // that don't correspond to a specific file — just verify it's a string
        expect(typeof f.evidence.filePath).toBe('string')
      }
    }
  })

  it('exposure analyzer finds high-severity issues in mock payload', () => {
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some(f => f.severity === 'high')).toBe(true)
  })

  it('naming analyzer detects domain term drift in mock payload', () => {
    const { findings } = runNamingAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'naming/domain-term-drift')).toBe(true)
  })

  it('maintainability analyzer produces findings in mock payload', () => {
    const { findings } = runMaintainabilityAnalyzer(ctx)
    expect(findings.length).toBeGreaterThan(0)
  })
})

describe('mock payload — scoring', () => {
  it('scoring all mock findings → block recommendation (exposure findings dominate)', () => {
    const allFindings: PRReviewFindingDraft[] = ALL_ANALYZERS.flatMap(fn => fn(ctx).findings)
    const { mergeRecommendation, overallRisk } = computeScore(allFindings, MOCK_PR_PAYLOAD.checksStatus)
    expect(mergeRecommendation).toBe('block')
    expect(overallRisk).toBe('high')
  })

  it('mock payload has at least one finding across the full pipeline', () => {
    const allFindings: PRReviewFindingDraft[] = ALL_ANALYZERS.flatMap(fn => fn(ctx).findings)
    expect(allFindings.length).toBeGreaterThan(0)
  })
})

describe('mock payload — focus files', () => {
  it('buildFocusFiles returns at least one file when exposure findings exist', () => {
    const findings: PRReviewFindingDraft[] = runExposureAnalyzer(ctx).findings
    const focusFiles = buildFocusFiles(findings)
    expect(focusFiles.length).toBeGreaterThan(0)
  })

  it('focus files have path, reason, and severity fields', () => {
    const findings: PRReviewFindingDraft[] = ALL_ANALYZERS.flatMap(fn => fn(ctx).findings)
    const focusFiles = buildFocusFiles(findings)
    for (const f of focusFiles) {
      expect(f.path).toBeTruthy()
      expect(f.reason).toBeTruthy()
      expect(f.severity).toMatch(/^(low|medium|high)$/)
    }
  })
})
