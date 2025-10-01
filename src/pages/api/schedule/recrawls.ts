import type { NextApiRequest, NextApiResponse } from "next"
import { sendEvent } from "~/lib/inngest/client"

/**
 * API endpoint to manually trigger the schedule recrawls function
 * POST /api/schedule/recrawls
 *
 * This will check all active domains and schedule recrawls for those
 * that are due based on their check_interval_minutes setting.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    // Send the manual trigger event
    await sendEvent("schedule-recrawls/manual", {
      triggeredBy: "api",
      timestamp: new Date().toISOString(),
    })

    return res.status(202).json({
      success: true,
      message: "Schedule recrawls function triggered successfully",
      details:
        "The function will check all active domains and schedule recrawls for those that are due",
    })
  } catch (error) {
    console.error("Error triggering schedule recrawls:", error)
    return res.status(500).json({
      error: "Failed to trigger schedule recrawls",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
