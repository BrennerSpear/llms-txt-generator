import { env } from "~/env"

interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenRouterRequest {
  model: string
  messages: OpenRouterMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: "json_object" }
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export class OpenRouterService {
  private apiKey: string
  private baseUrl = "https://openrouter.ai/api/v1/chat/completions"

  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY
  }

  private async makeRequest(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.FIRECRAWL_WEBHOOK_URL, // Required by OpenRouter
        "X-Title": "llms-txt-generator", // Optional but recommended
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<OpenRouterResponse>
  }

  /**
   * Generate a comprehensive overview of the website
   */
  async generateSiteOverview(
    domain: string,
    pages: Array<{ url: string; content?: string }>,
  ): Promise<string> {
    const systemPrompt = `You are an expert web analyst creating comprehensive llms.txt documentation.
Your task is to analyze a website and create a professional overview suitable for LLM consumption.
Focus on clarity, structure, and providing valuable context about the site's purpose and content.`

    const userPrompt = `Create a comprehensive overview for ${domain}.
The site has ${pages.length} pages. Here are some key URLs to understand the site structure:
${pages
  .slice(0, 10)
  .map((p) => `- ${p.url}`)
  .join("\n")}

Generate:
1. A concise site description (2-3 sentences)
2. The main purpose and target audience
3. Key features or services offered
4. Technical implementation notes if relevant

Format as markdown with clear sections.`

    const response = await this.makeRequest({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    return response.choices[0]?.message.content || ""
  }

  /**
   * Summarize a single page's content
   */
  async summarizePage(
    url: string,
    content: string,
    maxLength = 200,
  ): Promise<string> {
    const systemPrompt = `You are creating concise, informative summaries for an llms.txt file.
Focus on the main purpose, key information, and technical details that would be valuable for LLMs.`

    const userPrompt = `Summarize this page from ${url} in ${maxLength} characters or less:

${content.slice(0, 3000)}

Create a single paragraph that captures:
- The page's main purpose
- Key information or features
- Any technical details worth noting

Be concise but informative.`

    const response = await this.makeRequest({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 150,
    })

    return response.choices[0]?.message.content || ""
  }

  /**
   * Categorize pages into logical groups
   */
  async categorizePages(
    pages: Array<{ url: string; title?: string; summary?: string }>,
  ): Promise<Record<string, typeof pages>> {
    const systemPrompt = `You are organizing website pages into logical categories for documentation.
Group pages based on their purpose and content type.`

    const userPrompt = `Categorize these pages into logical groups:
${pages.map((p) => `- ${p.url}${p.title ? ` (${p.title})` : ""}`).join("\n")}

Return a JSON object where keys are category names and values are arrays of URLs.
Use categories like: "Documentation", "API Reference", "Features", "Getting Started", "About", "Legal", etc.

Example format:
{
  "Documentation": ["/docs/guide", "/docs/api"],
  "Features": ["/features/analytics", "/features/security"]
}`

    const response = await this.makeRequest({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    })

    try {
      const categories = JSON.parse(
        response.choices[0]?.message.content || "{}",
      )
      const categorized: Record<string, typeof pages> = {}

      for (const [category, urls] of Object.entries(categories)) {
        if (Array.isArray(urls)) {
          categorized[category] = pages.filter((p) =>
            (urls as string[]).some((url) => p.url.includes(url)),
          )
        }
      }

      return categorized
    } catch {
      // Return a simple categorization if parsing fails
      return { Pages: pages }
    }
  }

  /**
   * Score page importance based on content and position
   */
  async scorePage(
    url: string,
    content: string,
    depth: number,
  ): Promise<number> {
    // Simple heuristic scoring (0-100)
    let score = 50 // Base score

    // Boost for important paths
    if (url === "/" || url.endsWith("/index")) score += 20
    if (url.includes("/docs") || url.includes("/documentation")) score += 15
    if (url.includes("/api")) score += 15
    if (url.includes("/guide") || url.includes("/getting-started")) score += 10
    if (url.includes("/features")) score += 10

    // Penalize deep paths
    score -= depth * 5

    // Penalize utility pages
    if (
      url.includes("/privacy") ||
      url.includes("/terms") ||
      url.includes("/legal")
    )
      score -= 20
    if (url.includes("/404") || url.includes("/error")) score -= 30

    // Content-based scoring
    const contentLength = content.length
    if (contentLength > 5000) score += 10
    if (contentLength > 10000) score += 10

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Generate the complete llms.txt content
   */
  async generateLlmsTxt(
    domain: string,
    pages: Array<{
      url: string
      content: string
      title?: string
    }>,
  ): Promise<string> {
    // Generate site overview
    const overview = await this.generateSiteOverview(domain, pages)

    // Process and summarize each page
    const pagesWithSummaries = await Promise.all(
      pages.map(async (page) => {
        const summary = await this.summarizePage(page.url, page.content)
        const depth = page.url.split("/").length - 3 // Approximate depth
        const score = await this.scorePage(page.url, page.content, depth)

        return {
          ...page,
          summary,
          score,
        }
      }),
    )

    // Sort by score (importance)
    pagesWithSummaries.sort((a, b) => b.score - a.score)

    // Categorize pages
    const categories = await this.categorizePages(pagesWithSummaries)

    // Build the llms.txt content
    const sections: string[] = []

    // Header
    sections.push(`# ${domain}`)
    sections.push("")
    sections.push(overview)
    sections.push("")
    sections.push("---")
    sections.push("")

    // Table of contents
    if (Object.keys(categories).length > 1) {
      sections.push("## Contents")
      sections.push("")
      for (const category of Object.keys(categories)) {
        sections.push(
          `- [${category}](#${category.toLowerCase().replace(/\s+/g, "-")})`,
        )
      }
      sections.push("")
      sections.push("---")
      sections.push("")
    }

    // Category sections
    for (const [category, categoryPages] of Object.entries(categories)) {
      if (categoryPages.length === 0) continue

      sections.push(`## ${category}`)
      sections.push("")

      for (const page of categoryPages) {
        const pagePath = page.url.replace(/^https?:\/\/[^\/]+/, "")
        sections.push(`### ${page.title || pagePath}`)
        sections.push(`**URL:** ${page.url}`)
        sections.push("")
        if (page.summary) {
          sections.push(page.summary)
          sections.push("")
        }
      }

      sections.push("---")
      sections.push("")
    }

    // Footer
    sections.push(`Generated: ${new Date().toISOString()}`)
    sections.push(`Total pages processed: ${pages.length}`)

    return sections.join("\n")
  }
}

// Export singleton instance
export const openRouterService = new OpenRouterService()
