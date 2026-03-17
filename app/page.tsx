'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { defaultScanOptions, ScanOptions } from '@/lib/types'
import { PASSIVE_CHECK_PATHS } from '@/lib/detectors/passive-endpoints'

const MODULE_GROUPS = [
  {
    label: 'Page Analysis',
    items: [
      { key: 'inspectHtml', label: 'Inspect HTML source' },
      { key: 'inspectDom', label: 'Inspect rendered DOM' },
      { key: 'inspectInlineScripts', label: 'Inspect inline scripts' },
      { key: 'inspectJsBundles', label: 'Inspect linked JavaScript bundles' },
      { key: 'inspectNetworkRequests', label: 'Inspect network requests' },
    ],
  },
  {
    label: 'Security Headers & Cookies',
    items: [
      { key: 'inspectHeaders', label: 'Inspect response headers' },
      { key: 'inspectCookies', label: 'Inspect cookies (auth/session analysis included)' },
    ],
  },
  {
    label: 'Storage',
    items: [
      { key: 'inspectLocalStorage', label: 'Inspect localStorage' },
      { key: 'inspectSessionStorage', label: 'Inspect sessionStorage' },
    ],
  },
  {
    label: 'Detection',
    items: [
      { key: 'detectSourceMaps', label: 'Detect exposed source maps' },
      { key: 'searchSecrets', label: 'Search for secrets, tokens, and hardcoded passwords' },
      { key: 'checkFrameworkLeakage', label: 'Check framework/version leakage' },
      { key: 'checkConsoleErrors', label: 'Check for verbose console errors' },
      { key: 'checkSuspiciousEndpoints', label: 'Check for admin/debug endpoint references in source' },
    ],
  },
  {
    label: 'Site Files',
    items: [
      { key: 'inspectRobotsTxt', label: 'Inspect robots.txt' },
      { key: 'inspectSitemapXml', label: 'Inspect sitemap.xml' },
    ],
  },
]

interface RecentScan {
  id: string
  targetUrl: string
  status: string
  startedAt: string | null
  findingsCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  pagesScanned: number
  createdAt: string
}

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<ScanOptions>({ ...defaultScanOptions })
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [showPassivePaths, setShowPassivePaths] = useState(false)

  useEffect(() => {
    fetch('/api/scans').then(r => r.json()).then(d => setRecentScans(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const toggle = (key: keyof ScanOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmed) { setError('Please confirm you have permission to test this site.'); return }
    if (!url.trim()) { setError('Please enter a target URL.'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url, options }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create scan'); return }

      await fetch(`/api/scans/${data.id}/start`, { method: 'POST' })
      router.push(`/scan/${data.id}`)
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
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
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>Authorized use only.</strong> This tool is intended for sites you own or have explicit written permission to test.
        It performs a public-facing client-side review and cannot detect server-only secrets unless publicly exposed.
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">New Security Scan</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Scan Modules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {MODULE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                <div className="space-y-1.5">
                  {group.items.map(item => (
                    <label key={item.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!options[item.key as keyof ScanOptions]}
                        onChange={() => toggle(item.key as keyof ScanOptions)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Passive Common Endpoint Checks — opt-in, clearly labelled */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="passiveEndpointCheck"
              checked={options.passiveEndpointCheck}
              onChange={() => toggle('passiveEndpointCheck')}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <label htmlFor="passiveEndpointCheck" className="text-sm font-medium text-gray-900 cursor-pointer">
                Passive Common Endpoint Checks
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Performs safe GET-only requests to a small fixed allowlist of common API/admin/debug paths on the same origin.
                Intended for authorized review of your own properties. 401, 403, and 404 responses are not flagged.
                Only 200 responses with sensitive-looking or admin-accessible content are surfaced.
              </p>
              <button
                type="button"
                onClick={() => setShowPassivePaths(p => !p)}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                {showPassivePaths ? 'Hide path list' : 'Show path list'}
              </button>
              {showPassivePaths && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">Paths checked (fixed list, same origin only):</p>
                  <div className="flex flex-wrap gap-1">
                    {PASSIVE_CHECK_PATHS.map(p => (
                      <code key={p} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700">{p}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Crawl Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Max pages', key: 'maxPages', min: 1, max: 100, step: undefined },
              { label: 'Max depth', key: 'maxDepth', min: 0, max: 10, step: undefined },
              { label: 'Timeout (ms)', key: 'requestTimeoutMs', min: 3000, max: 60000, step: 1000 },
              { label: 'Delay between pages (ms)', key: 'delayBetweenPagesMs', min: 0, max: 5000, step: 100 },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-xs text-gray-600 mb-1">{field.label}</label>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={options[field.key as keyof ScanOptions] as number}
                  onChange={e => setOptions(p => ({ ...p, [field.key]: Number(e.target.value) }))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="flex flex-col gap-2 justify-end">
              {[
                { key: 'sameOriginOnly', label: 'Same origin only' },
                { key: 'ignoreDestructiveLinks', label: 'Ignore destructive links' },
              ].map(t => (
                <label key={t.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!options[t.key as keyof ScanOptions]}
                    onChange={() => setOptions(p => ({ ...p, [t.key]: !p[t.key as keyof ScanOptions] }))}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              <strong>I confirm I own this site or have explicit permission to test it.</strong>{' '}
              I understand this tool performs a public-facing review only and results should be treated as preliminary findings.
            </span>
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Starting scan…' : 'Start Scan'}
        </button>
      </form>

      {recentScans.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Recent Scans</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentScans.map(scan => (
              <a
                key={scan.id}
                href={`/scan/${scan.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{scan.targetUrl}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(scan.createdAt).toLocaleString()} &bull; {scan.pagesScanned} pages
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {scan.highCount > 0 && (
                    <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">
                      {scan.highCount} high
                    </span>
                  )}
                  {scan.mediumCount > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      {scan.mediumCount} med
                    </span>
                  )}
                  <span className={statusBadgeClass(scan.status)}>{scan.status}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
