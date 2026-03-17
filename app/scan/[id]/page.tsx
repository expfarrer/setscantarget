'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface Scan {
  id: string
  targetUrl: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  pagesScanned: number
  requestsCaptured: number
  findingsCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  errorMessage: string | null
  logs: Array<{ id: string; level: string; message: string; createdAt: string }>
  pages: Array<{ id: string; url: string; depth: number; statusCode: number | null; title: string | null }>
  findings: Finding[]
  requests: Array<{ id: string; url: string; method: string; resourceType: string | null; statusCode: number | null }>
}

interface Finding {
  id: string
  severity: string
  category: string
  title: string
  description: string
  url: string
  assetUrl: string | null
  evidence: string
  confidence: string | null
  createdAt: string
}

const SEVERITY_ORDER = ['high', 'medium', 'low', 'info']

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
}

const CATEGORY_LABELS: Record<string, string> = {
  secret_exposure: 'Secret',
  token_exposure: 'Token',
  hardcoded_password: 'Password',
  insecure_cookie: 'Cookie',
  missing_security_header: 'Header',
  sourcemap_exposure: 'Source Map',
  verbose_error: 'Error Leak',
  framework_leakage: 'Framework',
  suspicious_endpoint_reference: 'Endpoint',
  possible_public_data_exposure: 'Data Exposure',
  storage_risk: 'Storage',
  cors_risk: 'CORS',
  info: 'Info',
}

// Findings originating from passive endpoint checks are visually distinguished
function isPassiveFinding(finding: Finding): boolean {
  return finding.evidence.startsWith('[Passive endpoint check]')
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>()
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState('')
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'findings' | 'pages' | 'requests' | 'logs'>('findings')

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${id}`)
      if (!res.ok) { setError('Scan not found'); return }
      setScan(await res.json())
    } catch {
      setError('Failed to load scan')
    }
  }, [id])

  useEffect(() => { fetchScan() }, [fetchScan])

  useEffect(() => {
    if (!scan || (scan.status !== 'running' && scan.status !== 'pending')) return
    const interval = setInterval(fetchScan, 3000)
    return () => clearInterval(interval)
  }, [scan, fetchScan])

  if (error) {
    return <div className="text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">{error}</div>
  }
  if (!scan) {
    return <div className="text-gray-500 text-sm">Loading scan…</div>
  }

  const isLive = scan.status === 'running' || scan.status === 'pending'

  const filteredFindings = scan.findings
    .filter(f =>
      (severityFilter === 'all' || f.severity === severityFilter) &&
      (categoryFilter === 'all' || f.category === categoryFilter)
    )
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))

  const categories = [...new Set(scan.findings.map(f => f.category))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700 block mb-1">← New Scan</a>
          <h2 className="text-xl font-semibold text-gray-900 break-all">{scan.targetUrl}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[scan.status] || 'bg-gray-100 text-gray-600'}`}>
              {scan.status}
            </span>
            {scan.startedAt && (
              <span className="text-xs text-gray-500">
                Started {new Date(scan.startedAt).toLocaleString()}
              </span>
            )}
            {isLive && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse inline-block" />
                Live
              </span>
            )}
          </div>
        </div>
        {scan.status === 'completed' && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/scans/${id}/export?format=json`}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
            >
              Export JSON
            </a>
            <a
              href={`/api/scans/${id}/export?format=html`}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
            >
              Export HTML
            </a>
            <a
              href={`/api/scans/${id}/export/ingestion-json`}
              className="px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 rounded hover:bg-blue-50"
              title="Structured JSON report for ingestion by a coding agent or other tool"
            >
              Download Ingestion JSON
            </a>
          </div>
        )}
      </div>

      {scan.errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {scan.errorMessage}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'High', count: scan.highCount, style: 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Medium', count: scan.mediumCount, style: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Low', count: scan.lowCount, style: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Info', count: scan.infoCount, style: 'text-gray-700 bg-gray-50 border-gray-200' },
          { label: 'Pages', count: scan.pagesScanned, style: 'text-gray-700 bg-white border-gray-200' },
        ].map(c => (
          <div key={c.label} className={`border rounded-lg px-4 py-3 ${c.style}`}>
            <div className="text-2xl font-bold">{c.count}</div>
            <div className="text-xs font-medium mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Live log */}
      {isLive && scan.logs.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-2 font-mono">Live scan log</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {scan.logs.slice(-20).map(l => (
              <div key={l.id} className="text-xs font-mono">
                <span className={
                  l.level === 'error' ? 'text-red-400' :
                  l.level === 'warn' ? 'text-yellow-400' : 'text-green-400'
                }>[{l.level}]</span>
                <span className="text-gray-300 ml-2">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {(['findings', 'pages', 'requests', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'findings' ? `Findings (${scan.findings.length})` :
               tab === 'pages' ? `Pages (${scan.pages.length})` :
               tab === 'requests' ? `Requests (${scan.requests.length})` :
               `Logs (${scan.logs.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Findings Tab */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">Severity:</label>
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {SEVERITY_ORDER.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">Category:</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {categories.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-gray-500 self-center">
              {filteredFindings.length} finding{filteredFindings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              {isLive ? 'Scan in progress…' : 'No findings match filters.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFindings.map(finding => (
                <div key={finding.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFinding(expandedFinding === finding.id ? null : finding.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 text-xs font-semibold rounded border uppercase ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info}`}>
                      {finding.severity}
                    </span>
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                      {CATEGORY_LABELS[finding.category] || finding.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{finding.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{finding.url}</p>
                    </div>
                    {isPassiveFinding(finding) && (
                      <span className="shrink-0 text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 self-center">passive</span>
                    )}
                    {finding.confidence && (
                      <span className="shrink-0 text-xs text-gray-400 self-center">conf: {finding.confidence}</span>
                    )}
                    <span className="shrink-0 text-gray-400 self-center">
                      {expandedFinding === finding.id ? '▲' : '▼'}
                    </span>
                  </button>

                  {expandedFinding === finding.id && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50">
                      <p className="text-sm text-gray-700">{finding.description}</p>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Found at:</p>
                        <p className="text-xs font-mono text-gray-700 break-all">{finding.url}</p>
                        {finding.assetUrl && finding.assetUrl !== finding.url && (
                          <p className="text-xs font-mono text-gray-500 break-all mt-0.5">Asset: {finding.assetUrl}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Evidence:</p>
                        <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                          {finding.evidence}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pages Tab */}
      {activeTab === 'pages' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">URL</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-16">Status</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-16">Depth</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scan.pages.map(page => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-blue-700 break-all max-w-xs">
                    <a href={page.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {page.url}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs">{page.statusCode ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{page.depth}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-xs">{page.title || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scan.pages.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              {isLive ? 'Crawling…' : 'No pages recorded.'}
            </div>
          )}
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">URL</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-16">Method</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-20">Type</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-16">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scan.requests.slice(0, 200).map(req => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700 break-all max-w-sm truncate">
                    {req.url}
                  </td>
                  <td className="px-4 py-2 text-xs font-medium">{req.method}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{req.resourceType || '—'}</td>
                  <td className={`px-4 py-2 text-xs ${req.statusCode && req.statusCode >= 400 ? 'text-red-600' : 'text-gray-700'}`}>
                    {req.statusCode ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scan.requests.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              {isLive ? 'Capturing…' : 'No requests recorded.'}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="space-y-0.5 max-h-96 overflow-y-auto">
            {scan.logs.map(l => (
              <div key={l.id} className="text-xs font-mono flex gap-2">
                <span className="text-gray-500 shrink-0">
                  {new Date(l.createdAt).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 ${
                  l.level === 'error' ? 'text-red-400' :
                  l.level === 'warn' ? 'text-yellow-400' : 'text-green-400'
                }`}>[{l.level}]</span>
                <span className="text-gray-300">{l.message}</span>
              </div>
            ))}
            {scan.logs.length === 0 && (
              <span className="text-gray-500 text-xs">No logs yet.</span>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        Absence of findings does not equal security approval. This is a surface-level client-side review, not a penetration test.
      </div>
    </div>
  )
}
