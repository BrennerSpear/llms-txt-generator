import { Firecrawl } from "firecrawl"
import type { CrawlJob, CrawlOptions, CrawlResponse, Document } from "firecrawl"
import { env } from "~/env"
import { mockFirecrawl } from "../mocks/firecrawl"

/**
 * Firecrawl client wrapper that handles mock vs real based on environment
 */
class FirecrawlClient {
  private client: Firecrawl | typeof mockFirecrawl
  private useMock: boolean

  constructor() {
    // Determine if we should use mock
    this.useMock = env.USE_MOCK_SERVICES === true

    if (this.useMock) {
      console.log("[Firecrawl] Using mock service")
      this.client = mockFirecrawl
    } else {
      console.log("[Firecrawl] Using real service")
      this.client = new Firecrawl({
        apiKey: env.FIRECRAWL_API_KEY,
      })
    }
  }

  /**
   * Start a crawl - delegates to mock or real client
   */
  async startCrawl(url: string, params?: CrawlOptions): Promise<CrawlResponse> {
    return await this.client.startCrawl(url, params)
  }

  /**
   * Get crawl status - delegates to mock or real client
   */
  async getCrawlStatus(id: string): Promise<CrawlJob> {
    return await this.client.getCrawlStatus(id)
  }
}

// Export singleton instance
export const firecrawl = new FirecrawlClient()

/**
 * Start a domain crawl with optimized settings
 */
export async function startDomainCrawl(
  domainUrl: string,
  checkIntervalMinutes: number,
  webhookUrl: string,
  maxPages?: number,
): Promise<CrawlResponse> {
  // Calculate maxAge based on check interval
  // Convert minutes to milliseconds, ensure non-negative
  const maxAge = Math.max(0, checkIntervalMinutes * 60_000)

  const result = await firecrawl.startCrawl(domainUrl, {
    scrapeOptions: {
      formats: [
        "markdown",
        {
          type: "changeTracking",
          modes: ["git-diff"],
          tag: process.env.NODE_ENV ?? "production",
        },
      ],
      proxy: "auto",
      maxAge,
    },
    webhook: {
      url: webhookUrl,
      events: ["page", "completed"],
    },
    limit: maxPages, // Optional page limit
  })

  return result
}
