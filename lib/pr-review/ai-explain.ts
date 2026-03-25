import type { PRReviewFindingDraft } from './types'

/**
 * Optional AI enrichment for PR review findings.
 *
 * Only runs when:
 *   - OPENAI_API_KEY is set
 *   - PR_REVIEW_AI_ENABLED=true
 *
 * Failure is non-fatal — deterministic content is always the fallback.
 */

const AI_ENABLED =
  typeof process !== 'undefined' &&
  process.env.PR_REVIEW_AI_ENABLED === 'true' &&
  !!process.env.OPENAI_API_KEY

export async function aiExplainFindings(
  findings: PRReviewFindingDraft[],
  prTitle: string,
): Promise<PRReviewFindingDraft[]> {
  if (!AI_ENABLED || findings.length === 0) return findings

  try {
    const highPriority = findings.filter(f => f.severity === 'high').slice(0, 5)
    if (highPriority.length === 0) return findings

    const prompt = buildPrompt(highPriority, prTitle)
    const enriched = await callOpenAI(prompt)

    if (!enriched) return findings

    // Merge AI explanations back into findings
    return findings.map(f => {
      const match = enriched.find(e => e.ruleId === f.ruleId && e.filePath === f.evidence.filePath)
      if (!match) return f
      return {
        ...f,
        summary: match.summary || f.summary,
        whyFlagged: match.whyFlagged || f.whyFlagged,
        suggestion: match.suggestion || f.suggestion,
      }
    })
  } catch (err) {
    console.warn('[PR Review] AI enrichment failed (non-fatal):', err)
    return findings
  }
}

function buildPrompt(
  findings: PRReviewFindingDraft[],
  prTitle: string,
): string {
  const items = findings.map(f => ({
    ruleId: f.ruleId,
    filePath: f.evidence.filePath,
    category: f.category,
    severity: f.severity,
    snippet: f.evidence.snippet?.slice(0, 200) || '',
  }))

  return `You are a senior software engineer reviewing a GitHub PR titled: "${prTitle}".

For each finding below, improve the summary, whyFlagged, and suggestion fields to be more specific and actionable based on the code snippet provided. Be concise (2-3 sentences each). Return a JSON array.

Findings:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON array with objects: { ruleId, filePath, summary, whyFlagged, suggestion }`
}

async function callOpenAI(
  prompt: string,
): Promise<Array<{ ruleId: string; filePath: string; summary: string; whyFlagged: string; suggestion: string }> | null> {
  const apiKey = process.env.OPENAI_API_KEY!
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) return null

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : (parsed.findings ?? null)
  } catch {
    return null
  }
}
