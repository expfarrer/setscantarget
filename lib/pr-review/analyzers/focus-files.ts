import type { PRReviewFindingDraft, PRSeverity } from '../types'

interface FocusFile {
  path: string
  reason: string
  severity: PRSeverity
}

const SEVERITY_RANK: Record<PRSeverity, number> = { high: 3, medium: 2, low: 1 }

export function buildFocusFiles(findings: PRReviewFindingDraft[]): FocusFile[] {
  // Aggregate findings per file
  const fileMap = new Map<
    string,
    { count: number; maxSeverity: PRSeverity; categories: Set<string> }
  >()

  for (const f of findings) {
    const path = f.evidence.filePath
    if (!path) continue
    const existing = fileMap.get(path)
    if (existing) {
      existing.count++
      existing.categories.add(f.category)
      if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.maxSeverity]) {
        existing.maxSeverity = f.severity
      }
    } else {
      fileMap.set(path, {
        count: 1,
        maxSeverity: f.severity,
        categories: new Set([f.category]),
      })
    }
  }

  // Sort: exposure/security first, then by severity, then by finding count
  const sorted = Array.from(fileMap.entries()).sort((a, b) => {
    const aExposure = a[1].categories.has('exposure') || a[1].categories.has('security') ? 1 : 0
    const bExposure = b[1].categories.has('exposure') || b[1].categories.has('security') ? 1 : 0
    if (aExposure !== bExposure) return bExposure - aExposure
    const sevDiff = SEVERITY_RANK[b[1].maxSeverity] - SEVERITY_RANK[a[1].maxSeverity]
    if (sevDiff !== 0) return sevDiff
    return b[1].count - a[1].count
  })

  return sorted.slice(0, 5).map(([path, data]) => ({
    path,
    severity: data.maxSeverity,
    reason: buildReason(data.categories, data.count, data.maxSeverity),
  }))
}

function buildReason(
  categories: Set<string>,
  count: number,
  severity: PRSeverity,
): string {
  const cats = Array.from(categories)

  if (cats.includes('exposure') || cats.includes('security')) {
    return `${count} finding(s) including security/exposure risk — review first`
  }
  if (cats.includes('maintainability') && cats.includes('tests')) {
    return `Complexity and test coverage concerns (${count} findings)`
  }
  if (cats.includes('maintainability')) {
    return `Maintainability risk — ${count} finding(s), highest severity: ${severity}`
  }
  if (cats.includes('tests')) {
    return `Logic changes without test evidence`
  }
  if (cats.includes('naming')) {
    return `Naming consistency issues that may indicate broader design drift`
  }
  return `${count} finding(s) — severity: ${severity}`
}
