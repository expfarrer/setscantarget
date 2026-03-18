import { FindingInput, ThirdPartyScriptDomain, ThirdPartyScriptInventory } from '../types'

// ---------------------------------------------------------------------------
// Script tag SRI / mixed-content finding generation (runs during crawl)
// ---------------------------------------------------------------------------

interface ScriptTag {
  resolvedUrl: string
  srcAttr: string
  hasSRI: boolean
}

function extractScriptTags(html: string, pageUrl: string): ScriptTag[] {
  const results: ScriptTag[] = []
  const re = /<script\b([^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1]
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)
    if (!srcMatch) continue
    const src = srcMatch[1]
    let resolved: string
    try {
      resolved = new URL(src, pageUrl).href
    } catch {
      continue
    }
    const hasSRI = /\bintegrity\s*=\s*["'][^"']+["']/i.test(attrs)
    results.push({ resolvedUrl: resolved, srcAttr: src, hasSRI })
  }
  return results
}

export function detectSRIAndMixedContent(
  html: string,
  pageUrl: string,
  pageOrigin: string,
): FindingInput[] {
  const findings: FindingInput[] = []
  const isHttps = pageUrl.startsWith('https://')
  const noSRIDomains = new Set<string>()

  for (const tag of extractScriptTags(html, pageUrl)) {
    let srcOrigin: string
    try {
      srcOrigin = new URL(tag.resolvedUrl).origin
    } catch {
      continue
    }

    // Skip first-party scripts
    if (srcOrigin === pageOrigin) continue

    // Missing SRI — one finding per third-party domain per page
    if (!tag.hasSRI && !noSRIDomains.has(srcOrigin)) {
      noSRIDomains.add(srcOrigin)
      findings.push({
        severity: 'low',
        category: 'missing_sri',
        title: 'Third-party script loaded without Subresource Integrity',
        description: `A script from ${srcOrigin} is loaded without a Subresource Integrity (integrity=) attribute. If this host is compromised, malicious code could silently execute in your app.`,
        url: pageUrl,
        assetUrl: tag.resolvedUrl,
        evidence: `<script src="${tag.srcAttr}"> — no integrity attribute; origin: ${srcOrigin}`,
        confidence: 'high',
      })
    }

    // Mixed content — HTTPS page loading HTTP script
    if (isHttps && tag.resolvedUrl.startsWith('http://')) {
      findings.push({
        severity: 'high',
        category: 'mixed_content',
        title: 'HTTPS page loads script over HTTP (mixed content)',
        description: `The page loads a script over unencrypted HTTP. A network attacker can intercept and replace this script before it reaches the browser.`,
        url: pageUrl,
        assetUrl: tag.resolvedUrl,
        evidence: `<script src="${tag.srcAttr}"> — loaded over HTTP on an HTTPS page`,
        confidence: 'high',
      })
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// Inventory builder — works from network requests + optional finding context
// ---------------------------------------------------------------------------

export function buildScriptInventory(
  pageOrigin: string,
  requests: Array<{ url: string; resourceType: string | null }>,
  findings: Array<{ category: string; assetUrl?: string | null }>,
): ThirdPartyScriptInventory {
  // Build set of assetUrls that triggered missing_sri findings by origin
  const sriMissingOrigins = new Set<string>()
  for (const f of findings) {
    if (f.category === 'missing_sri' && f.assetUrl) {
      try {
        sriMissingOrigins.add(new URL(f.assetUrl).origin)
      } catch { /* skip */ }
    }
  }

  const domainMap = new Map<string, ThirdPartyScriptDomain>()

  for (const req of requests) {
    if (req.resourceType !== 'script') continue
    let origin: string
    let host: string
    try {
      const u = new URL(req.url)
      origin = u.origin
      host = u.hostname
    } catch {
      continue
    }

    if (origin === pageOrigin) continue // first-party

    let domain = domainMap.get(origin)
    if (!domain) {
      domain = {
        origin,
        host,
        scriptCount: 0,
        hasSRI: !sriMissingOrigins.has(origin),
        insecureLoads: 0,
        exampleUrls: [],
      }
      domainMap.set(origin, domain)
    }

    domain.scriptCount++
    if (req.url.startsWith('http://')) domain.insecureLoads++
    if (domain.exampleUrls.length < 3) domain.exampleUrls.push(req.url)
  }

  return {
    domains: Array.from(domainMap.values()).sort((a, b) => b.scriptCount - a.scriptCount),
  }
}
