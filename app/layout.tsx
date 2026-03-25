import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { version } from '../package.json'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Site Security Review Scanner',
  description: 'Client-side security review tool for authorized testing',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Site Security Review Scanner</h1>
              <p className="text-xs text-gray-500">For authorized testing only</p>
            </div>
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Web Scan
              </a>
              <a
                href="/pr-review"
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                PR Review
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-gray-200 px-6 py-4 mt-8">
          <div className="max-w-6xl mx-auto text-xs text-gray-400 text-center space-y-1">
            <p>
              This tool performs a public-facing client-side review only. It cannot detect server-only secrets unless publicly exposed.
              Missing findings do not mean a site is secure. Use only on authorized targets.
            </p>
            <p className="font-mono">v{version}</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
