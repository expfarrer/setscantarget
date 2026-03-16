import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Site Security Review Scanner',
  description: 'Client-side security review tool for authorized testing',
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
            <nav>
              <a href="/" className="text-sm text-gray-600 hover:text-gray-900">New Scan</a>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-gray-200 px-6 py-4 mt-8">
          <div className="max-w-6xl mx-auto text-xs text-gray-400 text-center">
            This tool performs a public-facing client-side review only. It cannot detect server-only secrets unless publicly exposed.
            Missing findings do not mean a site is secure. Use only on authorized targets.
          </div>
        </footer>
      </body>
    </html>
  )
}
