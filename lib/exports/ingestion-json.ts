/**
 * Ingestion JSON export format — v1.0
 *
 * Designed for consumption by coding agents (e.g. Claude Code) or other
 * downstream tooling that needs structured, triage-ready security findings.
 *
 * Top-level shape is stable and versioned. The `handoff.futurePromptPreset`
 * block is reserved for Part B (prompt builder / preset system).
 */

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface IngestionExportFinding {
  id: string
  severity: string
  category: string
  title: string
  description: string
  url: string
  assetUrl: string | null
  evidence: string
  confidence: string | null
  pageId: string | null
  requestId: string | null
  createdAt: string
}

export interface IngestionExportPage {
  id: string
  url: string
  depth: number
  statusCode: number | null
  contentType: string | null
  title: string | null
}

export interface IngestionExportRequest {
  id: string
  pageId: string | null
  url: string
  method: string
  resourceType: string | null
  statusCode: number | null
  contentType: string | null
}

export interface IngestionExportHandoff {
  intendedUse: 'ingestion_by_coding_agent'
  recommendedWorkflow: string[]
  futurePromptPreset: {
    enabled: false
    presetId: null
    instructions: []
    notes: string
  }
}

export interface IngestionExport {
  version: '1.0'
  reportType: 'security_scan_ingestion'
  generatedAt: string
  sourceApp: {
    name: 'Site Security Review Scanner'
    formatVersion: '1.0'
  }
  target: {
    scanId: string
    targetUrl: string
    normalizedOrigin: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    pagesScanned: number
    requestsCaptured: number
  }
  summary: {
    findingsCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    infoCount: number
    categoryCounts: Record<string, number>
  }
  scanOptions: Record<string, unknown>
  findings: IngestionExportFinding[]
  pages: IngestionExportPage[]
  requests: IngestionExportRequest[]
  handoff: IngestionExportHandoff
}

// ---------------------------------------------------------------------------
// DB input shape (what Prisma returns for an ingestion export query)
// ---------------------------------------------------------------------------

export interface ScanForIngestionExport {
  id: string
  targetUrl: string
  normalizedOrigin: string
  status: string
  optionsJson: string
  startedAt: Date | null
  finishedAt: Date | null
  pagesScanned: number
  requestsCaptured: number
  findingsCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  findings: Array<{
    id: string
    severity: string
    category: string
    title: string
    description: string
    url: string
    assetUrl: string | null
    evidence: string
    confidence: string | null
    pageId: string | null
    requestId: string | null
    createdAt: Date
  }>
  pages: Array<{
    id: string
    url: string
    depth: number
    statusCode: number | null
    contentType: string | null
    title: string | null
  }>
  requests: Array<{
    id: string
    pageId: string | null
    url: string
    method: string
    resourceType: string | null
    statusCode: number | null
    responseHeadersJson: string | null
  }>
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 }
const EVIDENCE_MAX_LENGTH = 600

function truncateEvidence(evidence: string): string {
  return evidence.length > EVIDENCE_MAX_LENGTH
    ? evidence.substring(0, EVIDENCE_MAX_LENGTH) + '…'
    : evidence
}

function extractContentType(responseHeadersJson: string | null): string | null {
  if (!responseHeadersJson) return null
  try {
    const headers: Record<string, string> = JSON.parse(responseHeadersJson)
    return headers['content-type'] ?? headers['Content-Type'] ?? null
  } catch {
    return null
  }
}

function buildCategoryCounts(
  findings: ScanForIngestionExport['findings']
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const f of findings) {
    counts[f.category] = (counts[f.category] ?? 0) + 1
  }
  return counts
}

export function buildIngestionExport(scan: ScanForIngestionExport): IngestionExport {
  // Deterministic finding order: severity asc-rank, then category asc, then createdAt asc
  const sortedFindings = [...scan.findings].sort((a, b) => {
    const severityDiff = (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99)
    if (severityDiff !== 0) return severityDiff
    if (a.category < b.category) return -1
    if (a.category > b.category) return 1
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  let parsedOptions: Record<string, unknown> = {}
  try {
    parsedOptions = JSON.parse(scan.optionsJson)
  } catch {
    // Leave empty if malformed
  }

  return {
    version: '1.0',
    reportType: 'security_scan_ingestion',
    generatedAt: new Date().toISOString(),
    sourceApp: {
      name: 'Site Security Review Scanner',
      formatVersion: '1.0',
    },
    target: {
      scanId: scan.id,
      targetUrl: scan.targetUrl,
      normalizedOrigin: scan.normalizedOrigin,
      status: scan.status,
      startedAt: scan.startedAt?.toISOString() ?? null,
      finishedAt: scan.finishedAt?.toISOString() ?? null,
      pagesScanned: scan.pagesScanned,
      requestsCaptured: scan.requestsCaptured,
    },
    summary: {
      findingsCount: scan.findingsCount,
      highCount: scan.highCount,
      mediumCount: scan.mediumCount,
      lowCount: scan.lowCount,
      infoCount: scan.infoCount,
      categoryCounts: buildCategoryCounts(scan.findings),
    },
    scanOptions: parsedOptions,
    findings: sortedFindings.map(f => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      url: f.url,
      assetUrl: f.assetUrl,
      evidence: truncateEvidence(f.evidence),
      confidence: f.confidence,
      pageId: f.pageId,
      requestId: f.requestId,
      createdAt: f.createdAt.toISOString(),
    })),
    pages: scan.pages.map(p => ({
      id: p.id,
      url: p.url,
      depth: p.depth,
      statusCode: p.statusCode,
      contentType: p.contentType,
      title: p.title,
    })),
    requests: scan.requests.map(r => ({
      id: r.id,
      pageId: r.pageId,
      url: r.url,
      method: r.method,
      resourceType: r.resourceType,
      statusCode: r.statusCode,
      contentType: extractContentType(r.responseHeadersJson),
    })),
    handoff: {
      intendedUse: 'ingestion_by_coding_agent',
      recommendedWorkflow: [
        'triage real issues vs false positives using evidence snippets',
        'prioritize by severity and confidence score',
        'fix safe code-level issues first (cookies, headers, storage)',
        'separate app-level fixes from infrastructure/server fixes',
        'verify high-severity findings manually before remediating',
      ],
      futurePromptPreset: {
        enabled: false,
        presetId: null,
        instructions: [],
        notes: 'Reserved for Part B prompt builder. Will allow users to attach remediation instructions and agent presets to this report.',
      },
    },
  }
}
