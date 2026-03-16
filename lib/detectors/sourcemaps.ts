import { FindingInput } from '../types'

export function detectSourceMapReferences(content: string, assetUrl: string, pageUrl: string): FindingInput[] {
  const findings: FindingInput[] = []
  const regex = /\/\/[#@]\s*sourceMappingURL=([^\s]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const mapRef = match[1].trim()
    if (mapRef.startsWith('data:')) continue

    findings.push({
      severity: 'medium',
      category: 'sourcemap_exposure',
      title: 'Source map reference found in JS bundle',
      description: `A sourceMappingURL comment points to "${mapRef}". If this .map file is publicly accessible, it exposes original source code.`,
      url: pageUrl,
      assetUrl,
      evidence: match[0],
      confidence: 'high',
    })
  }

  return findings
}

export async function checkSourceMapAccessible(mapUrl: string, pageUrl: string): Promise<FindingInput | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(mapUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (res.ok) {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('json') || contentType.includes('javascript') || mapUrl.endsWith('.map')) {
        return {
          severity: 'high',
          category: 'sourcemap_exposure',
          title: 'Source map file is publicly accessible',
          description: `The source map at ${mapUrl} is publicly accessible, exposing original source code.`,
          url: pageUrl,
          assetUrl: mapUrl,
          evidence: `GET ${mapUrl} → HTTP ${res.status} (${contentType})`,
          confidence: 'high',
        }
      }
    }
  } catch {
    // Not accessible
  }
  return null
}
