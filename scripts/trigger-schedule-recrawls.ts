#!/usr/bin/env tsx

/**
 * Script to manually trigger the schedule recrawls function
 * Usage: pnpm tsx scripts/trigger-schedule-recrawls.ts
 */

const API_URL = process.env.API_URL || "http://localhost:3000"

async function triggerScheduleRecrawls() {
  console.log(
    `🔄 Triggering schedule recrawls at ${API_URL}/api/schedule/recrawls`,
  )

  try {
    const response = await fetch(`${API_URL}/api/schedule/recrawls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`❌ Failed with status ${response.status}:`, data)
      process.exit(1)
    }

    console.log("✅ Success:", data)
    console.log(
      "\n📝 Check Inngest dashboard to monitor the function execution",
    )
  } catch (error) {
    console.error("❌ Error triggering schedule recrawls:", error)
    process.exit(1)
  }
}

// Run the script
triggerScheduleRecrawls()
