import type { NormalizedPRPayload, NormalizedPRFile } from './types'

export interface GitHubParsedURL {
  owner: string
  repo: string
  prNumber: number
}

export function parseGitHubPRUrl(url: string): GitHubParsedURL {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) throw new Error('Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123')
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) }
}

export async function fetchGitHubPR(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<NormalizedPRPayload> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`
  const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`
  const checksUrl = `https://api.github.com/repos/${owner}/${repo}/commits`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const [prRes, filesRes] = await Promise.all([
      fetch(prUrl, { headers, signal: controller.signal }),
      fetch(filesUrl, { headers, signal: controller.signal }),
    ])

    if (!prRes.ok) {
      const body = await prRes.json().catch(() => ({}))
      const msg = (body as { message?: string }).message || prRes.statusText
      throw new Error(`GitHub API error ${prRes.status}: ${msg}`)
    }

    const [prData, filesData] = await Promise.all([
      prRes.json() as Promise<GitHubPRResponse>,
      filesRes.ok ? (filesRes.json() as Promise<GitHubFileResponse[]>) : Promise.resolve([] as GitHubFileResponse[]),
    ])

    // Fetch commit check-runs for the head SHA
    let checksStatus: NormalizedPRPayload['checksStatus'] = 'unknown'
    try {
      const headSha = prData.head?.sha
      if (headSha) {
        const checkRunsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
          { headers, signal: controller.signal },
        )
        if (checkRunsRes.ok) {
          const checkRunsData = await checkRunsRes.json() as { check_runs: Array<{ conclusion: string | null; status: string }> }
          const runs = checkRunsData.check_runs ?? []
          if (runs.length === 0) {
            checksStatus = 'unknown'
          } else if (runs.some(r => r.conclusion === 'failure')) {
            checksStatus = 'fail'
          } else if (runs.some(r => r.conclusion === 'neutral' || r.status !== 'completed')) {
            checksStatus = 'warn'
          } else {
            checksStatus = 'pass'
          }
        }
      }
    } catch {
      checksStatus = 'unknown'
    }

    const files: NormalizedPRFile[] = filesData.map(f => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }))

    const reviewerAssigned =
      Array.isArray(prData.requested_reviewers) && prData.requested_reviewers.length > 0

    return {
      prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      repo: `${owner}/${repo}`,
      number: prNumber,
      title: prData.title || '',
      author: prData.user?.login || '',
      headRef: prData.head?.ref || '',
      baseRef: prData.base?.ref || '',
      checksStatus,
      reviewerAssigned,
      updatedAt: prData.updated_at,
      files,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// GitHub API response shapes (only fields we use)
// ---------------------------------------------------------------------------

interface GitHubPRResponse {
  title: string
  user: { login: string }
  head: { ref: string; sha: string }
  base: { ref: string }
  updated_at: string
  requested_reviewers: unknown[]
}

interface GitHubFileResponse {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}
