/**
 * Server-only config for PR Review AI enrichment.
 *
 * Never import this file from client-side code.
 * Never forward these values to the client via API responses.
 *
 * Usage:
 *   import { canUsePRReviewAI, getPRReviewAIConfig } from '@/lib/pr-review/config'
 *
 * To enable AI enrichment, add to .env.local:
 *   OPENAI_API_KEY=sk-...
 *   PR_REVIEW_AI_ENABLED=true
 *
 * Both must be set. If either is missing, AI enrichment is silently skipped.
 */

export interface PRReviewAIConfig {
  enabled: boolean
  apiKey: string
  model: string
}

/**
 * Returns true only when both the API key and the explicit enable flag are set.
 * Safe to call at runtime — will not throw if env vars are absent.
 */
export function canUsePRReviewAI(): boolean {
  return (
    process.env.PR_REVIEW_AI_ENABLED === 'true' &&
    typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.length > 0
  )
}

/**
 * Returns the full AI config for use by the enrichment layer.
 * Throws if called when AI is not configured — always guard with canUsePRReviewAI().
 */
export function getPRReviewAIConfig(): PRReviewAIConfig {
  if (!canUsePRReviewAI()) {
    throw new Error('PR Review AI is not configured. Set OPENAI_API_KEY and PR_REVIEW_AI_ENABLED=true.')
  }
  return {
    enabled: true,
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.PR_REVIEW_AI_MODEL ?? 'gpt-4o-mini',
  }
}
