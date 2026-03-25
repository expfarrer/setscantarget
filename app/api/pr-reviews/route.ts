import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { parseGitHubPRUrl } from '@/lib/pr-review/github'

const CreateSchema = z.object({
  prUrl: z.string().min(1),
  provider: z.string().optional().default('github'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { prUrl, provider } = parsed.data

    let owner: string, repo: string, prNumber: number
    try {
      const parsed = parseGitHubPRUrl(prUrl)
      owner = parsed.owner
      repo = parsed.repo
      prNumber = parsed.prNumber
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid PR URL' },
        { status: 400 },
      )
    }

    const review = await prisma.pRReview.create({
      data: {
        provider,
        prUrl,
        repoOwner: owner,
        repoName: repo,
        prNumber,
        status: 'pending',
      },
    })

    console.log(`[PR Review] Created ${review.id} for ${prUrl}`)

    return NextResponse.json({ id: review.id, status: review.status }, { status: 201 })
  } catch (error) {
    console.error('[PR Review] Create error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const reviews = await prisma.pRReview.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        prUrl: true,
        repoOwner: true,
        repoName: true,
        prNumber: true,
        status: true,
        title: true,
        author: true,
        overallRisk: true,
        mergeRecommendation: true,
        highRiskCount: true,
        createdAt: true,
      },
    })
    return NextResponse.json(reviews)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
