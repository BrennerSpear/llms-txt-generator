/**
 * Supabase Storage URL utilities
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

/**
 * Constructs a full Supabase storage URL from a blob path
 * @param path - The blob path (e.g., "jobs/123/raw/page_123.md")
 * @param bucket - The storage bucket name (default: "artifacts")
 * @returns Full Supabase storage URL
 */
export function getStorageUrl(path: string, bucket = "artifacts"): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Downloads a file from a Supabase storage URL
 * @param blobUrl - The full Supabase storage URL
 * @param filename - The filename to save as
 */
export async function downloadFile(
  blobUrl: string,
  filename: string,
): Promise<void> {
  try {
    // Fetch the file content from the blob URL
    const response = await fetch(blobUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`)
    }

    // Create a blob from the response
    const blob = await response.blob()

    // Create a temporary URL for the blob
    const url = window.URL.createObjectURL(blob)

    // Create and trigger download link
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error("Failed to download file:", error)
    throw new Error("Failed to download file. Please try again.")
  }
}

/**
 * Opens a file in a new tab
 * @param blobUrl - The full Supabase storage URL
 */
export function viewFile(blobUrl: string): void {
  window.open(blobUrl, "_blank")
}
