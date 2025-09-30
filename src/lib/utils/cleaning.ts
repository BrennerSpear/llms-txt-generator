/**
 * Content cleaning utilities
 * Removes unwanted elements from markdown content
 */

/**
 * Clean markdown content for LLM processing
 */
export function cleanMarkdownContent(markdown: string): string {
  let cleaned = markdown

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "")

  // Remove script tags and content
  cleaned = cleaned.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  )

  // Remove style tags and content
  cleaned = cleaned.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    "",
  )

  // Remove navigation elements (common patterns)
  cleaned = cleaned.replace(
    /#{1,3}\s*(Navigation|Menu|Sidebar|Footer|Header)[\s\S]*?(?=\n#{1,3}\s|$)/gi,
    "",
  )

  // Remove cookie banners and notices
  cleaned = cleaned.replace(
    /.*?(cookie|privacy|gdpr|consent).*?notice.*?\n/gi,
    "",
  )

  // Remove excessive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n")

  // Remove tracking pixels and empty links
  cleaned = cleaned.replace(/\[!\[\]\([^\)]*\)\]\([^\)]*\)/g, "")
  cleaned = cleaned.replace(/!\[\]\([^\)]*\)/g, "")

  // Remove common marketing CTAs
  cleaned = cleaned.replace(
    /.*?(Sign up|Subscribe|Newsletter|Get started for free).*?\n/gi,
    "",
  )

  // Clean up markdown formatting issues
  cleaned = cleaned.replace(/\*{3,}/g, "**") // Fix excessive asterisks
  cleaned = cleaned.replace(/_{3,}/g, "__") // Fix excessive underscores
  cleaned = cleaned.replace(/#{7,}/g, "######") // Limit heading levels

  // Remove duplicate headings
  const lines = cleaned.split("\n")
  const seen = new Set<string>()
  const deduped = []

  for (const line of lines) {
    if (line.startsWith("#")) {
      const normalized = line.toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        deduped.push(line)
      }
    } else {
      deduped.push(line)
    }
  }

  cleaned = deduped.join("\n")

  // Final trim and normalize
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Extract main content from markdown
 * Attempts to identify and extract the primary content area
 */
export function extractMainContent(markdown: string): string {
  const lines = markdown.split("\n")
  const contentLines: string[] = []

  let inMainContent = false
  let contentDepth = 0

  for (const line of lines) {
    // Detect main content markers
    if (
      line.match(
        /^#{1,2}\s*(Introduction|Overview|Getting Started|About|Content|Main|Article)/i,
      )
    ) {
      inMainContent = true
      contentDepth = 0
    }

    // Skip obvious non-content sections
    if (
      line.match(
        /^#{1,3}\s*(Navigation|Menu|Sidebar|Footer|Related|Share|Comments|Advertisement)/i,
      )
    ) {
      inMainContent = false
      continue
    }

    // Track content depth (paragraphs, lists, etc)
    if (inMainContent || contentDepth > 0) {
      if (line.trim().length > 50) {
        contentDepth++
      }

      contentLines.push(line)
    }

    // Consider any substantial paragraph as potential content
    if (!inMainContent && line.trim().length > 100) {
      contentDepth++
      contentLines.push(line)
    }
  }

  // If we didn't find clear main content, return cleaned version of everything
  if (contentLines.length < 10) {
    return cleanMarkdownContent(markdown)
  }

  return contentLines.join("\n")
}

/**
 * Remove redundant metadata from content
 */
export function removeRedundantMetadata(content: string): string {
  // Remove common metadata patterns
  const patterns = [
    /^(Author|By|Written by|Published|Updated|Modified|Tags|Categories|Filed under):.*$/gim,
    /^(Last (updated|modified|changed)|Updated on|Modified on):.*$/gim,
    /^\d+ (min|minute|minutes) read$/gim,
    /^Reading time:.*$/gim,
    /^Share (on|this):.*$/gim,
  ]

  let cleaned = content
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  return cleaned
}

/**
 * Main cleaning pipeline
 */
export function cleanContent(
  markdown: string,
  options: {
    extractMain?: boolean
    removeMetadata?: boolean
  } = {},
): string {
  const { extractMain = false, removeMetadata = true } = options

  let cleaned = markdown

  // Apply cleaning steps
  cleaned = cleanMarkdownContent(cleaned)

  if (extractMain) {
    cleaned = extractMainContent(cleaned)
  }

  if (removeMetadata) {
    cleaned = removeRedundantMetadata(cleaned)
  }

  return cleaned
}
