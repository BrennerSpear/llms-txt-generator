/**
 * Storage path utilities for the artifacts bucket
 *
 * URL Schema:
 * - artifacts/domains/{domain_url}/jobs/{date_time_job_id}/llms.txt
 * - artifacts/domains/{domain_url}/jobs/{date_time_job_id}/llms-full.txt
 * - artifacts/domains/{domain_url}/jobs/{date_time_job_id}/pages/{page_url}_raw.md
 * - artifacts/domains/{domain_url}/jobs/{date_time_job_id}/pages/{page_url}_processed.md
 */

/**
 * Sanitize URL for use in storage paths
 * Replaces '.' and other special characters with '_'
 */
export function sanitizeUrlForPath(url: string): string {
  // Remove protocol if present
  const urlWithoutProtocol = url.replace(/^https?:\/\//, "")
  // Replace dots and special characters with underscores
  return urlWithoutProtocol.replace(/[^a-z0-9]/gi, "_").toLowerCase()
}

/**
 * Format date to human-readable format for storage paths
 * Example: "jan_16_2025_23_59"
 */
export function formatDateForPath(date: Date): string {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ]

  const month = months[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")

  return `${month}_${day}_${year}_${hours}_${minutes}`
}

/**
 * Create job folder name with human-readable date
 * Example: "jan_16_2025_23_59_uuid-123"
 */
export function createJobFolderName(jobId: string, startedAt: Date): string {
  const dateStr = formatDateForPath(startedAt)
  // Take first 8 characters of UUID for brevity
  const shortId = jobId.split("-")[0]
  return `${dateStr}_${shortId}`
}

/**
 * Generate path for llms.txt artifact
 */
export function getLlmsTxtPath(
  domainUrl: string,
  jobId: string,
  startedAt: Date,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const jobFolder = createJobFolderName(jobId, startedAt)
  return `domains/${sanitizedDomain}/jobs/${jobFolder}/llms.txt`
}

/**
 * Generate path for llms-full.txt artifact
 */
export function getLlmsFullTxtPath(
  domainUrl: string,
  jobId: string,
  startedAt: Date,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const jobFolder = createJobFolderName(jobId, startedAt)
  return `domains/${sanitizedDomain}/jobs/${jobFolder}/llms-full.txt`
}

/**
 * Generate path for raw page markdown
 */
export function getRawPagePath(
  domainUrl: string,
  jobId: string,
  startedAt: Date,
  pageUrl: string,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const sanitizedPageUrl = sanitizeUrlForPath(pageUrl)
  const jobFolder = createJobFolderName(jobId, startedAt)
  return `domains/${sanitizedDomain}/jobs/${jobFolder}/pages/${sanitizedPageUrl}_raw.md`
}

/**
 * Generate path for processed page markdown
 */
export function getProcessedPagePath(
  domainUrl: string,
  jobId: string,
  startedAt: Date,
  pageUrl: string,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const sanitizedPageUrl = sanitizeUrlForPath(pageUrl)
  const jobFolder = createJobFolderName(jobId, startedAt)
  return `domains/${sanitizedDomain}/jobs/${jobFolder}/pages/${sanitizedPageUrl}_processed.md`
}
