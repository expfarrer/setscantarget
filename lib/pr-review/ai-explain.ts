/**
 * Optional AI enrichment for PR review findings.
 * Server-only — never imported from client code.
 *
 * Only runs when canUsePRReviewAI() returns true.
 * Failure is always non-fatal — deterministic content is the fallback.
 */
import { canUsePRReviewAI, getPRReviewAIConfig } from './config'
import type { PRReviewFindingDraft } from './types'

export async function aiExplainFindings(
  findings: PRReviewFindingDraft[],
  prTitle: string,
): Promise<PRReviewFindingDraft[]> {
  if (!canUsePRReviewAI() || findings.length === 0) return findings

  try {
    const highPriority = findings.filter(f => f.severity === 'high').slice(0, 5)
    if (highPriority.length === 0) return findings

    const enriched = await callOpenAI(buildPrompt(highPriority, prTitle))
    if (!enriched) return findings

    return findings.map(f => {
      const match = enriched.find(
        e => e.ruleId === f.ruleId && e.filePath === f.evidence.filePath,
      )
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

function buildPrompt(findings: PRReviewFindingDraft[], prTitle: string): string {
  const items = findings.map(f => ({
    ruleId: f.ruleId,
    filePath: f.evidence.filePath,
    category: f.category,
    severity: f.severity,
    // Use only a short snippet in the prompt — avoid sending revealed secrets to OpenAI
    snippet: f.evidence.snippet?.slice(0, 150) ?? '',
  }))

  return `You are a senior software engineer reviewing a GitHub PR titled: "${prTitle}".

For each finding below, improve the summary, whyFlagged, and suggestion fields to be more specific and actionable. Be concise (2-3 sentences each). Return a JSON array only.

Findings:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON array with objects: { ruleId, filePath, summary, whyFlagged, suggestion }`
}

type EnrichedFinding = {
  ruleId: string
  filePath: string
  summary: string
  whyFlagged: string
  suggestion: string
}

async function callOpenAI(prompt: string): Promise<EnrichedFinding[] | null> {
  const { apiKey, model } = getPRReviewAIConfig()

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
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
