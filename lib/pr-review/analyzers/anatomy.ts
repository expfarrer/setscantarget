import type { AnalyzerContext, AnalyzerOutput } from '../types'

type FileClass = 'logic' | 'tests' | 'config' | 'noise'

function classifyFile(path: string): FileClass {
  const lower = path.toLowerCase()

  // Test files
  if (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('/__tests__/') ||
    lower.includes('/tests/') ||
    lower.includes('/test/') ||
    lower.endsWith('.test.ts') ||
    lower.endsWith('.test.js') ||
    lower.endsWith('.spec.ts') ||
    lower.endsWith('.spec.js')
  ) {
    return 'tests'
  }

  // Config / infrastructure files
  if (
    lower.includes('/config/') ||
    lower.includes('.config.') ||
    lower.endsWith('.env') ||
    lower.includes('.env.') ||
    lower.endsWith('.json') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.toml') ||
    lower.endsWith('.ini') ||
    lower.endsWith('.properties') ||
    lower.includes('dockerfile') ||
    lower.includes('.docker') ||
    lower.includes('docker-compose')
  ) {
    return 'config'
  }

  // Noise: docs, styles, assets, lock files
  if (
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.css') ||
    lower.endsWith('.scss') ||
    lower.endsWith('.less') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.lock') ||
    lower.includes('package-lock') ||
    lower.includes('yarn.lock') ||
    lower.includes('pnpm-lock') ||
    lower.includes('changelog') ||
    lower.includes('license')
  ) {
    return 'noise'
  }

  // Everything else is logic
  return 'logic'
}

export function runAnatomyAnalyzer(ctx: AnalyzerContext): AnalyzerOutput {
  const files = ctx.pr.files
  if (files.length === 0) {
    return {
      findings: [],
      summaryPatches: {
        anatomy: { logic: 100, tests: 0, config: 0, noise: 0 },
      },
    }
  }

  const counts: Record<FileClass, number> = { logic: 0, tests: 0, config: 0, noise: 0 }
  for (const file of files) {
    counts[classifyFile(file.path)]++
  }

  const total = files.length
  const pct = (n: number) => Math.round((n / total) * 100)

  let logic = pct(counts.logic)
  const tests = pct(counts.tests)
  const config = pct(counts.config)
  const noise = pct(counts.noise)

  // Ensure they sum to 100
  logic = 100 - tests - config - noise

  return {
    findings: [],
    summaryPatches: {
      anatomy: { logic, tests, config, noise },
    },
  }
}
