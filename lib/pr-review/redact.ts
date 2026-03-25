/**
 * Evidence redaction utilities for PR Review findings.
 *
 * Rules:
 * - Exposure and security category findings are redacted by default.
 * - Redaction replaces likely secret values with [REDACTED].
 * - The full unredacted content is stored separately as revealedSnippet ONLY when actual
 *   redaction occurred (isRedacted === true). When isRedacted is false, revealedSnippet is
 *   undefined — this ensures canReveal in the client DTO is never misleadingly true.
 * - Nothing in the client-facing DTO ever exposes revealedSnippet.
 */

// Categories that require redaction before returning to client
const REDACTED_CATEGORIES = new Set(['exposure', 'security'])

// Patterns that identify secret-like values to replace
const SECRET_PATTERNS: Array<{ pattern: RegExp; placeholder: string }> = [
  // Quoted string values for password/secret/key/token/cvv/card assignments
  {
    pattern: /(['"`])([A-Za-z0-9+/=_\-!@#$%^&*]{6,})(\1)/g,
    placeholder: '[REDACTED]',
  },
  // Bearer tokens in headers/code
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    placeholder: 'Bearer [REDACTED]',
  },
  // Raw hex/base64 blobs ≥ 32 chars that look like secrets
  {
    pattern: /\b[A-Fa-f0-9]{32,}\b/g,
    placeholder: '[REDACTED]',
  },
]

export interface RedactResult {
  redactedSnippet: string
  isRedacted: boolean
}

/**
 * Returns a redacted copy of the snippet.
 * isRedacted is true only when at least one substitution was made.
 */
export function redactSnippet(raw: string): RedactResult {
  let result = raw
  let changed = false

  for (const { pattern, placeholder } of SECRET_PATTERNS) {
    const next = result.replace(pattern, (match) => {
      // Don't redact very short matches or obvious code keywords
      if (match.length < 6) return match
      changed = true
      return placeholder
    })
    result = next
  }

  return { redactedSnippet: result, isRedacted: changed }
}

/**
 * Decides whether a finding's evidence should be redacted
 * based on its category and ruleId.
 */
export function shouldRedact(category: string, ruleId: string): boolean {
  if (REDACTED_CATEGORIES.has(category)) return true
  // Any rule explicitly about secrets
  if (ruleId.includes('secret') || ruleId.includes('credential') || ruleId.includes('token')) return true
  return false
}

/**
 * Processes a raw snippet for storage:
 * - If redaction applies and patterns are matched, stores both redacted (snippet) and
 *   original (revealedSnippet) forms. isRedacted = true.
 * - If redaction applies but nothing was actually replaced, stores the snippet as-is
 *   with isRedacted = false and revealedSnippet = undefined.
 * - If redaction does not apply, returns raw snippet unchanged with isRedacted = false.
 *
 * This ensures canReveal is only true when content was actually obscured.
 */
export function processSnippet(
  raw: string | undefined,
  category: string,
  ruleId: string,
): {
  snippet: string | undefined        // safe form (redacted or plain)
  redactedSnippet: string | undefined
  revealedSnippet: string | undefined
  isRedacted: boolean
} {
  if (!raw) {
    return { snippet: undefined, redactedSnippet: undefined, revealedSnippet: undefined, isRedacted: false }
  }

  if (!shouldRedact(category, ruleId)) {
    return { snippet: raw, redactedSnippet: undefined, revealedSnippet: undefined, isRedacted: false }
  }

  const { redactedSnippet, isRedacted } = redactSnippet(raw)

  if (!isRedacted) {
    // Category requires redaction but no patterns fired — snippet is already safe as-is.
    // Do NOT store revealedSnippet so canReveal stays false.
    return { snippet: raw, redactedSnippet: undefined, revealedSnippet: undefined, isRedacted: false }
  }

  return {
    snippet: redactedSnippet,      // safe form stored in snippet column
    redactedSnippet,               // explicit redacted form for future queries
    revealedSnippet: raw,          // full form, never returned by GET
    isRedacted: true,
  }
}
