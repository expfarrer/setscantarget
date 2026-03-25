import type { AnalyzerContext, AnalyzerOutput, PRReviewFindingDraft } from '../types'

// Groups of terms that should not coexist to describe the same concept
const DOMAIN_SYNONYM_GROUPS = [
  ['customer', 'client', 'accountuser', 'acctusr', 'account_user'],
  ['user', 'usr', 'member', 'subscriber'],
  ['order', 'purchase', 'transaction'],
  ['product', 'item', 'listing', 'sku'],
  ['payment', 'charge', 'billing'],
]

// Vague abbreviations that degrade readability
const VAGUE_ABBR = /^\+.*\b(tmp|mgr|hlpr|util|proc|res\b|req\b|cb\b|fn\b|val\b|obj\b|idx\b|arr\b|str\b|num\b)\b/

// Boolean naming anti-patterns (not prefixed with is/has/can/should/was)
const BOOL_NAMING = /^\+.*\b(const|let|var)\s+(active|enabled|visible|valid|ready|loaded|done|open|found|exists)\s*=/

// Singular/plural inconsistency — same stem used both ways in patch
function checkSingularPlural(addedLines: string[]): string[] {
  const words = new Set<string>()
  const plurals = new Set<string>()
  for (const line of addedLines) {
    const tokens = line.match(/\b[a-z][a-zA-Z]{3,}\b/g) || []
    for (const token of tokens) {
      const lower = token.toLowerCase()
      words.add(lower)
      if (lower.endsWith('s')) plurals.add(lower)
    }
  }
  const conflicts: string[] = []
  for (const plural of plurals) {
    const singular = plural.slice(0, -1)
    if (words.has(singular) && singular.length > 3) {
      conflicts.push(`${singular}/${plural}`)
    }
  }
  return conflicts.slice(0, 3)
}

function addedLines(patch: string): string[] {
  return patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
}

function patchText(patch: string): string {
  return addedLines(patch).map(l => l.slice(1)).join('\n').toLowerCase()
}

export function runNamingAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const findings: PRReviewFindingDraft[] = []

  // Aggregate all patch text for cross-file synonym detection
  const allPatchText = ctx.pr.files
    .map(f => (f.patch ? patchText(f.patch) : ''))
    .join('\n')

  // 1. Domain synonym drift (across all files)
  for (const group of DOMAIN_SYNONYM_GROUPS) {
    const found = group.filter(term => allPatchText.includes(term))
    if (found.length >= 2) {
      // Find which file introduced the drift
      const fileExamples = ctx.pr.files
        .filter(f => f.patch && found.filter(t => patchText(f.patch!).includes(t)).length >= 2)
        .map(f => f.path)

      const targetFiles = fileExamples.length > 0 ? fileExamples : ctx.pr.files.map(f => f.path)

      findings.push({
        category: 'naming',
        severity: 'medium',
        ruleId: 'naming/domain-term-drift',
        title: 'Naming Consistency Risk',
        summary: `This PR uses multiple terms for the same concept: ${found.map(t => `\`${t}\``).join(', ')}. This creates semantic drift that makes the codebase harder to search and reason about.`,
        whyFlagged: 'Inconsistent domain terminology forces developers to mentally map synonyms, increases the chance of bugs from using the wrong representation, and makes code search unreliable.',
        suggestion: `Align on one term for this concept across the codebase. If a migration is needed, do it in a separate PR. Preferred term should be documented in a glossary or ADR.`,
        evidence: {
          filePath: targetFiles[0] || ctx.pr.files[0]?.path || '',
          snippet: found.join(' / '),
        },
        scoreImpact: 1,
      })
    }
  }

  // 2. Per-file naming checks
  for (const file of ctx.pr.files) {
    if (!file.patch) continue
    const added = addedLines(file.patch)
    if (added.length === 0) continue

    // Vague abbreviations
    const abbrLines = added.filter(l => VAGUE_ABBR.test(l))
    if (abbrLines.length >= 2) {
      findings.push({
        category: 'naming',
        severity: 'low',
        ruleId: 'naming/vague-abbreviations',
        title: 'Reduced Naming Clarity',
        summary: `\`${file.path}\` introduces ${abbrLines.length} variables with vague abbreviated names (e.g., \`tmp\`, \`mgr\`, \`res\`).`,
        whyFlagged: 'Abbreviated variable names reduce readability and force readers to infer intent from context instead of the name itself.',
        suggestion: 'Use descriptive names that communicate intent. Even in tight loops, clarity beats brevity.',
        evidence: {
          filePath: file.path,
          snippet: abbrLines.slice(0, 2).map(l => l.replace(/^\+/, '')).join('\n').trim(),
        },
        scoreImpact: 0,
      })
    }

    // Boolean naming anti-pattern
    const boolLines = added.filter(l => BOOL_NAMING.test(l))
    if (boolLines.length > 0) {
      findings.push({
        category: 'naming',
        severity: 'low',
        ruleId: 'naming/boolean-naming',
        title: 'Variable Meaning Drift',
        summary: `\`${file.path}\` declares boolean-like variables without an \`is\`/\`has\`/\`can\` prefix, making their purpose ambiguous.`,
        whyFlagged: 'Booleans named without a question prefix (isLoaded, hasPermission) are often misread or mistakenly assigned non-boolean values.',
        suggestion: 'Prefix boolean variables with `is`, `has`, `can`, `should`, or `was` to make their intent self-evident.',
        evidence: {
          filePath: file.path,
          snippet: boolLines[0].replace(/^\+/, '').trim(),
        },
        scoreImpact: 0,
      })
    }
  }

  return { findings }
}
