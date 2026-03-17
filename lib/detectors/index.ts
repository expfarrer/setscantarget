import { FindingInput, PageArtifacts } from '../types'
import { detectSecrets, detectNextPublicEnv } from './secrets'
import { detectHardcodedPasswords } from './passwords'
import { detectMissingHeaders } from './headers'
import { detectInsecureCookies } from './cookies'
import { detectStorageRisks } from './storage'
import { detectSourceMapReferences, checkSourceMapAccessible } from './sourcemaps'
import { detectFrameworkLeakage, detectConsoleLeakage } from './framework'
import { detectSuspiciousEndpoints } from './endpoints'

export async function runDetectors(
  artifacts: PageArtifacts,
  options: {
    searchSecrets: boolean
    inspectHeaders: boolean
    inspectCookies: boolean
    inspectLocalStorage: boolean
    inspectSessionStorage: boolean
    detectSourceMaps: boolean
    checkFrameworkLeakage: boolean
    checkConsoleErrors: boolean
    checkSuspiciousEndpoints: boolean
    inspectInlineScripts: boolean
    inspectJsBundles: boolean
  }
): Promise<FindingInput[]> {
  const findings: FindingInput[] = []
  const { url } = artifacts

  if (options.inspectHeaders && Object.keys(artifacts.headers).length > 0) {
    findings.push(...detectMissingHeaders(artifacts.headers, url))
  }

  if (options.inspectCookies && artifacts.cookies.length > 0) {
    findings.push(...detectInsecureCookies(artifacts.cookies, url))
  }

  if (options.inspectLocalStorage && artifacts.localStorage) {
    findings.push(...detectStorageRisks(artifacts.localStorage, 'localStorage', url))
  }

  if (options.inspectSessionStorage && artifacts.sessionStorage) {
    findings.push(...detectStorageRisks(artifacts.sessionStorage, 'sessionStorage', url))
  }

  if (options.searchSecrets && artifacts.html) {
    findings.push(...detectSecrets(artifacts.html, url, 'HTML source'))
    findings.push(...detectNextPublicEnv(artifacts.html, url))
    findings.push(...detectHardcodedPasswords(artifacts.html, url, 'HTML source'))
  }

  if (options.inspectInlineScripts && options.searchSecrets) {
    for (const script of artifacts.inlineScripts) {
      findings.push(...detectSecrets(script, url, 'inline script'))
      findings.push(...detectHardcodedPasswords(script, url, 'inline script'))
    }
  }

  if (options.checkFrameworkLeakage) {
    const content = [artifacts.html || '', ...artifacts.inlineScripts].join('\n')
    findings.push(...detectFrameworkLeakage(content, artifacts.headers, url))
  }

  if (options.checkConsoleErrors) {
    findings.push(...detectConsoleLeakage(artifacts.consoleLogs, url))
  }

  if (options.checkSuspiciousEndpoints) {
    const content = [artifacts.html || '', ...artifacts.inlineScripts].join('\n')
    findings.push(...detectSuspiciousEndpoints(content, url))
  }

  if (options.detectSourceMaps && artifacts.html) {
    findings.push(...detectSourceMapReferences(artifacts.html, url, url))
  }

  return deduplicateFindings(findings)
}

export async function runBundleDetectors(
  bundleContent: string,
  bundleUrl: string,
  pageUrl: string,
  options: {
    searchSecrets: boolean
    detectSourceMaps: boolean
    checkSuspiciousEndpoints: boolean
  }
): Promise<FindingInput[]> {
  const findings: FindingInput[] = []

  if (options.searchSecrets) {
    findings.push(...detectSecrets(bundleContent, pageUrl, `JS bundle (${bundleUrl})`))
    findings.push(...detectNextPublicEnv(bundleContent, pageUrl))
    findings.push(...detectHardcodedPasswords(bundleContent, pageUrl, `JS bundle (${bundleUrl})`))
  }

  if (options.detectSourceMaps) {
    const mapFindings = detectSourceMapReferences(bundleContent, bundleUrl, pageUrl)
    findings.push(...mapFindings)

    for (const f of mapFindings) {
      const mapRef = f.evidence.match(/sourceMappingURL=([^\s]+)/)?.[1]
      if (mapRef && !mapRef.startsWith('data:')) {
        let mapUrl = mapRef
        if (!mapRef.startsWith('http')) {
          try {
            mapUrl = new URL(mapRef, bundleUrl).href
          } catch { continue }
        }
        const accessible = await checkSourceMapAccessible(mapUrl, pageUrl)
        if (accessible) findings.push(accessible)
      }
    }
  }

  if (options.checkSuspiciousEndpoints) {
    findings.push(...detectSuspiciousEndpoints(bundleContent, pageUrl))
  }

  return findings
}

function deduplicateFindings(findings: FindingInput[]): FindingInput[] {
  const seen = new Set<string>()
  return findings.filter(f => {
    const key = `${f.category}:${f.url}:${f.evidence.substring(0, 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
