'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PRReviewResult } from '@/lib/pr-review/types'

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border border-red-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low: 'bg-blue-100 text-blue-700 border border-blue-200',
}

const RISK_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

const RECOMMENDATION_STYLES: Record<string, { bg: string; label: string }> = {
  block: { bg: 'bg-red-600 text-white', label: 'Block Merge' },
  'review-carefully': { bg: 'bg-amber-500 text-white', label: 'Review Carefully' },
  pass: { bg: 'bg-green-600 text-white', label: 'Pass' },
}

const CATEGORY_LABELS: Record<string, string> = {
  logic: 'Logic',
  maintainability: 'Maintainability',
  naming: 'Naming',
  tests: 'Tests',
  security: 'Security',
  exposure: 'Exposure',
  workflow: 'Workflow',
}

const CHECKS_STYLES: Record<string, string> = {
  pass: 'text-green-700',
  warn: 'text-amber-600',
  fail: 'text-red-700',
  unknown: 'text-gray-500',
}

const CHECKS_LABELS: Record<string, string> = {
  pass: 'Checks passing',
  warn: 'Checks warning',
  fail: 'Checks failing',
  unknown: 'Checks unknown',
}

// ---------------------------------------------------------------------------
// Recent reviews list type
// ---------------------------------------------------------------------------

interface RecentReview {
  id: string
  prUrl: string
  repoOwner: string
  repoName: string
  prNumber: number
  status: string
  title: string | null
  author: string | null
  overallRisk: string | null
  mergeRecommendation: string | null
  highRiskCount: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Finding card
// ---------------------------------------------------------------------------

function FindingCard({ finding }: { finding: PRReviewResult['findings'][number] }) {
  const [expanded, setExpanded] = useState(false)
  const sev = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low
  const cat = CATEGORY_LABELS[finding.category] || finding.category

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${sev}`}>
                {finding.severity.toUpperCase()}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                {cat}
              </span>
              <code className="text-xs text-gray-400 font-mono">{finding.ruleId}</code>
            </div>
            <p className="text-sm font-semibold text-gray-900">{finding.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{finding.summary}</p>
          </div>
          <span className="shrink-0 text-gray-400 mt-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{finding.summary}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why Flagged</p>
            <p className="text-sm text-gray-700 leading-relaxed">{finding.whyFlagged}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggestion</p>
            <p className="text-sm text-gray-700 leading-relaxed">{finding.suggestion}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
            <div className="bg-white border border-gray-200 rounded p-2 space-y-1">
              <div className="flex items-center gap-2">
                <code className="text-xs text-blue-700 font-mono">{finding.evidence.filePath || '(cross-file)'}</code>
                {finding.evidence.startLine && (
                  <span className="text-xs text-gray-400">
                    line {finding.evidence.startLine}
                    {finding.evidence.endLine && finding.evidence.endLine !== finding.evidence.startLine
                      ? `–${finding.evidence.endLine}`
                      : ''}
                  </span>
                )}
              </div>
              {finding.evidence.snippet && (
                <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono bg-gray-50 rounded p-2 mt-1">
                  {finding.evidence.snippet}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anatomy bar
// ---------------------------------------------------------------------------

function AnatomyBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${Math.max(pct, 0)}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function ReviewDashboard({ result }: { result: PRReviewResult }) {
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const recStyle = RECOMMENDATION_STYLES[result.summary.mergeRecommendation] ?? RECOMMENDATION_STYLES.pass
  const riskStyle = RISK_STYLES[result.summary.overallRisk] ?? RISK_STYLES.low

  const filteredFindings = result.findings.filter(f => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
    return true
  })

  const highFindings = result.findings.filter(f => f.severity === 'high')
  const mediumFindings = result.findings.filter(f => f.severity === 'medium')
  const lowFindings = result.findings.filter(f => f.severity === 'low')

  const categories = Array.from(new Set(result.findings.map(f => f.category)))

  return (
    <div className="space-y-6">
      {/* PR Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500 font-mono">{result.pr.repo} #{result.pr.number}</span>
              <span className={`text-xs font-medium ${CHECKS_STYLES[result.pr.checksStatus]}`}>
                · {CHECKS_LABELS[result.pr.checksStatus]}
              </span>
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              {result.pr.title || 'Pull Request'}
            </h2>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>by <strong className="text-gray-700">{result.pr.author || '—'}</strong></span>
              <span><strong className="text-gray-700">{result.pr.headRef}</strong> → <strong className="text-gray-700">{result.pr.baseRef}</strong></span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${recStyle.bg}`}>
              {recStyle.label}
            </span>
            <a
              href={result.pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View on GitHub →
            </a>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Overall Risk</p>
          <span className={`text-sm font-semibold px-2 py-0.5 rounded ${riskStyle}`}>
            {result.summary.overallRisk.toUpperCase()}
          </span>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">High Risk Findings</p>
          <p className="text-2xl font-bold text-red-600">{result.summary.highRiskCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Exposure Risks</p>
          <p className="text-2xl font-bold text-amber-600">{result.summary.exposureRiskCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Test Gaps</p>
          <p className="text-2xl font-bold text-blue-600">{result.summary.testGapCount}</p>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-6 items-start">
        {/* Left column — 65% */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Focus files */}
          {result.focusFiles.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Start Here — Review Focus</h3>
              <div className="space-y-2">
                {result.focusFiles.map((f, i) => (
                  <div key={f.path} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-400 font-mono mt-0.5">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className="text-xs text-blue-700 font-mono truncate">{f.path}</code>
                        <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[f.severity] || ''}`}>
                          {f.severity}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{f.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Findings ({filteredFindings.length})
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={severityFilter}
                  onChange={e => setSeverityFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All severities</option>
                  <option value="high">High ({highFindings.length})</option>
                  <option value="medium">Medium ({mediumFindings.length})</option>
                  <option value="low">Low ({lowFindings.length})</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All categories</option>
                  {categories.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                {result.findings.length === 0
                  ? 'No findings — this PR looks clean.'
                  : 'No findings match the current filters.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFindings.map(f => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — 35% */}
        <div className="w-72 shrink-0 space-y-4">
          {/* PR Anatomy */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">PR Anatomy</h3>
            <div className="space-y-2.5">
              <AnatomyBar label="Logic" pct={result.summary.anatomy.logic} color="bg-blue-500" />
              <AnatomyBar label="Tests" pct={result.summary.anatomy.tests} color="bg-green-500" />
              <AnatomyBar label="Config" pct={result.summary.anatomy.config} color="bg-amber-400" />
              <AnatomyBar label="Noise" pct={result.summary.anatomy.noise} color="bg-gray-300" />
            </div>
          </div>

          {/* Code Health */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Code Health</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Maintainability</span>
                <span className={`font-medium ${
                  result.summary.maintainabilityStatus === 'improved' ? 'text-green-700' :
                  result.summary.maintainabilityStatus === 'degraded' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {result.summary.maintainabilityStatus === 'improved' ? '↑ Improved' :
                   result.summary.maintainabilityStatus === 'degraded' ? '↓ Degraded' : '→ Neutral'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total findings</span>
                <span className="font-medium text-gray-700">{result.findings.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">High severity</span>
                <span className={`font-medium ${result.summary.highRiskCount > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {result.summary.highRiskCount}
                </span>
              </div>
            </div>
          </div>

          {/* Exposure Risks */}
          {result.summary.exposureRiskCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-800 mb-2">Exposure Risks</h3>
              <p className="text-xs text-red-700 leading-relaxed">
                {result.summary.exposureRiskCount} exposure-related finding(s) detected.
                These may include removed auth guards, hardcoded secrets, or sensitive data in logs.
                Review these before merging.
              </p>
              <div className="mt-2 space-y-1">
                {result.findings
                  .filter(f => f.category === 'exposure' || f.category === 'security')
                  .slice(0, 3)
                  .map(f => (
                    <p key={f.id} className="text-xs text-red-700 font-medium">· {f.title}</p>
                  ))}
              </div>
            </div>
          )}

          {/* Workflow Health */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Workflow Health</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Reviewer assigned</span>
                <span className={`font-medium ${result.workflow.reviewerAssigned ? 'text-green-700' : 'text-amber-600'}`}>
                  {result.workflow.reviewerAssigned === undefined ? '—' : result.workflow.reviewerAssigned ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">PR size</span>
                <span className={`font-medium ${result.workflow.prSize === 'large' ? 'text-amber-600' : 'text-gray-700'}`}>
                  {result.workflow.prSize ?? '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Stale</span>
                <span className={`font-medium ${result.workflow.stale ? 'text-amber-600' : 'text-gray-700'}`}>
                  {result.workflow.stale === undefined ? '—' : result.workflow.stale ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">CI checks</span>
                <span className={`font-medium ${CHECKS_STYLES[result.pr.checksStatus]}`}>
                  {result.pr.checksStatus}
                </span>
              </div>
            </div>
            {result.workflow.notes.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <ul className="space-y-1">
                  {result.workflow.notes.map((note, i) => (
                    <li key={i} className="text-xs text-gray-600">· {note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Running state
// ---------------------------------------------------------------------------

function RunningState({ reviewId }: { reviewId: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="inline-flex items-center gap-2 text-blue-600 mb-3">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Analysis in progress…</span>
      </div>
      <p className="text-xs text-gray-500">Fetching diff, running checks. This usually takes under 15 seconds.</p>
      <p className="text-xs text-gray-400 mt-1 font-mono">{reviewId}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PRReviewPage() {
  const [prUrl, setPrUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null)
  const [result, setResult] = useState<PRReviewResult | null>(null)
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRecentReviews = useCallback(() => {
    fetch('/api/pr-reviews')
      .then(r => r.json())
      .then(d => setRecentReviews(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadRecentReviews()
  }, [loadRecentReviews])

  const pollResult = useCallback((reviewId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pr-reviews/${reviewId}`)
        if (!res.ok) return
        const data: PRReviewResult = await res.json()
        setResult(data)
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          loadRecentReviews()
        }
      } catch {
        // network hiccup, keep polling
      }
    }, 2000)
  }, [loadRecentReviews])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prUrl.trim()) { setError('Please enter a GitHub PR URL.'); return }

    setLoading(true)
    setError('')
    setResult(null)
    setCurrentReviewId(null)

    try {
      // Create review
      const createRes = await fetch('/api/pr-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl: prUrl.trim() }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) {
        setError(createData.error || 'Failed to create review')
        return
      }

      const reviewId: string = createData.id
      setCurrentReviewId(reviewId)
      setResult({ id: reviewId, status: 'pending' } as PRReviewResult)

      // Start analysis
      await fetch(`/api/pr-reviews/${reviewId}/start`, { method: 'POST' })
      setResult(prev => prev ? { ...prev, status: 'running' } : null)

      // Poll for results
      pollResult(reviewId)
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  const loadExistingReview = async (reviewId: string) => {
    setError('')
    setResult(null)
    setCurrentReviewId(reviewId)
    setPrUrl('')

    try {
      const res = await fetch(`/api/pr-reviews/${reviewId}`)
      const data: PRReviewResult = await res.json()
      setResult(data)
      if (data.status === 'running' || data.status === 'pending') {
        pollResult(reviewId)
      }
    } catch {
      setError('Failed to load review')
    }
  }

  const statusBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-600',
      running: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
    }
    return `inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`
  }

  return (
    <div className="space-y-8">
      {/* Input */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">PR Review</h2>
          <p className="text-xs text-gray-500 mb-4">
            Paste a GitHub Pull Request URL to run deterministic code review checks: maintainability,
            naming consistency, exposure risks, test gaps, and workflow health.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">GitHub PR URL</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={prUrl}
              onChange={e => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {loading ? 'Starting…' : 'Run Review'}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-400">
          For private repos, set <code className="bg-gray-100 px-1 rounded">GITHUB_TOKEN</code> in your environment.
          Public repos work without a token (rate limits may apply).
        </p>
      </form>

      {/* Current result */}
      {result && (
        <div>
          {(result.status === 'pending' || result.status === 'running') && currentReviewId && (
            <RunningState reviewId={currentReviewId} />
          )}

          {result.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-red-800 mb-2">Analysis Failed</h3>
              <p className="text-sm text-red-700">{result.errorMessage || 'An unknown error occurred.'}</p>
              <p className="text-xs text-red-500 mt-2">
                If the PR is private, ensure <code className="bg-red-100 px-1 rounded">GITHUB_TOKEN</code> is set.
                For local testing without GitHub access, set <code className="bg-red-100 px-1 rounded">PR_REVIEW_USE_MOCK=true</code>.
              </p>
            </div>
          )}

          {result.status === 'completed' && <ReviewDashboard result={result} />}
        </div>
      )}

      {/* Recent reviews */}
      {recentReviews.length > 0 && !result && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Recent Reviews</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentReviews.map(review => (
              <button
                key={review.id}
                onClick={() => loadExistingReview(review.id)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {review.title || `${review.repoOwner}/${review.repoName} #${review.prNumber}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {review.repoOwner}/{review.repoName} #{review.prNumber}
                    {review.author ? ` · by ${review.author}` : ''}
                    {' · '}{new Date(review.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {review.highRiskCount > 0 && (
                    <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">
                      {review.highRiskCount} high
                    </span>
                  )}
                  {review.overallRisk && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${RISK_STYLES[review.overallRisk] || ''}`}>
                      {review.overallRisk} risk
                    </span>
                  )}
                  <span className={statusBadgeClass(review.status)}>{review.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
