'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface NavItem {
  href: string
  label: string
  soon?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/',          label: 'Web Scan' },
  { href: '/pr-review', label: 'PR Review' },
  { href: '/history',   label: 'History',  soon: true },
  { href: '/settings',  label: 'Settings', soon: true },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map(item => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)

        if (item.soon) {
          return (
            <span
              key={item.href}
              className="px-3 py-1.5 text-sm text-gray-300 cursor-default select-none"
              title="Coming soon"
            >
              {item.label}
            </span>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isActive
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
