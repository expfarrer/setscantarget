'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PRReviewResult } from '@/lib/pr-review/types'

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// Style maps — shared across components
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border border-red-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low:    'bg-blue-100 text-blue-700 border border-blue-200',
}

const RISK_STYLES: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-green-100 text-green-700',
}

// Labels: Pass / Review / Block per UI vocabulary
const RECOMMENDATION_STYLES: Record<string, { bg: string; label: string }> = {
  'block':            { bg: 'bg-red-600 text-white',   label: 'Block' },
  'review-carefully': { bg: 'bg-amber-500 text-white', label: 'Review' },
  'pass':             { bg: 'bg-green-600 text-white', label: 'Pass' },
}

const CATEGORY_LABELS: Record<string, string> = {
  logic:           'Logic',
  maintainability: 'Maintainability',
  naming:          'Naming',
  tests:           'Tests',
  security:        'Security',
  exposure:        'Exposure',
  workflow:        'Workflow',
}

const CHECKS_STYLES: Record<string, string> = {
  pass:    'text-green-700',
  warn:    'text-amber-600',
  fail:    'text-red-700',
  unknown: 'text-gray-500',
}

// Full labels for inline header use
const CHECKS_LABELS: Record<string, string> = {
  pass:    'Checks passing',
  warn:    'Checks warning',
  fail:    'Checks failing',
  unknown: 'Checks unknown',
}

// Short labels for sidebar rows
const CHECKS_SHORT: Record<string, string> = {
  pass:    'Passing',
  warn:    'Warning',
  fail:    'Failing',
  unknown: 'Unknown',
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  running:   'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  running:   'Running',
  completed: 'Completed',
  failed:    'Failed',
}

// ---------------------------------------------------------------------------
// Types
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
// EvidenceViewer
// ---------------------------------------------------------------------------

function EvidenceViewer({
  evidence,
}: {
  evidence: PRReviewResult['findings'][number]['evidence']
}) {
  return (
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-xs text-blue-700 font-mono break-all">
          {evidence.filePath || '(cross-file)'}
        </code>
        {evidence.startLine != null && (
          <span className="text-xs text-gray-400 shrink-0">
            line {evidence.startLine}
            {evidence.endLine != null && evidence.endLine !== evidence.startLine
              ? `–${evidence.endLine}`
              : ''}
          </span>
        )}
        {evidence.isRedacted && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Sensitive data hidden
          </span>
        )}
      </div>
      {evidence.snippet ? (
        <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono bg-gray-50 rounded p-2">
          {evidence.snippet}
        </pre>
      ) : (
        <p className="text-xs text-gray-400 italic">No snippet available.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FindingCard
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
                {capFirst(finding.severity)}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                {cat}
              </span>
              <code className="text-xs text-gray-400 font-mono">{finding.ruleId}</code>
            </div>
            <p className="text-sm font-semibold text-gray-900">{finding.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
              {finding.summary}
            </p>
          </div>
          <span className="shrink-0 text-gray-400 mt-1 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why Flagged</p>
            <p className="text-sm text-gray-700 leading-relaxed">{finding.whyFlagged}</p>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggestion</p>
            <p className="text-sm text-gray-700 leading-relaxed">{finding.suggestion}</p>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
            <EvidenceViewer evidence={finding.evidence} />
          </section>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnatomyBar
// ---------------------------------------------------------------------------

function AnatomyBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{clamped}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FocusList
// ---------------------------------------------------------------------------

function FocusList({ files }: { files: PRReviewResult['focusFiles'] }) {
  if (files.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Start Here</h3>
      <div className="space-y-0">
        {files.map((f, i) => (
          <div
            key={f.path}
            className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0"
          >
            <span className="text-xs text-gray-400 font-mono mt-0.5 shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <code className="text-xs text-blue-700 font-mono break-all">{f.path}</code>
                <span
                  className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[f.severity] || ''}`}
                >
                  {capFirst(f.severity)}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{f.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FindingsList
// ---------------------------------------------------------------------------

function FindingsList({ findings }: { findings: PRReviewResult['findings'] }) {
  const [severityFilter, setSeverityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const highCount   = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount    = findings.filter(f => f.severity === 'low').length
  const categories  = Array.from(new Set(findings.map(f => f.category)))

  const filtered = findings.filter(f => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
    return true
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Findings <span className="text-gray-400 font-normal">({filtered.length})</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All severities</option>
            <option value="high">High ({highCount})</option>
            <option value="medium">Medium ({mediumCount})</option>
            <option value="low">Low ({lowCount})</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {findings.length === 0
            ? 'No findings — this PR looks clean.'
            : 'No findings match the current filters.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SummaryCards
// ---------------------------------------------------------------------------

function SummaryCards({ summary }: { summary: PRReviewResult['summary'] }) {
  const riskStyle = RISK_STYLES[summary.overallRisk] ?? RISK_STYLES.low
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-2">Overall Risk</p>
        <span className={`text-sm font-semibold px-2 py-0.5 rounded ${riskStyle}`}>
          {capFirst(summary.overallRisk)}
        </span>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-1">High Severity</p>
        <p className={`text-2xl font-bold ${summary.highRiskCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
          {summary.highRiskCount}
        </p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-1">Exposure Risks</p>
        <p className={`text-2xl font-bold ${summary.exposureRiskCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
          {summary.exposureRiskCount}
        </p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-1">Test Gaps</p>
        <p className={`text-2xl font-bold ${summary.testGapCount > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
          {summary.testGapCount}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PRHeaderCard
// ---------------------------------------------------------------------------

function PRHeaderCard({ result }: { result: PRReviewResult }) {
  const recStyle = RECOMMENDATION_STYLES[result.summary.mergeRecommendation] ?? RECOMMENDATION_STYLES.pass
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">
              {result.pr.repo} #{result.pr.number}
            </span>
            <span className={`text-xs font-medium ${CHECKS_STYLES[result.pr.checksStatus]}`}>
              · {CHECKS_LABELS[result.pr.checksStatus]}
            </span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-2">
            {result.pr.title || 'Pull Request'}
          </h2>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>
              by <strong className="text-gray-700">{result.pr.author || '—'}</strong>
            </span>
            <span>
              <strong className="text-gray-700">{result.pr.headRef}</strong>
              {' → '}
              <strong className="text-gray-700">{result.pr.baseRef}</strong>
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${recStyle.bg}`}>
            {recStyle.label}
          </span>
          {result.pr.url && (
            <a
              href={result.pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View on GitHub →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar panels
// ---------------------------------------------------------------------------

function SidebarPanels({
  result,
}: {
  result: PRReviewResult
}) {
  const { summary, workflow, findings, pr } = result
  const exposureFindings = findings.filter(
    f => f.category === 'exposure' || f.category === 'security',
  )

  return (
    <div className="space-y-4">
      {/* PR Anatomy */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">PR Anatomy</h3>
        <div className="space-y-2.5">
          <AnatomyBar label="Logic"  pct={summary.anatomy.logic}  color="bg-blue-500" />
          <AnatomyBar label="Tests"  pct={summary.anatomy.tests}  color="bg-green-500" />
          <AnatomyBar label="Config" pct={summary.anatomy.config} color="bg-amber-400" />
          <AnatomyBar label="Noise"  pct={summary.anatomy.noise}  color="bg-gray-300" />
        </div>
      </div>

      {/* Code Health */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Code Health</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Maintainability</span>
            <span className={`font-medium ${
              summary.maintainabilityStatus === 'improved' ? 'text-green-700' :
              summary.maintainabilityStatus === 'degraded' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {summary.maintainabilityStatus === 'improved' ? '↑ Improved' :
               summary.maintainabilityStatus === 'degraded' ? '↓ Degraded' : '→ Neutral'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Total findings</span>
            <span className="font-medium text-gray-700">{findings.length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">High severity</span>
            <span className={`font-medium ${summary.highRiskCount > 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {summary.highRiskCount}
            </span>
          </div>
        </div>
      </div>

      {/* Exposure Risks */}
      {exposureFindings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-800 mb-2">Exposure Risks</h3>
          <p className="text-xs text-red-700 leading-relaxed mb-2">
            {summary.exposureRiskCount} exposure-related finding{summary.exposureRiskCount !== 1 ? 's' : ''} detected. Review before merging.
          </p>
          <div className="space-y-1">
            {exposureFindings.slice(0, 3).map(f => (
              <p key={f.id} className="text-xs text-red-700 font-medium">· {f.title}</p>
            ))}
            {exposureFindings.length > 3 && (
              <p className="text-xs text-red-500">+{exposureFindings.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {/* Workflow Health */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Workflow</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Reviewer</span>
            <span className={`font-medium ${
              workflow.reviewerAssigned === undefined ? 'text-gray-400' :
              workflow.reviewerAssigned ? 'text-green-700' : 'text-amber-600'
            }`}>
              {workflow.reviewerAssigned === undefined ? '—' :
               workflow.reviewerAssigned ? 'Assigned' : 'Not assigned'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">PR size</span>
            <span className={`font-medium ${
              workflow.prSize === 'large' ? 'text-amber-600' :
              workflow.prSize == null ? 'text-gray-400' : 'text-gray-700'
            }`}>
              {workflow.prSize ? capFirst(workflow.prSize) : '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Stale</span>
            <span className={`font-medium ${
              workflow.stale === undefined ? 'text-gray-400' :
              workflow.stale ? 'text-amber-600' : 'text-gray-700'
            }`}>
              {workflow.stale === undefined ? '—' : workflow.stale ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">CI checks</span>
            <span className={`font-medium ${CHECKS_STYLES[pr.checksStatus]}`}>
              {CHECKS_SHORT[pr.checksStatus] ?? pr.checksStatus}
            </span>
          </div>
        </div>
        {workflow.notes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <ul className="space-y-1">
              {workflow.notes.map((note, i) => (
                <li key={i} className="text-xs text-gray-600">· {note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewDashboard
// ---------------------------------------------------------------------------

function ReviewDashboard({ result }: { result: PRReviewResult }) {
  return (
    <div className="space-y-6">
      <PRHeaderCard result={result} />
      <SummaryCards summary={result.summary} />

      <div className="flex gap-6 items-start">
        {/* Left column — ~65% */}
        <div className="flex-1 min-w-0 space-y-4">
          <FocusList files={result.focusFiles} />
          <FindingsList findings={result.findings} />
        </div>

        {/* Right column — fixed ~280px */}
        <div className="w-72 shrink-0">
          <SidebarPanels result={result} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status / progress states
// ---------------------------------------------------------------------------

function RunningBanner() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="inline-flex items-center gap-2 text-blue-600 mb-3">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Analysis in progress…</span>
      </div>
      <p className="text-xs text-gray-500">
        Fetching diff and running checks. This usually completes in under 15 seconds.
      </p>
    </div>
  )
}

function FailedBanner({
  result,
  onRetry,
  retrying,
}: {
  result: PRReviewResult
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-red-800 mb-1">Analysis Failed</h3>
        <p className="text-sm text-red-700">
          {result.errorMessage || 'An unknown error occurred during analysis.'}
        </p>
      </div>
      <div className="text-xs text-red-600 space-y-1">
        <p>· If the PR is private, ensure <code className="bg-red-100 px-1 rounded">GITHUB_TOKEN</code> is set.</p>
        <p>· For local testing without GitHub, set <code className="bg-red-100 px-1 rounded">PR_REVIEW_USE_MOCK=true</code>.</p>
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
      >
        {retrying ? 'Retrying…' : 'Retry Analysis'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RecentReviews
// ---------------------------------------------------------------------------

function RecentReviews({
  reviews,
  onSelect,
  activeId,
}: {
  reviews: RecentReview[]
  onSelect: (id: string) => void
  activeId: string | null
}) {
  if (reviews.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Recent Reviews</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {reviews.map(review => {
          const isActive = review.id === activeId
          return (
            <button
              key={review.id}
              onClick={() => onSelect(review.id)}
              className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left ${
                isActive ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {review.title || `${review.repoOwner}/${review.repoName} #${review.prNumber}`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {review.repoOwner}/{review.repoName} #{review.prNumber}
                  {review.author ? ` · by ${review.author}` : ''}
                  {' · '}
                  {new Date(review.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {review.highRiskCount > 0 && (
                  <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">
                    {review.highRiskCount} High
                  </span>
                )}
                {review.overallRisk && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${RISK_STYLES[review.overallRisk] || ''}`}>
                    {capFirst(review.overallRisk)} Risk
                  </span>
                )}
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[review.status] || STATUS_BADGE.pending}`}>
                  {STATUS_LABELS[review.status] ?? capFirst(review.status)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PRReviewPage() {
  const [prUrl, setPrUrl]                     = useState('')
  const [submitting, setSubmitting]           = useState(false)
  const [retrying, setRetrying]               = useState(false)
  const [inputError, setInputError]           = useState('')
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null)
  const [result, setResult]                   = useState<PRReviewResult | null>(null)
  const [recentReviews, setRecentReviews]     = useState<RecentReview[]>([])
  const pollRef                               = useRef<ReturnType<typeof setInterval> | null>(null)

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const loadRecentReviews = useCallback(() => {
    fetch('/api/pr-reviews')
      .then(r => r.json())
      .then(d => setRecentReviews(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const startPolling = useCallback(
    (reviewId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/pr-reviews/${reviewId}`)
          if (!res.ok) return
          const data: PRReviewResult = await res.json()
          setResult(data)
          if (data.status === 'completed' || data.status === 'failed') {
            stopPolling()
            loadRecentReviews()
          }
        } catch {
          // transient network error — keep polling
        }
      }, 2000)
    },
    [stopPolling, loadRecentReviews],
  )

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  useEffect(() => {
    loadRecentReviews()
  }, [loadRecentReviews])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // ------------------------------------------------------------------
  // Submit new review
  // ------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = prUrl.trim()
    if (!trimmed) {
      setInputError('Please enter a GitHub PR URL.')
      return
    }

    setSubmitting(true)
    setInputError('')
    setResult(null)
    setCurrentReviewId(null)
    stopPolling()

    try {
      // 1. Create
      const createRes = await fetch('/api/pr-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl: trimmed }),
      })
      const createData = await createRes.json() as { id?: string; error?: string }
      if (!createRes.ok) {
        setInputError(createData.error || 'Failed to create review.')
        return
      }

      const reviewId = createData.id!
      setCurrentReviewId(reviewId)
      setResult({ id: reviewId, status: 'pending' } as PRReviewResult)

      // 2. Start
      const startRes = await fetch(`/api/pr-reviews/${reviewId}/start`, { method: 'POST' })
      if (!startRes.ok) {
        const startData = await startRes.json() as { error?: string }
        setInputError(startData.error || 'Failed to start analysis.')
        return
      }
      setResult(prev => prev ? { ...prev, status: 'running' } : null)

      // 3. Poll
      startPolling(reviewId)
    } catch {
      setInputError('Network error. Is the server running?')
    } finally {
      setSubmitting(false)
    }
  }

  // ------------------------------------------------------------------
  // Retry failed review
  // ------------------------------------------------------------------

  const handleRetry = useCallback(async () => {
    if (!currentReviewId) return
    setRetrying(true)
    setInputError('')
    try {
      const res = await fetch(`/api/pr-reviews/${currentReviewId}/start`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setInputError(data.error || 'Retry failed.')
        return
      }
      setResult(prev => prev ? { ...prev, status: 'running', errorMessage: undefined } : null)
      startPolling(currentReviewId)
    } catch {
      setInputError('Network error during retry.')
    } finally {
      setRetrying(false)
    }
  }, [currentReviewId, startPolling])

  // ------------------------------------------------------------------
  // Load existing review from recent list
  // ------------------------------------------------------------------

  const handleSelectRecent = useCallback(
    async (reviewId: string) => {
      stopPolling()
      setInputError('')
      setCurrentReviewId(reviewId)

      try {
        const res = await fetch(`/api/pr-reviews/${reviewId}`)
        if (!res.ok) {
          setInputError('Failed to load review.')
          return
        }
        const data: PRReviewResult = await res.json()
        setResult(data)
        setPrUrl(data.pr?.url ?? '')
        if (data.status === 'running' || data.status === 'pending') {
          startPolling(reviewId)
        }
      } catch {
        setInputError('Failed to load review.')
      }
    },
    [stopPolling, startPolling],
  )

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const isRunning = result?.status === 'pending' || result?.status === 'running'

  return (
    <div className="space-y-8">
      {/* Input form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">PR Review</h2>
          <p className="text-xs text-gray-500 mb-4">
            Analyze a GitHub pull request for maintainability issues, naming consistency, exposure
            risks, test coverage gaps, and workflow health. Results are deterministic and
            AI-enriched when configured.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            GitHub PR URL
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={prUrl}
              onChange={e => { setPrUrl(e.target.value); setInputError('') }}
              placeholder="https://github.com/owner/repo/pull/123"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              disabled={submitting || !!isRunning}
              aria-label="GitHub PR URL"
            />
            <button
              type="submit"
              disabled={submitting || !!isRunning}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {submitting ? 'Starting…' : 'Run Review'}
            </button>
          </div>
        </div>

        {inputError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {inputError}
          </div>
        )}

        <p className="text-xs text-gray-400">
          Set <code className="bg-gray-100 px-1 rounded">GITHUB_TOKEN</code> for private repos.
          Set <code className="bg-gray-100 px-1 rounded">PR_REVIEW_USE_MOCK=true</code> to run with sample data locally.
        </p>
      </form>

      {/* Active result area */}
      {result && (
        <div className="space-y-6">
          {isRunning && <RunningBanner />}
          {result.status === 'failed' && (
            <FailedBanner
              result={result}
              onRetry={handleRetry}
              retrying={retrying}
            />
          )}
          {result.status === 'completed' && (
            <ReviewDashboard result={result} />
          )}
        </div>
      )}

      {/* Recent reviews — always visible below the result area */}
      <RecentReviews
        reviews={recentReviews}
        onSelect={handleSelectRecent}
        activeId={currentReviewId}
      />
    </div>
  )
}
