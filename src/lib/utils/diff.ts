import { diffLines } from "diff"
import type { Change } from "diff"

export interface ContentDiff {
  hasChanges: boolean
  additions: number
  deletions: number
  diffText: string
  changePercentage: number
}

/**
 * Generate a git-style diff between two content strings
 * @param oldContent - Previous version of content
 * @param newContent - New version of content
 * @returns ContentDiff object with change metrics
 */
export function generateContentDiff(
  oldContent: string,
  newContent: string,
): ContentDiff {
  // Normalize content before diffing
  const normalizedOld = normalizeForDiff(oldContent)
  const normalizedNew = normalizeForDiff(newContent)

  // Generate line-by-line diff
  const changes: Change[] = diffLines(normalizedOld, normalizedNew)

  // Count additions and deletions
  let additions = 0
  let deletions = 0
  let unchanged = 0

  for (const change of changes) {
    const lineCount = change.value.split("\n").length - 1
    if (change.added) {
      additions += lineCount
    } else if (change.removed) {
      deletions += lineCount
    } else {
      unchanged += lineCount
    }
  }

  // Format as git-style diff
  const diffText = formatDiff(changes)

  // Calculate change percentage
  const totalLines = additions + deletions + unchanged
  const changedLines = additions + deletions
  const changePercentage = totalLines > 0 ? (changedLines / totalLines) * 100 : 0

  return {
    hasChanges: additions > 0 || deletions > 0,
    additions,
    deletions,
    diffText,
    changePercentage,
  }
}

/**
 * Normalize content for consistent diff generation
 */
function normalizeForDiff(content: string): string {
  return (
    content
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\t/g, "  ") // Normalize tabs to spaces
      .trim()
  )
}

/**
 * Format diff changes in git-style output
 */
function formatDiff(changes: Change[]): string {
  let result = ""

  for (const change of changes) {
    if (change.added) {
      result += `+ ${change.value}`
    } else if (change.removed) {
      result += `- ${change.value}`
    } else {
      result += `  ${change.value}`
    }
  }

  return result
}
