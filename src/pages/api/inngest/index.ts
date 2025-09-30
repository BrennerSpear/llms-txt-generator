import type { InngestFunction } from "inngest"
import { serve } from "inngest/next"
import { inngest } from "~/lib/inngest/client"

// Import all Inngest functions here as they're created
// For now, we'll create a placeholder array that will be populated
// as we implement the functions in subsequent steps

// Temporarily type as any[] until we have actual functions
const functions: InngestFunction.Like[] = [
  // startCrawl,         // F1 - will be imported from '~/lib/inngest/functions/startCrawl'
  // handleCrawlPage,    // F2 - will be imported from '~/lib/inngest/functions/handleCrawlPage'
  // processUrl,         // F3 - will be imported from '~/lib/inngest/functions/processUrl'
  // handleCrawlCompleted, // F4 - will be imported from '~/lib/inngest/functions/handleCrawlCompleted'
  // assembleArtifacts,  // F5 - will be imported from '~/lib/inngest/functions/assembleArtifacts'
  // finalizeJob,        // F6 - will be imported from '~/lib/inngest/functions/finalizeJob'
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
