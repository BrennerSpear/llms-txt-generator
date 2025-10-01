/**
 * Storage path utilities for the artifacts bucket
 *
 * URL Schema:
 * - artifacts/domains/{domain_url}/jobs/{job_id}/llms.txt
 * - artifacts/domains/{domain_url}/jobs/{job_id}/llms-full.txt
 * - artifacts/domains/{domain_url}/jobs/{job_id}/pages/{page_url}_raw.md
 * - artifacts/domains/{domain_url}/jobs/{job_id}/pages/{page_url}_processed.md
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
 * Generate path for llms.txt artifact
 */
export function getLlmsTxtPath(domainUrl: string, jobId: string): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  return `domains/${sanitizedDomain}/jobs/${jobId}/llms.txt`
}

/**
 * Generate path for llms-full.txt artifact
 */
export function getLlmsFullTxtPath(domainUrl: string, jobId: string): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  return `domains/${sanitizedDomain}/jobs/${jobId}/llms-full.txt`
}

/**
 * Generate path for raw page markdown
 */
export function getRawPagePath(
  domainUrl: string,
  jobId: string,
  pageUrl: string,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const sanitizedPageUrl = sanitizeUrlForPath(pageUrl)
  return `domains/${sanitizedDomain}/jobs/${jobId}/pages/${sanitizedPageUrl}_raw.md`
}

/**
 * Generate path for processed page markdown
 */
export function getProcessedPagePath(
  domainUrl: string,
  jobId: string,
  pageUrl: string,
): string {
  const sanitizedDomain = sanitizeUrlForPath(domainUrl)
  const sanitizedPageUrl = sanitizeUrlForPath(pageUrl)
  return `domains/${sanitizedDomain}/jobs/${jobId}/pages/${sanitizedPageUrl}_processed.md`
}
