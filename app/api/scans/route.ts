import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizeUrl, isValidUrl, getOrigin } from '@/lib/url'
import { defaultScanOptions, ScanOptions } from '@/lib/types'

const CreateScanSchema = z.object({
  targetUrl: z.string().min(1),
  options: z.object({}).passthrough().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateScanSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    let normalizedUrl: string
    try {
      normalizedUrl = normalizeUrl(parsed.data.targetUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    if (!isValidUrl(normalizedUrl)) {
      return NextResponse.json({ error: 'URL must use http or https' }, { status: 400 })
    }

    const options: ScanOptions = { ...defaultScanOptions, ...(parsed.data.options || {}) }

    const scan = await prisma.scan.create({
      data: {
        targetUrl: normalizedUrl,
        normalizedOrigin: getOrigin(normalizedUrl),
        optionsJson: JSON.stringify(options),
        status: 'pending',
      },
    })

    return NextResponse.json({ id: scan.id }, { status: 201 })
  } catch (error) {
    console.error('Create scan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, targetUrl: true, status: true, startedAt: true, finishedAt: true,
        pagesScanned: true, findingsCount: true, highCount: true, mediumCount: true,
        lowCount: true, infoCount: true, createdAt: true,
      },
    })
    return NextResponse.json(scans)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
