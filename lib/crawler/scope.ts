import { ScanOptions } from '../types'
import { canonicalizeUrl, getOrigin, isSameOrigin, isDestructiveLink, isSkippableScheme } from '../url'

export class CrawlScope {
  private origin: string
  private options: ScanOptions
  private visited = new Set<string>()
  private queue: Array<{ url: string; depth: number }> = []

  constructor(startUrl: string, options: ScanOptions) {
    this.origin = getOrigin(startUrl)
    this.options = options
  }

  isInScope(url: string): boolean {
    if (isSkippableScheme(url)) return false
    if (this.options.sameOriginOnly && !isSameOrigin(url, this.origin)) return false
    if (this.options.ignoreDestructiveLinks && isDestructiveLink(url)) return false
    return true
  }

  enqueue(url: string, depth: number) {
    if (depth > this.options.maxDepth) return
    if (this.visited.size + this.queue.length >= this.options.maxPages) return

    try {
      const canonical = canonicalizeUrl(url)
      if (this.visited.has(canonical)) return
      if (this.queue.some(q => canonicalizeUrl(q.url) === canonical)) return
      this.queue.push({ url: canonical, depth })
    } catch {
      // Invalid URL
    }
  }

  dequeue(): { url: string; depth: number } | undefined {
    return this.queue.shift()
  }

  markVisited(url: string) {
    this.visited.add(canonicalizeUrl(url))
  }

  isVisited(url: string): boolean {
    try {
      return this.visited.has(canonicalizeUrl(url))
    } catch {
      return false
    }
  }

  get visitedCount(): number {
    return this.visited.size
  }

  get queuedCount(): number {
    return this.queue.length
  }

  hasMore(): boolean {
    return this.queue.length > 0
  }

  withinLimits(): boolean {
    return this.visited.size < this.options.maxPages
  }
}
