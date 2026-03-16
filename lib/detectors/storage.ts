import { FindingInput } from '../types'
import { detectSecrets } from './secrets'

const TOKEN_PATTERNS = [
  { regex: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, name: 'JWT' },
  { regex: /Bearer\s+[A-Za-z0-9\-_]{20,}/g, name: 'Bearer Token' },
  { regex: /sk-[A-Za-z0-9]{20,}/g, name: 'API Key' },
]

const SENSITIVE_KEY_PATTERNS = /token|auth|jwt|session|credential|password|secret|key|email|role|permission|userid|user_id/i

export function detectStorageRisks(
  storage: Record<string, string>,
  storageType: 'localStorage' | 'sessionStorage',
  url: string
): FindingInput[] {
  const findings: FindingInput[] = []

  for (const [key, value] of Object.entries(storage)) {
    for (const pattern of TOKEN_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
      if (regex.test(value)) {
        findings.push({
          severity: 'high',
          category: 'storage_risk',
          title: `${pattern.name} found in ${storageType}`,
          description: `A ${pattern.name} was found stored in ${storageType} under key "${key}". Tokens in web storage are accessible by any JavaScript on the page.`,
          url,
          evidence: `${storageType}["${key}"] = "${value.substring(0, 100)}${value.length > 100 ? '…' : ''}"`,
          confidence: 'high',
        })
      }
    }

    if (SENSITIVE_KEY_PATTERNS.test(key) && value.length > 8) {
      const secretFindings = detectSecrets(value, url, `${storageType}["${key}"]`)
      findings.push(...secretFindings)

      if (/password|secret|private/i.test(key)) {
        findings.push({
          severity: 'medium',
          category: 'storage_risk',
          title: `Sensitive key in ${storageType}: "${key}"`,
          description: `The ${storageType} key "${key}" may contain sensitive data accessible to any JavaScript on the page.`,
          url,
          evidence: `${storageType}["${key}"] = "${value.substring(0, 80)}${value.length > 80 ? '…' : ''}"`,
          confidence: 'medium',
        })
      }
    }

    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'object' && parsed !== null) {
        if (SENSITIVE_KEY_PATTERNS.test(Object.keys(parsed).join(' '))) {
          findings.push({
            severity: 'medium',
            category: 'storage_risk',
            title: `Object with sensitive fields in ${storageType}: "${key}"`,
            description: `A JSON object in ${storageType} contains fields that may expose user data or credentials.`,
            url,
            evidence: `${storageType}["${key}"] = ${JSON.stringify(parsed).substring(0, 200)}`,
            confidence: 'medium',
          })
        }
      }
    } catch {
      // Not JSON
    }
  }

  return findings
}
