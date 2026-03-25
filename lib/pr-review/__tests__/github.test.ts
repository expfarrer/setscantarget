import { describe, it, expect } from 'vitest'
import { parseGitHubPRUrl } from '../github'

describe('parseGitHubPRUrl', () => {
  it('parses a standard GitHub PR URL', () => {
    expect(parseGitHubPRUrl('https://github.com/owner/repo/pull/42')).toEqual({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
    })
  })

  it('parses URLs with hyphens in owner/repo', () => {
    expect(parseGitHubPRUrl('https://github.com/acme-corp/my-repo/pull/1234')).toEqual({
      owner: 'acme-corp',
      repo: 'my-repo',
      prNumber: 1234,
    })
  })

  it('parses PR number 1', () => {
    const result = parseGitHubPRUrl('https://github.com/org/project/pull/1')
    expect(result.prNumber).toBe(1)
  })

  it('throws on non-GitHub URL', () => {
    expect(() => parseGitHubPRUrl('https://gitlab.com/owner/repo/merge_requests/1')).toThrow(
      /Invalid GitHub PR URL/,
    )
  })

  it('throws on missing pull path', () => {
    expect(() => parseGitHubPRUrl('https://github.com/owner/repo')).toThrow()
  })

  it('throws on non-numeric PR number', () => {
    expect(() => parseGitHubPRUrl('https://github.com/owner/repo/pull/abc')).toThrow()
  })

  it('throws on empty string', () => {
    expect(() => parseGitHubPRUrl('')).toThrow()
  })
})
