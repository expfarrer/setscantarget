export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed'
export type Severity = 'high' | 'medium' | 'low' | 'info'
export type FindingCategory =
  | 'secret_exposure'
  | 'token_exposure'
  | 'hardcoded_password'
  | 'insecure_cookie'
  | 'missing_security_header'
  | 'weak_csp'
  | 'sourcemap_exposure'
  | 'verbose_error'
  | 'framework_leakage'
  | 'suspicious_endpoint_reference'
  | 'possible_public_data_exposure'
  | 'storage_risk'
  | 'cors_risk'
  | 'sensitive_url_parameter'
  | 'missing_sri'
  | 'mixed_content'
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
  passiveEndpointCheck: boolean
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
  passiveEndpointCheck: false,
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

// ---------------------------------------------------------------------------
// Third-party script inventory
// ---------------------------------------------------------------------------

export interface ThirdPartyScriptDomain {
  origin: string
  host: string
  scriptCount: number
  /** false if any missing_sri finding references this domain */
  hasSRI: boolean
  insecureLoads: number
  exampleUrls: string[]
}

export interface ThirdPartyScriptInventory {
  domains: ThirdPartyScriptDomain[]
}

// ---------------------------------------------------------------------------
// Attacker simulation
// ---------------------------------------------------------------------------

export type ScenarioType =
  | 'public_data_exposure'
  | 'auth_session_risk'
  | 'credential_leakage'
  | 'internal_recon'
  | 'client_side_supply_chain_risk'

export type SkillLevel = 'very_low' | 'low' | 'medium'

export type TimeToDiscover =
  | 'under_1_minute'
  | 'under_5_minutes'
  | 'under_15_minutes'
  | 'under_5_minutes_if_script_executes'
  | 'under_5_minutes_if_combined_with_xss'

export interface ScenarioEvidence {
  findingId?: string
  category: string
  title: string
  url: string
  evidenceSnippet: string
  source?: string
}

export interface AttackerScenario {
  id: string
  scenarioType: ScenarioType
  title: string
  summary: string
  skillLevel: SkillLevel
  timeToDiscover: TimeToDiscover
  impact: 'low' | 'medium' | 'high'
  confidence: 'low' | 'medium' | 'high'
  recommendation: string
  evidence: ScenarioEvidence[]
  rank: number
}
