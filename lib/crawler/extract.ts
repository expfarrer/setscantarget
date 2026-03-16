export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = []
  const hrefRegex = /href=["']([^"'#]+)["']/gi
  let match: RegExpExecArray | null

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      links.push(new URL(match[1], baseUrl).href)
    } catch { /* invalid */ }
  }

  return [...new Set(links)]
}

export function extractInlineScripts(html: string): string[] {
  const scripts: string[] = []
  const scriptRegex = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1].trim()
    if (content.length > 0) scripts.push(content)
  }

  return scripts
}

export function extractLinkedScripts(html: string, baseUrl: string): string[] {
  const scripts: string[] = []
  const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      scripts.push(new URL(match[1], baseUrl).href)
    } catch { /* invalid */ }
  }

  return [...new Set(scripts)]
}

export function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || ''
}

export function truncateSnippet(text: string, maxLength = 500): string {
  return text.length <= maxLength ? text : text.substring(0, maxLength) + '…'
}
