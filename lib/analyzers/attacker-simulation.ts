import {
  AttackerScenario,
  ScenarioEvidence,
  ScenarioType,
  SkillLevel,
  TimeToDiscover,
  ThirdPartyScriptInventory,
} from '../types'

// ---------------------------------------------------------------------------
// Input shape (subset of Finding — works with DB findings and export findings)
// ---------------------------------------------------------------------------

export interface FindingForScenario {
  id: string
  severity: string
  category: string
  title: string
  url: string
  evidence: string
  assetUrl?: string | null
}

// ---------------------------------------------------------------------------
// Scoring / ranking
// ---------------------------------------------------------------------------

const IMPACT_SCORE: Record<string, number> = { high: 3, medium: 2, low: 1 }
const CONFIDENCE_SCORE: Record<string, number> = { high: 3, medium: 2, low: 1 }
const SKILL_SCORE: Record<SkillLevel, number> = { very_low: 3, low: 2, medium: 1 }
const TIME_SCORE: Record<TimeToDiscover, number> = {
  under_1_minute: 4,
  under_5_minutes: 3,
  under_5_minutes_if_script_executes: 2,
  under_5_minutes_if_combined_with_xss: 2,
  under_15_minutes: 1,
}

function score(
  impact: string,
  confidence: string,
  skill: SkillLevel,
  time: TimeToDiscover,
): number {
  return (
    (IMPACT_SCORE[impact] ?? 1) * 3 +
    (CONFIDENCE_SCORE[confidence] ?? 1) * 2 +
    SKILL_SCORE[skill] +
    TIME_SCORE[time]
  )
}

function makeEvidence(f: FindingForScenario): ScenarioEvidence {
  return {
    findingId: f.id,
    category: f.category,
    title: f.title,
    url: f.url,
    evidenceSnippet: f.evidence.substring(0, 120),
  }
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

function publicDataExposure(findings: FindingForScenario[]): AttackerScenario | null {
  const relevant = findings.filter(f => f.category === 'possible_public_data_exposure')
  if (relevant.length === 0) return null

  const maxSeverity = relevant.some(f => f.severity === 'high') ? 'high' : 'medium'
  const confidence = relevant.length >= 2 ? 'high' : 'medium'

  return {
    id: 'public_data_exposure',
    scenarioType: 'public_data_exposure' as ScenarioType,
    title: 'Unauthenticated API data discoverable from the browser',
    summary:
      'A common API or admin path returned structured data without requiring authentication. A visitor with a browser and basic curiosity could discover and read this data directly.',
    skillLevel: 'very_low' as SkillLevel,
    timeToDiscover: 'under_5_minutes' as TimeToDiscover,
    impact: maxSeverity,
    confidence,
    recommendation:
      'Enforce server-side authorization on all API endpoints. Return minimal data to unauthenticated callers. Treat any 200 response from an admin or user data path as a potential exposure.',
    evidence: relevant.slice(0, 5).map(makeEvidence),
    rank: score(maxSeverity, confidence, 'very_low', 'under_5_minutes'),
  }
}

function authSessionRisk(findings: FindingForScenario[]): AttackerScenario | null {
  const AUTH_CATEGORIES = new Set(['insecure_cookie', 'storage_risk'])
  const AUTH_KEYWORDS = /\b(auth|session|jwt|token|login|credential|access|refresh|bearer|sid)\b/i

  const relevant = findings.filter(f => {
    if (!AUTH_CATEGORIES.has(f.category)) return false
    return AUTH_KEYWORDS.test(f.title) || AUTH_KEYWORDS.test(f.evidence)
  })

  if (relevant.length === 0) return null

  const hasHighSeverity = relevant.some(f => f.severity === 'high')
  const confidence = relevant.length >= 3 ? 'high' : relevant.length >= 2 ? 'medium' : 'low'

  return {
    id: 'auth_session_risk',
    scenarioType: 'auth_session_risk' as ScenarioType,
    title: 'Auth/session material accessible to browser-side scripts',
    summary:
      'The scan found weakly protected auth cookies or client-visible auth tokens. If a script injection occurs anywhere on the page, session credentials could be read or transmitted to an external destination.',
    skillLevel: 'medium' as SkillLevel,
    timeToDiscover: 'under_5_minutes_if_script_executes' as TimeToDiscover,
    impact: hasHighSeverity ? 'high' : 'medium',
    confidence,
    recommendation:
      'Set HttpOnly and Secure on all auth cookies. Avoid storing tokens in localStorage or sessionStorage. Prefer short-lived, server-managed sessions.',
    evidence: relevant.slice(0, 5).map(makeEvidence),
    rank: score(
      hasHighSeverity ? 'high' : 'medium',
      confidence,
      'medium',
      'under_5_minutes_if_script_executes',
    ),
  }
}

function credentialLeakage(findings: FindingForScenario[]): AttackerScenario | null {
  const CRED_CATEGORIES = new Set([
    'secret_exposure',
    'token_exposure',
    'hardcoded_password',
    'sensitive_url_parameter',
  ])

  const relevant = findings.filter(
    f => CRED_CATEGORIES.has(f.category) && (f.severity === 'high' || f.severity === 'medium'),
  )

  if (relevant.length === 0) return null

  const hasHigh = relevant.some(f => f.severity === 'high')
  const confidence = hasHigh ? 'high' : 'medium'

  return {
    id: 'credential_leakage',
    scenarioType: 'credential_leakage' as ScenarioType,
    title: 'Credential-like secrets exposed in public-facing artifacts',
    summary:
      'The scan found password-like or token-like material in client-visible code or URLs. An attacker using only browser developer tools could extract and potentially misuse these values without any additional access.',
    skillLevel: 'very_low' as SkillLevel,
    timeToDiscover: 'under_1_minute' as TimeToDiscover,
    impact: 'high',
    confidence,
    recommendation:
      'Remove secrets from all client-visible code and URLs. Rotate any exposed values immediately. Move secrets to server-only handling and use environment variables that are not prefixed for client exposure.',
    evidence: relevant.slice(0, 5).map(makeEvidence),
    rank: score('high', confidence, 'very_low', 'under_1_minute'),
  }
}

function internalRecon(findings: FindingForScenario[]): AttackerScenario | null {
  const RECON_CATEGORIES = new Set([
    'sourcemap_exposure',
    'framework_leakage',
    'suspicious_endpoint_reference',
    'info',
  ])

  const RECON_KEYWORDS =
    /\b(source.?map|internal|localhost|staging|admin|debug|route|endpoint|config|version|framework|stack|Next\.js|React|Angular|Vue|Express|Laravel|Django|Rails)\b/i

  const relevant = findings.filter(f => {
    if (RECON_CATEGORIES.has(f.category)) return true
    return RECON_KEYWORDS.test(f.title) || RECON_KEYWORDS.test(f.category)
  })

  if (relevant.length < 2) return null

  const hasSourceMap = relevant.some(f => f.category === 'sourcemap_exposure')
  const impact = hasSourceMap ? 'medium' : 'low'
  const confidence = relevant.length >= 4 ? 'high' : 'medium'

  return {
    id: 'internal_recon',
    scenarioType: 'internal_recon' as ScenarioType,
    title: 'Public assets reveal internal application structure',
    summary:
      'The scan found client-visible clues about internal routes, environments, frameworks, or source code. This information helps an attacker prioritize follow-on probing and understand which vulnerabilities are most likely to apply.',
    skillLevel: 'low' as SkillLevel,
    timeToDiscover: 'under_5_minutes' as TimeToDiscover,
    impact,
    confidence,
    recommendation:
      'Disable source maps in production builds. Remove version headers and debug references. Minimize robots.txt disclosures. Avoid leaking internal hostnames or route structures in client-side code.',
    evidence: relevant.slice(0, 5).map(makeEvidence),
    rank: score(impact, confidence, 'low', 'under_5_minutes'),
  }
}

function supplyChainRisk(
  findings: FindingForScenario[],
  inventory: ThirdPartyScriptInventory,
): AttackerScenario | null {
  const SUPPLY_CATEGORIES = new Set(['missing_sri', 'mixed_content', 'weak_csp'])

  const relevant = findings.filter(f => SUPPLY_CATEGORIES.has(f.category))

  const thirdPartyCount = inventory.domains.reduce((s, d) => s + d.scriptCount, 0)
  const insecureCount = inventory.domains.reduce((s, d) => s + d.insecureLoads, 0)
  const noSriDomains = inventory.domains.filter(d => !d.hasSRI).length

  // Need at least some signal to generate this scenario
  if (relevant.length === 0 && thirdPartyCount === 0) return null
  if (relevant.length === 0 && noSriDomains === 0 && insecureCount === 0) return null

  const hasMixedContent = findings.some(f => f.category === 'mixed_content')
  const hasWeakCSP = findings.some(f => f.category === 'weak_csp')

  const impact = hasMixedContent || (hasWeakCSP && noSriDomains > 0) ? 'high' : 'medium'
  const confidence =
    relevant.length >= 3 || (thirdPartyCount > 5 && noSriDomains > 0) ? 'high' : 'medium'

  const inventoryNote =
    thirdPartyCount > 0
      ? ` The app loads scripts from ${inventory.domains.length} third-party domain${inventory.domains.length !== 1 ? 's' : ''} (${thirdPartyCount} total script${thirdPartyCount !== 1 ? 's' : ''}).`
      : ''

  return {
    id: 'client_side_supply_chain_risk',
    scenarioType: 'client_side_supply_chain_risk' as ScenarioType,
    title: 'Client-side script supply chain increases browser exposure',
    summary: `The app loads third-party or weakly constrained client-side scripts without adequate integrity controls.${inventoryNote} A compromised CDN, weak CSP, or HTTP-loaded script could result in arbitrary code execution in user browsers.`,
    skillLevel: 'low' as SkillLevel,
    timeToDiscover: 'under_5_minutes_if_combined_with_xss' as TimeToDiscover,
    impact,
    confidence,
    recommendation:
      'Add Subresource Integrity (integrity= attributes) to all third-party script tags. Ensure all scripts load over HTTPS. Tighten the CSP script-src to a narrow allowlist without unsafe-inline or unsafe-eval.',
    evidence: relevant.slice(0, 5).map(makeEvidence),
    rank: score(impact, confidence, 'low', 'under_5_minutes_if_combined_with_xss'),
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function runAttackerSimulation(
  findings: FindingForScenario[],
  inventory: ThirdPartyScriptInventory,
): AttackerScenario[] {
  const candidates = [
    credentialLeakage(findings),
    publicDataExposure(findings),
    authSessionRisk(findings),
    internalRecon(findings),
    supplyChainRisk(findings, inventory),
  ].filter((s): s is AttackerScenario => s !== null)

  // Sort by rank descending, then by type for determinism
  return candidates
    .sort((a, b) => b.rank - a.rank || a.scenarioType.localeCompare(b.scenarioType))
    .map((s, i) => ({ ...s, rank: i + 1 }))
}

// ---------------------------------------------------------------------------
// Human-readable labels for UI
// ---------------------------------------------------------------------------

export const SKILL_LABELS: Record<string, string> = {
  very_low: 'Very low skill',
  low: 'Low skill',
  medium: 'Medium skill',
}

export const TIME_LABELS: Record<string, string> = {
  under_1_minute: '< 1 minute',
  under_5_minutes: '< 5 minutes',
  under_15_minutes: '< 15 minutes',
  under_5_minutes_if_script_executes: '< 5 min (if script executes)',
  under_5_minutes_if_combined_with_xss: '< 5 min (if combined with XSS)',
}

export const IMPACT_LABELS: Record<string, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
}
