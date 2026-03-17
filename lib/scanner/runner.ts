import { prisma } from '../db'
import { ScanOptions } from '../types'
import { CrawlScope } from '../crawler/scope'
import { crawlPage, fetchTextAsset, closeBrowser } from '../crawler/playwright'
import { runDetectors, runBundleDetectors } from '../detectors'
import { detectRobotsIssues } from '../detectors/endpoints'
import { runPassiveEndpointChecks } from '../detectors/passive-endpoints'
import { log } from './logging'

export async function runScan(scanId: string) {
  const scan = await prisma.scan.findUnique({ where: { id: scanId } })
  if (!scan) throw new Error(`Scan ${scanId} not found`)

  const options: ScanOptions = JSON.parse(scan.optionsJson)

  await prisma.scan.update({
    where: { id: scanId },
    data: { status: 'running', startedAt: new Date() },
  })

  await log(scanId, 'info', `Starting scan of ${scan.targetUrl}`)

  try {
    await performScan(scanId, scan.targetUrl, options)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: 'failed', finishedAt: new Date(), errorMessage: msg },
    })
    await log(scanId, 'error', `Scan failed: ${msg}`)
  } finally {
    await closeBrowser()
  }
}

async function performScan(scanId: string, targetUrl: string, options: ScanOptions) {
  const scope = new CrawlScope(targetUrl, options)
  scope.enqueue(targetUrl, 0)

  if (options.inspectRobotsTxt) {
    try {
      const origin = new URL(targetUrl).origin
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 8000)
      const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal })
      if (res.ok) {
        const content = await res.text()
        const rFindings = detectRobotsIssues(content, `${origin}/robots.txt`)
        for (const f of rFindings) {
          await prisma.finding.create({ data: { scanId, ...f } })
        }
        await log(scanId, 'info', 'Analyzed robots.txt')
      }
    } catch {
      await log(scanId, 'warn', 'Could not fetch robots.txt')
    }
  }

  let totalRequests = 0
  const processedBundles = new Set<string>()

  while (scope.hasMore() && scope.withinLimits()) {
    const next = scope.dequeue()
    if (!next) break

    const { url, depth } = next
    if (scope.isVisited(url)) continue
    if (!scope.isInScope(url)) continue

    scope.markVisited(url)
    await log(scanId, 'info', `Crawling [depth ${depth}]: ${url}`)

    let artifacts
    try {
      artifacts = await crawlPage(url, depth, options)
    } catch (error) {
      await log(scanId, 'warn', `Failed: ${url} — ${error instanceof Error ? error.message : String(error)}`)
      continue
    }

    if (options.delayBetweenPagesMs > 0) {
      await new Promise(r => setTimeout(r, options.delayBetweenPagesMs))
    }

    const savedPage = await prisma.scannedPage.create({
      data: {
        scanId,
        url: artifacts.url,
        depth: artifacts.depth,
        statusCode: artifacts.statusCode,
        contentType: artifacts.contentType,
        title: artifacts.title,
        htmlSnapshot: artifacts.html ? artifacts.html.substring(0, 100000) : null,
        headersJson: JSON.stringify(artifacts.headers),
        storageJson: artifacts.localStorage || artifacts.sessionStorage
          ? JSON.stringify({ localStorage: artifacts.localStorage, sessionStorage: artifacts.sessionStorage })
          : null,
      },
    })

    for (const req of artifacts.networkRequests) {
      await prisma.networkRequest.create({
        data: {
          scanId,
          pageId: savedPage.id,
          url: req.url,
          method: req.method,
          resourceType: req.resourceType,
          statusCode: req.statusCode,
          requestHeadersJson: JSON.stringify(req.requestHeaders),
          responseHeadersJson: JSON.stringify(req.responseHeaders),
          responseSnippet: req.responseSnippet,
        },
      })
    }
    totalRequests += artifacts.networkRequests.length

    const pageFindings = await runDetectors(artifacts, options)
    for (const f of pageFindings) {
      await prisma.finding.create({ data: { scanId, pageId: savedPage.id, ...f } })
    }

    if (options.inspectJsBundles) {
      for (const bundleUrl of artifacts.linkedScripts) {
        if (processedBundles.has(bundleUrl)) continue
        processedBundles.add(bundleUrl)

        await log(scanId, 'info', `Inspecting bundle: ${bundleUrl}`)
        const bundleContent = await fetchTextAsset(bundleUrl, options.requestTimeoutMs)

        if (bundleContent) {
          const bundleFindings = await runBundleDetectors(bundleContent, bundleUrl, url, {
            searchSecrets: options.searchSecrets,
            detectSourceMaps: options.detectSourceMaps,
            checkSuspiciousEndpoints: options.checkSuspiciousEndpoints,
          })
          for (const f of bundleFindings) {
            await prisma.finding.create({
              data: { scanId, pageId: savedPage.id, assetUrl: bundleUrl, ...f },
            })
          }
        }
      }
    }

    for (const link of artifacts.links) {
      if (scope.isInScope(link) && !scope.isVisited(link)) {
        scope.enqueue(link, depth + 1)
      }
    }

    await updateProgress(scanId, scope.visitedCount, totalRequests)
  }

  // Passive common endpoint checks (opt-in, same-origin, GET-only, fixed allowlist)
  if (options.passiveEndpointCheck) {
    await log(scanId, 'info', 'Running passive common endpoint checks…')
    try {
      const passiveResults = await runPassiveEndpointChecks(targetUrl, options.requestTimeoutMs)
      let passiveHits = 0

      for (const result of passiveResults) {
        if (result.statusCode === 0) continue // timeout/network error

        // Record as a network request so it appears in the requests tab
        await prisma.networkRequest.create({
          data: {
            scanId,
            url: result.url,
            method: 'GET',
            resourceType: 'passive-endpoint-check',
            statusCode: result.statusCode,
            responseHeadersJson: JSON.stringify(result.responseHeaders),
            responseSnippet: result.preview ?? undefined,
          },
        })
        totalRequests++

        for (const f of result.findings) {
          await prisma.finding.create({ data: { scanId, ...f } })
          passiveHits++
        }
      }

      await log(
        scanId,
        'info',
        `Passive endpoint checks done. ${passiveResults.filter(r => r.statusCode === 200).length} paths returned 200, ${passiveHits} finding(s).`,
      )
    } catch (error) {
      await log(scanId, 'warn', `Passive endpoint checks failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    await updateProgress(scanId, scope.visitedCount, totalRequests)
  }

  await prisma.scan.update({
    where: { id: scanId },
    data: { status: 'completed', finishedAt: new Date() },
  })
  await log(scanId, 'info', `Scan complete. Pages: ${scope.visitedCount}, Requests: ${totalRequests}`)
}

async function updateProgress(scanId: string, pagesScanned: number, requestsCaptured: number) {
  const findingCounts = await prisma.finding.groupBy({
    by: ['severity'],
    where: { scanId },
    _count: { severity: true },
  })
  const counts = { high: 0, medium: 0, low: 0, info: 0 }
  for (const row of findingCounts) counts[row.severity as keyof typeof counts] = row._count.severity

  await prisma.scan.update({
    where: { id: scanId },
    data: {
      pagesScanned,
      requestsCaptured,
      findingsCount: counts.high + counts.medium + counts.low + counts.info,
      highCount: counts.high,
      mediumCount: counts.medium,
      lowCount: counts.low,
      infoCount: counts.info,
    },
  })
}
