import { describe, it, expect } from 'vitest'
import { shouldRedact, redactSnippet, processSnippet } from '../redact'

describe('shouldRedact', () => {
  it('returns true for exposure category', () => {
    expect(shouldRedact('exposure', 'exposure/hardcoded-secret')).toBe(true)
  })

  it('returns true for security category', () => {
    expect(shouldRedact('security', 'security/api-key')).toBe(true)
  })

  it('returns true when ruleId contains "secret"', () => {
    expect(shouldRedact('maintainability', 'maint/secret-value')).toBe(true)
  })

  it('returns true when ruleId contains "token"', () => {
    expect(shouldRedact('naming', 'naming/token-name')).toBe(true)
  })

  it('returns true when ruleId contains "credential"', () => {
    expect(shouldRedact('tests', 'tests/credential-check')).toBe(true)
  })

  it('returns false for non-sensitive category and ruleId', () => {
    expect(shouldRedact('maintainability', 'maint/todo-shortcut')).toBe(false)
  })

  it('returns false for naming category with safe ruleId', () => {
    expect(shouldRedact('naming', 'naming/domain-term-drift')).toBe(false)
  })

  it('returns false for workflow category', () => {
    expect(shouldRedact('workflow', 'workflow/no-reviewer')).toBe(false)
  })
})

describe('redactSnippet', () => {
  it('redacts a bearer token', () => {
    const input = 'headers["Authorization"] = "Bearer abc123xyz789secret"'
    const { redactedSnippet, isRedacted } = redactSnippet(input)
    expect(isRedacted).toBe(true)
    expect(redactedSnippet).toContain('Bearer [REDACTED]')
    expect(redactedSnippet).not.toContain('abc123xyz789secret')
  })

  it('redacts a long hex blob (≥32 chars)', () => {
    const hexBlob = 'a1b2c3d4'.repeat(4) // 32 chars
    const input = `const apiKey = ${hexBlob}`
    const { redactedSnippet, isRedacted } = redactSnippet(input)
    expect(isRedacted).toBe(true)
    expect(redactedSnippet).toContain('[REDACTED]')
    expect(redactedSnippet).not.toContain(hexBlob)
  })

  it('redacts a quoted secret value (≥6 chars)', () => {
    const input = "const password = 'supersecret'"
    const { redactedSnippet, isRedacted } = redactSnippet(input)
    expect(isRedacted).toBe(true)
    expect(redactedSnippet).not.toContain('supersecret')
  })

  it('does not redact benign code with no credential-like patterns', () => {
    const input = 'const name = getUser().displayName'
    const { redactedSnippet, isRedacted } = redactSnippet(input)
    expect(isRedacted).toBe(false)
    expect(redactedSnippet).toBe(input)
  })

  it('does not redact short quoted strings (< 6 chars)', () => {
    // 'abc' is 3 chars — does not meet the 6-char min for the quoted pattern
    const input = "const x = 'abc'"
    const { isRedacted } = redactSnippet(input)
    expect(isRedacted).toBe(false)
  })
})

describe('processSnippet', () => {
  it('returns all-undefined for undefined raw input', () => {
    const result = processSnippet(undefined, 'exposure', 'exposure/hardcoded-secret')
    expect(result.snippet).toBeUndefined()
    expect(result.redactedSnippet).toBeUndefined()
    expect(result.revealedSnippet).toBeUndefined()
    expect(result.isRedacted).toBe(false)
  })

  it('returns raw unchanged for non-redacted category', () => {
    const result = processSnippet('const x = 1', 'maintainability', 'maint/todo')
    expect(result.snippet).toBe('const x = 1')
    expect(result.revealedSnippet).toBeUndefined()
    expect(result.isRedacted).toBe(false)
  })

  it('stores revealed form and redacted snippet when actual redaction occurs', () => {
    const raw = "const token = 'super-secret-token'"
    const result = processSnippet(raw, 'exposure', 'exposure/hardcoded-secret')
    expect(result.isRedacted).toBe(true)
    expect(result.snippet).not.toBe(raw)              // safe/redacted form
    expect(result.revealedSnippet).toBe(raw)           // original preserved
    expect(result.snippet).toContain('[REDACTED]')
  })

  it('does NOT store revealedSnippet when snippet has no redactable patterns (isRedacted=false)', () => {
    // Exposure category but snippet is just code logic, no credentials
    const result = processSnippet('router.delete(requireAuth)', 'exposure', 'exposure/removed-auth-guard')
    expect(result.isRedacted).toBe(false)
    // revealedSnippet must be undefined so canReveal in the DTO stays false
    expect(result.revealedSnippet).toBeUndefined()
    expect(result.snippet).toBe('router.delete(requireAuth)')
  })

  it('snippet column is never the raw bearer token string', () => {
    const raw = 'Authorization: Bearer super-secret-api-key-abcdefg'
    const result = processSnippet(raw, 'security', 'exposure/hardcoded-secret')
    expect(result.snippet).not.toContain('super-secret-api-key-abcdefg')
    expect(result.revealedSnippet).toBe(raw)
  })
})
