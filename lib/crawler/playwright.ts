import { Browser, chromium } from 'playwright'
import { PageArtifacts, CookieData, ConsoleMessage, NetworkRequestData, ScanOptions } from '../types'
import { extractLinks, extractInlineScripts, extractLinkedScripts, extractTitle, truncateSnippet } from './extract'

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
  }
}

export async function crawlPage(url: string, depth: number, options: ScanOptions): Promise<PageArtifacts> {
  const b = await getBrowser()
  const context = await b.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (compatible; SiteSecurityReviewScanner/1.0)',
  })

  const consoleLogs: ConsoleMessage[] = []
  const networkRequests: NetworkRequestData[] = []
  const responseHeadersMap = new Map<string, Record<string, string>>()

  const page = await context.newPage()

  page.on('console', msg => {
    if (consoleLogs.length < 50) {
      consoleLogs.push({ type: msg.type(), text: msg.text().substring(0, 500) })
    }
  })

  if (options.inspectNetworkRequests) {
    page.on('response', async response => {
      try {
        const req = response.request()
        const resHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(response.headers())) resHeaders[k] = v
        const reqHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers())) reqHeaders[k] = v

        responseHeadersMap.set(req.url(), resHeaders)

        let snippet: string | undefined
        const ct = resHeaders['content-type'] || ''
        if (
          networkRequests.length < 100 &&
          (ct.includes('javascript') || ct.includes('json') || ct.includes('text'))
        ) {
          try {
            const body = await response.body()
            if (body.length < 50000) snippet = truncateSnippet(body.toString('utf-8'), 300)
          } catch { /* body unavailable */ }
        }

        if (networkRequests.length < 200) {
          networkRequests.push({
            url: req.url(),
            method: req.method(),
            resourceType: req.resourceType(),
            statusCode: response.status(),
            requestHeaders: reqHeaders,
            responseHeaders: resHeaders,
            responseSnippet: snippet,
          })
        }
      } catch { /* network errors expected */ }
    })
  }

  let statusCode: number | undefined
  let contentType: string | undefined
  let finalUrl = url
  let html = ''

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: options.requestTimeoutMs,
    })

    if (response) {
      statusCode = response.status()
      contentType = response.headers()['content-type']
      finalUrl = page.url()

      html = await page.content()

      let localStorage: Record<string, string> | undefined
      let sessionStorage: Record<string, string> | undefined

      if (options.inspectLocalStorage) {
        localStorage = await page.evaluate(() => {
          const r: Record<string, string> = {}
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)!
            r[k] = window.localStorage.getItem(k) || ''
          }
          return r
        }).catch(() => undefined)
      }

      if (options.inspectSessionStorage) {
        sessionStorage = await page.evaluate(() => {
          const r: Record<string, string> = {}
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const k = window.sessionStorage.key(i)!
            r[k] = window.sessionStorage.getItem(k) || ''
          }
          return r
        }).catch(() => undefined)
      }

      const rawCookies = await context.cookies()
      const cookies: CookieData[] = rawCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        expires: c.expires > 0 ? c.expires : undefined,
      }))

      const pageHeaders = responseHeadersMap.get(finalUrl) || responseHeadersMap.get(url) || {}

      await context.close()

      return {
        url: finalUrl,
        depth,
        statusCode,
        contentType,
        title: extractTitle(html),
        html: html.length > 500000 ? html.substring(0, 500000) : html,
        inlineScripts: options.inspectInlineScripts ? extractInlineScripts(html) : [],
        linkedScripts: options.inspectJsBundles ? extractLinkedScripts(html, finalUrl) : [],
        headers: pageHeaders,
        cookies,
        localStorage,
        sessionStorage,
        consoleLogs,
        links: extractLinks(html, finalUrl),
        networkRequests,
      }
    }
  } catch (error) {
    await context.close().catch(() => {})
    throw error
  }

  await context.close().catch(() => {})
  return {
    url: finalUrl, depth, statusCode, contentType, html,
    inlineScripts: [], linkedScripts: [], headers: {}, cookies: [],
    consoleLogs, links: [], networkRequests,
  }
}

export async function fetchTextAsset(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('javascript') && !ct.includes('text') && !ct.includes('json')) return null

    const text = await res.text()
    return text.length > 500000 ? text.substring(0, 500000) : text
  } catch {
    return null
  }
}
