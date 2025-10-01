/**
 * Converts minutes to a human-readable format
 * @param minutes - The number of minutes
 * @returns Human-readable time string (e.g., "1 day", "2 hours", "30 minutes")
 */
export function formatMinutesToHuman(minutes: number): string {
  if (minutes === 0) return "0 minutes"

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  const parts: string[] = []

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`)
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  }
  if (mins > 0) {
    parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`)
  }

  return parts.join(", ")
}
