import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const review = await prisma.pRReview.findUnique({ where: { id } })
    if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (review.status !== 'pending') {
      return NextResponse.json({ error: 'Review already started' }, { status: 409 })
    }

    // Fire and forget — mirrors the scan start pattern
    startReviewAsync(id)

    return NextResponse.json({ ok: true, status: 'running' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function startReviewAsync(reviewId: string) {
  try {
    const { runPRReview } = await import('@/lib/pr-review/run-pr-review')
    await runPRReview(reviewId)
  } catch (error) {
    console.error(`[PR Review] ${reviewId} crashed:`, error)
  }
}
