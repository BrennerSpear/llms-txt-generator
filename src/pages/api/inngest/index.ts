import type { InngestFunction } from "inngest"
import { serve } from "inngest/next"
import { inngest } from "~/lib/inngest/client"

import { assembleArtifacts } from "~/lib/inngest/functions/assembleArtifacts"
import { finalizeJob } from "~/lib/inngest/functions/finalizeJob"
import { handleCrawlCompleted } from "~/lib/inngest/functions/handleCrawlCompleted"
import { handleCrawlPage } from "~/lib/inngest/functions/handleCrawlPage"
import { processUrl } from "~/lib/inngest/functions/processUrl"
// Import all Inngest functions
import { startCrawl } from "~/lib/inngest/functions/startCrawl"

const functions: InngestFunction.Like[] = [
  startCrawl, // F1 - Start domain crawl
  handleCrawlPage, // F2 - Handle incoming page from webhook
  processUrl, // F3 - Process and analyze page content
  handleCrawlCompleted, // F4 - Handle crawl completion
  assembleArtifacts, // F5 - Assemble llms.txt and other artifacts
  finalizeJob, // F6 - Finalize job and update status
]

// Create the Inngest serve handler for Next.js Pages Router
const handler = serve({
  client: inngest,
  functions,
  // Configure for local development
  servePath: "/api/inngest",
  streaming: "allow" as const,
  // These will be read from environment variables:
  // INNGEST_EVENT_KEY - for sending events
  // INNGEST_SIGNING_KEY - for webhook signature verification
})

// Export the handler directly for Pages Router
export default handler
