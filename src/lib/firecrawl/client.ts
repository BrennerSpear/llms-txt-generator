import { Firecrawl } from "firecrawl"
import { env } from "~/env"

/**
 * Configured Firecrawl client instance
 */
export const firecrawl = new Firecrawl({
  apiKey: env.FIRECRAWL_API_KEY,
})

/**
 * Start a domain crawl with optimized settings
 */
export async function startDomainCrawl(
  domainUrl: string,
  checkIntervalMinutes: number,
  webhookUrl: string,
) {
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
  })

  return result
}
