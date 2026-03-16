export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed'
export type Severity = 'high' | 'medium' | 'low' | 'info'
export type FindingCategory =
  | 'secret_exposure'
  | 'token_exposure'
  | 'insecure_cookie'
  | 'missing_security_header'
  | 'sourcemap_exposure'
  | 'verbose_error'
  | 'framework_leakage'
  | 'suspicious_endpoint_reference'
  | 'storage_risk'
  | 'cors_risk'
  | 'info'

export interface ScanOptions {
  inspectHtml: boolean
  inspectDom: boolean
  inspectInlineScripts: boolean
  inspectJsBundles: boolean
  inspectNetworkRequests: boolean
  inspectHeaders: boolean
  inspectCookies: boolean
  inspectLocalStorage: boolean
  inspectSessionStorage: boolean
  detectSourceMaps: boolean
  inspectRobotsTxt: boolean
  inspectSitemapXml: boolean
  searchSecrets: boolean
  checkFrameworkLeakage: boolean
  checkConsoleErrors: boolean
  checkSuspiciousEndpoints: boolean
  maxPages: number
  maxDepth: number
  requestTimeoutMs: number
  sameOriginOnly: boolean
  ignoreDestructiveLinks: boolean
  delayBetweenPagesMs: number
}

export const defaultScanOptions: ScanOptions = {
  inspectHtml: true,
  inspectDom: true,
  inspectInlineScripts: true,
  inspectJsBundles: true,
  inspectNetworkRequests: true,
  inspectHeaders: true,
  inspectCookies: true,
  inspectLocalStorage: true,
  inspectSessionStorage: true,
  detectSourceMaps: true,
  inspectRobotsTxt: true,
  inspectSitemapXml: true,
  searchSecrets: true,
  checkFrameworkLeakage: true,
  checkConsoleErrors: true,
  checkSuspiciousEndpoints: true,
  maxPages: 20,
  maxDepth: 2,
  requestTimeoutMs: 15000,
  sameOriginOnly: true,
  ignoreDestructiveLinks: true,
  delayBetweenPagesMs: 500,
}

export interface FindingInput {
  severity: Severity
  category: FindingCategory
  title: string
  description: string
  url: string
  assetUrl?: string
  evidence: string
  confidence?: string
}

export interface PageArtifacts {
  url: string
  depth: number
  statusCode?: number
  contentType?: string
  title?: string
  html?: string
  renderedText?: string
  inlineScripts: string[]
  linkedScripts: string[]
  headers: Record<string, string>
  cookies: CookieData[]
  localStorage?: Record<string, string>
  sessionStorage?: Record<string, string>
  consoleLogs: ConsoleMessage[]
  links: string[]
  networkRequests: NetworkRequestData[]
}

export interface CookieData {
  name: string
  value: string
  domain?: string
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
  expires?: number
}

export interface ConsoleMessage {
  type: string
  text: string
}

export interface NetworkRequestData {
  url: string
  method: string
  resourceType: string
  statusCode?: number
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  responseSnippet?: string
}
