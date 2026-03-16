import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildIngestionExport } from '@/lib/exports/ingestion-json'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      findings: {
        select: {
          id: true,
          severity: true,
          category: true,
          title: true,
          description: true,
          url: true,
          assetUrl: true,
          evidence: true,
          confidence: true,
          pageId: true,
          requestId: true,
          createdAt: true,
        },
      },
      pages: {
        select: {
          id: true,
          url: true,
          depth: true,
          statusCode: true,
          contentType: true,
          title: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      requests: {
        select: {
          id: true,
          pageId: true,
          url: true,
          method: true,
          resourceType: true,
          statusCode: true,
          responseHeadersJson: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      },
    },
  })

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  }

  if (scan.status !== 'completed') {
    return NextResponse.json(
      { error: 'Ingestion export is only available for completed scans' },
      { status: 409 }
    )
  }

  const report = buildIngestionExport(scan)

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="scan-ingestion-${id}.json"`,
    },
  })
}
