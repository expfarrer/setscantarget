import { FindingInput } from '../types'

export function detectFrameworkLeakage(
  content: string,
  headers: Record<string, string>,
  url: string
): FindingInput[] {
  const findings: FindingInput[] = []
  void headers // used in caller context

  const stackTraceRegex = /(?:Error|TypeError|ReferenceError|SyntaxError):[^\n]+\n\s+at\s+\S+\s+\([^)]+\)/g
  const stackMatch = stackTraceRegex.exec(content)
  if (stackMatch) {
    findings.push({
      severity: 'medium',
      category: 'verbose_error',
      title: 'Stack trace exposed in page content',
      description: 'A JavaScript stack trace was found in the page content, which may reveal internal file paths.',
      url,
      evidence: stackMatch[0].substring(0, 300),
      confidence: 'high',
    })
  }

  const nextVersion = content.match(/"version":\s*"(\d+\.\d+\.\d+)"/)?.[1]
  if (nextVersion) {
    findings.push({
      severity: 'low',
      category: 'framework_leakage',
      title: `Framework version exposed: ${nextVersion}`,
      description: 'A version number is exposed in the page, which can help attackers target known vulnerabilities.',
      url,
      evidence: `Detected version: ${nextVersion}`,
      confidence: 'medium',
    })
  }

  if (content.includes('__REACT_DEVTOOLS_GLOBAL_HOOK__')) {
    findings.push({
      severity: 'low',
      category: 'framework_leakage',
      title: 'React DevTools hook detected',
      description: 'React DevTools global hook is present, suggesting a development or debug build.',
      url,
      evidence: 'Found __REACT_DEVTOOLS_GLOBAL_HOOK__',
      confidence: 'medium',
    })
  }

  const internalUrlRegex = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?(?:\/[^\s"'<>]*)?/g
  const internalMatch = internalUrlRegex.exec(content)
  if (internalMatch) {
    findings.push({
      severity: 'medium',
      category: 'framework_leakage',
      title: 'Internal/localhost URL exposed',
      description: 'An internal or localhost URL was found in the page source, potentially revealing internal network topology.',
      url,
      evidence: internalMatch[0],
      confidence: 'high',
    })
  }

  return findings
}

export function detectConsoleLeakage(consoleLogs: { type: string; text: string }[], url: string): FindingInput[] {
  const findings: FindingInput[] = []

  for (const log of consoleLogs) {
    if (log.type !== 'error' && log.type !== 'warning') continue
    const text = log.text

    if (/at\s+\S+\s+\(/.test(text)) {
      findings.push({
        severity: 'low',
        category: 'verbose_error',
        title: 'Stack trace in browser console',
        description: 'An error with a stack trace was logged to the browser console.',
        url,
        evidence: text.substring(0, 300),
        confidence: 'high',
      })
      break
    }

    if (/\/home\/|\/usr\/|\/var\/|\/etc\/|C:\\/.test(text)) {
      findings.push({
        severity: 'medium',
        category: 'verbose_error',
        title: 'Internal file path in console error',
        description: 'A console error references internal server file paths.',
        url,
        evidence: text.substring(0, 300),
        confidence: 'high',
      })
    }
  }

  return findings
}
