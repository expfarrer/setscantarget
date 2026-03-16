import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'better-sqlite3'],
}

export default nextConfig
