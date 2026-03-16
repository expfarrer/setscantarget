import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (scan.status !== 'pending') {
      return NextResponse.json({ error: 'Scan already started' }, { status: 409 })
    }

    // Fire and forget — does not block the response
    startScanAsync(id)

    return NextResponse.json({ started: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function startScanAsync(scanId: string) {
  try {
    const { runScan } = await import('@/lib/scanner')
    await runScan(scanId)
  } catch (error) {
    console.error(`Scan ${scanId} crashed:`, error)
  }
}
