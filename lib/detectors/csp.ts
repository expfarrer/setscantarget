import { FindingInput } from '../types'

function parseCSP(headerValue: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of headerValue.split(';').map(s => s.trim()).filter(Boolean)) {
    const tokens = part.split(/\s+/)
    if (tokens[0]) directives.set(tokens[0].toLowerCase(), tokens.slice(1))
  }
  return directives
}

function effectiveScriptSrc(d: Map<string, string[]>): string[] | null {
  return d.get('script-src') ?? d.get('default-src') ?? null
}

function directiveName(d: Map<string, string[]>, key: string): string {
  return d.has(key) ? key : 'default-src'
}

export function analyzeCSP(cspHeader: string, url: string): FindingInput[] {
  const findings: FindingInput[] = []
  const d = parseCSP(cspHeader)
  if (d.size === 0) return findings

  const scriptSrc = effectiveScriptSrc(d)

  // unsafe-inline in script-src / default-src
  if (scriptSrc?.includes("'unsafe-inline'")) {
    const dir = directiveName(d, 'script-src')
    findings.push({
      severity: 'high',
      category: 'weak_csp',
      title: "Weak CSP: 'unsafe-inline' scripts allowed",
      description: `The CSP ${dir} includes 'unsafe-inline', which permits arbitrary inline script execution and largely defeats XSS protection.`,
      url,
      evidence: `${dir}: ${scriptSrc.join(' ')}`,
      confidence: 'high',
    })
  }

  // unsafe-eval
  if (scriptSrc?.includes("'unsafe-eval'")) {
    const dir = directiveName(d, 'script-src')
    findings.push({
      severity: 'medium',
      category: 'weak_csp',
      title: "Weak CSP: 'unsafe-eval' permitted",
      description: `The CSP ${dir} includes 'unsafe-eval', allowing dynamic code evaluation via eval(), setTimeout(string), and similar functions.`,
      url,
      evidence: `${dir}: ${scriptSrc.join(' ')}`,
      confidence: 'high',
    })
  }

  // Wildcard script sources
  if (scriptSrc?.includes('*')) {
    const dir = directiveName(d, 'script-src')
    findings.push({
      severity: 'high',
      category: 'weak_csp',
      title: 'Weak CSP: wildcard (*) script source',
      description: `The CSP ${dir} uses '*' which permits scripts from any origin, negating the value of the allowlist entirely.`,
      url,
      evidence: `${dir}: ${scriptSrc.join(' ')}`,
      confidence: 'high',
    })
  }

  // missing object-src 'none'
  const objectSrc = d.get('object-src')
  const defaultSrc = d.get('default-src') ?? []
  if (!objectSrc) {
    const defaultIsRestrictive = defaultSrc.includes("'none'") || defaultSrc.includes("'self'")
    if (!defaultIsRestrictive) {
      findings.push({
        severity: 'medium',
        category: 'weak_csp',
        title: "Weak CSP: object-src not restricted to 'none'",
        description: "CSP is missing 'object-src none', which allows <object> and <embed> elements to load plugins from any source.",
        url,
        evidence: `object-src: not set; default-src: ${defaultSrc.join(' ') || '(not set)'}`,
        confidence: 'medium',
      })
    }
  } else if (!objectSrc.includes("'none'")) {
    findings.push({
      severity: 'low',
      category: 'weak_csp',
      title: "Weak CSP: object-src not set to 'none'",
      description: "The object-src directive is present but does not use 'none', allowing plugin-based content from the listed origins.",
      url,
      evidence: `object-src: ${objectSrc.join(' ')}`,
      confidence: 'medium',
    })
  }

  // missing base-uri
  if (!d.has('base-uri')) {
    findings.push({
      severity: 'low',
      category: 'weak_csp',
      title: 'Weak CSP: base-uri not set',
      description: "Without a 'base-uri' directive, an injected <base> tag could redirect relative URLs to an attacker-controlled host.",
      url,
      evidence: 'base-uri directive not present in CSP',
      confidence: 'medium',
    })
  }

  // missing frame-ancestors
  if (!d.has('frame-ancestors')) {
    findings.push({
      severity: 'info',
      category: 'weak_csp',
      title: 'CSP: frame-ancestors not set',
      description: "The CSP does not include 'frame-ancestors'. X-Frame-Options may still protect against clickjacking, but frame-ancestors is the preferred modern approach.",
      url,
      evidence: 'frame-ancestors not present in CSP',
      confidence: 'low',
    })
  }

  // wildcard connect-src
  const connectSrc = d.get('connect-src')
  if (connectSrc?.includes('*')) {
    findings.push({
      severity: 'low',
      category: 'weak_csp',
      title: 'Weak CSP: wildcard connect-src',
      description: "The connect-src directive uses '*', allowing fetch/XHR/WebSocket to any origin. If XSS occurs, exfiltrating data is unrestricted.",
      url,
      evidence: `connect-src: ${connectSrc.join(' ')}`,
      confidence: 'high',
    })
  }

  // wildcard frame-src
  const frameSrc = d.get('frame-src')
  if (frameSrc?.includes('*')) {
    findings.push({
      severity: 'medium',
      category: 'weak_csp',
      title: 'Weak CSP: wildcard frame-src',
      description: "The frame-src directive uses '*', permitting iframes from any origin. This may facilitate content injection or clickjacking.",
      url,
      evidence: `frame-src: ${frameSrc.join(' ')}`,
      confidence: 'high',
    })
  }

  return findings
}
