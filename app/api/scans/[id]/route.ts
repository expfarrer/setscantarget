import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { createdAt: 'asc' }, take: 200 },
        pages: {
          select: {
            id: true, url: true, depth: true, statusCode: true,
            contentType: true, title: true, headersJson: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        findings: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
        requests: {
          select: {
            id: true, url: true, method: true, resourceType: true,
            statusCode: true, responseHeadersJson: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
      },
    })
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(scan)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
