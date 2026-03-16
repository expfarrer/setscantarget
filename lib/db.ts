import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  // Strip "file:" prefix if present
  const dbPath = rawUrl.startsWith('file:')
    ? rawUrl.slice(5)
    : rawUrl

  // Resolve relative paths from project root
  const resolvedPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.join(process.cwd(), dbPath)

  const adapter = new PrismaBetterSqlite3({ url: resolvedPath })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
