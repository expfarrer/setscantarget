import { describe, it, expect } from 'vitest'
import { runExposureAnalyzer } from '../analyzers/exposure'
import type { AnalyzerContext, NormalizedPRPayload } from '../types'

function makeCtx(files: NormalizedPRPayload['files']): AnalyzerContext {
  return {
    reviewId: 'test-review',
    pr: {
      prUrl: 'https://github.com/test/repo/pull/1',
      repo: 'test/repo',
      number: 1,
      title: 'Test PR',
      author: 'tester',
      headRef: 'feature/test',
      baseRef: 'main',
      checksStatus: 'pass',
      files,
    },
  }
}

describe('runExposureAnalyzer', () => {
  it('detects hardcoded service key in added code', () => {
    const ctx = makeCtx([
      {
        path: 'src/config.ts',
        patch: `@@ -1 +1 @@\n+const apiKey = 'sk-AbCdEfGhIjKlMnOpQrStUvWx'`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/hardcoded-secret')).toBe(true)
    expect(findings.some(f => f.severity === 'high')).toBe(true)
    expect(findings.some(f => f.category === 'security')).toBe(true)
  })

  it('detects removed auth guard', () => {
    const ctx = makeCtx([
      {
        path: 'src/routes.ts',
        patch: `@@ -1,3 +1,2 @@\n const router = Router()\n-router.use(requireAuth)\n+router.get('/data', handler)`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/removed-auth-guard')).toBe(true)
    expect(findings.some(f => f.severity === 'high')).toBe(true)
  })

  it('detects sensitive admin/internal route registration', () => {
    const ctx = makeCtx([
      {
        path: 'src/api.ts',
        patch: `@@ -1 +1 @@\n+router.get('/internal/admin/users', adminHandler)`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/sensitive-route')).toBe(true)
  })

  it('detects auth bypass pattern', () => {
    const ctx = makeCtx([
      {
        path: 'src/middleware.ts',
        patch: `@@ -1 +1 @@\n+const skipAuth = true`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/auth-bypass')).toBe(true)
    expect(findings.some(f => f.severity === 'high')).toBe(true)
  })

  it('detects sensitive console.log', () => {
    const ctx = makeCtx([
      {
        path: 'src/auth.ts',
        patch: `@@ -1 +1 @@\n+console.log('token:', userToken, 'password:', rawPassword)`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/sensitive-console-log')).toBe(true)
  })

  it('does NOT flag auth bypass in test files', () => {
    const ctx = makeCtx([
      {
        path: 'src/__tests__/auth.test.ts',
        patch: `@@ -1 +1 @@\n+const skipAuth = true`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/auth-bypass')).toBe(false)
  })

  it('does NOT flag removed auth guard in spec files', () => {
    const ctx = makeCtx([
      {
        path: 'src/auth.spec.ts',
        patch: `@@ -1,2 +1 @@\n-router.use(requireAuth)\n+router.get('/test', handler)`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings.some(f => f.ruleId === 'exposure/removed-auth-guard')).toBe(false)
  })

  it('returns empty findings for a clean patch', () => {
    const ctx = makeCtx([
      {
        path: 'src/utils.ts',
        patch: `@@ -1 +1 @@\n+export function formatDate(d: Date) { return d.toISOString() }`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings).toHaveLength(0)
  })

  it('returns empty findings when file has no patch', () => {
    const ctx = makeCtx([{ path: 'src/unchanged.ts' }])
    const { findings } = runExposureAnalyzer(ctx)
    expect(findings).toHaveLength(0)
  })

  it('all findings have severity high or medium', () => {
    const ctx = makeCtx([
      {
        path: 'src/auth.ts',
        patch: `@@ -1,2 +1,2 @@\n-router.use(requireAuth)\n+const ADMIN_SECRET = 'sup3r-s3cr3t-key-2024'`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    findings.forEach(f => {
      expect(['high', 'medium']).toContain(f.severity)
    })
  })

  it('exposure findings include evidence filePath', () => {
    const ctx = makeCtx([
      {
        path: 'src/config.ts',
        patch: `@@ -1 +1 @@\n+const apiKey = 'sk-AbCdEfGhIjKlMnOpQrStUvWx'`,
      },
    ])
    const { findings } = runExposureAnalyzer(ctx)
    findings.forEach(f => {
      expect(f.evidence.filePath).toBeTruthy()
    })
  })
})
