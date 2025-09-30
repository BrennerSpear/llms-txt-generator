import crypto from "node:crypto"

/**
 * Generate a fingerprint for content
 * Used to detect changes between versions
 */
export function generateFingerprint(content: string): string {
  // Normalize content before hashing
  const normalized = normalizeContent(content)

  // Create SHA-256 hash
  const hash = crypto.createHash("sha256")
  hash.update(normalized)

  return hash.digest("hex")
}

/**
 * Calculate similarity score between two pieces of content
 * Returns a value between 0 and 1 (1 = identical)
 */
export function calculateSimilarity(
  content1: string,
  content2: string,
): number {
  // Simple implementation based on Levenshtein distance
  // For production, consider using a more sophisticated algorithm

  if (content1 === content2) return 1.0
  if (!content1 || !content2) return 0.0

  // Normalize content for comparison
  const norm1 = normalizeContent(content1)
  const norm2 = normalizeContent(content2)

  // Calculate based on length difference and common substrings
  const lengthSimilarity =
    1 -
    Math.abs(norm1.length - norm2.length) / Math.max(norm1.length, norm2.length)

  // Simple token-based similarity
  const tokens1 = new Set(norm1.split(/\s+/))
  const tokens2 = new Set(norm2.split(/\s+/))

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)))
  const union = new Set([...tokens1, ...tokens2])

  const jaccardIndex = intersection.size / union.size

  // Combine metrics
  return lengthSimilarity * 0.3 + jaccardIndex * 0.7
}

/**
 * Determine if content has changed enough to warrant processing
 */
export function hasChangedEnough(
  similarityScore: number,
  options: {
    threshold?: number
    minContentLength?: number
  } = {},
): { changed: boolean; reason: string } {
  const { threshold = 0.95, minContentLength = 100 } = options

  // Always consider it changed if similarity is below threshold
  if (similarityScore < threshold) {
    const percentChange = Math.round((1 - similarityScore) * 100)
    return {
      changed: true,
      reason: `Content changed by ${percentChange}%`,
    }
  }

  return {
    changed: false,
    reason: `Content similarity ${Math.round(similarityScore * 100)}% (above ${Math.round(threshold * 100)}% threshold)`,
  }
}

/**
 * Normalize content for comparison
 * Removes insignificant whitespace and formatting
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/^\s+|\s+$/gm, "") // Trim each line
    .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
    .trim()
}
