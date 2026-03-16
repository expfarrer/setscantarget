import { prisma } from '../db'

export async function log(scanId: string, level: 'info' | 'warn' | 'error', message: string) {
  try {
    await prisma.scanLog.create({ data: { scanId, level, message } })
  } catch {
    // Don't crash scanner if logging fails
  }
}
