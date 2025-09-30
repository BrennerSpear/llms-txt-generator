import { createClient } from "@supabase/supabase-js"

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

export const storage = {
  /**
   * Upload content to a Supabase storage bucket
   */
  async upload(bucket: string, path: string, content: string | Buffer) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, content, {
        contentType:
          content instanceof Buffer ? "application/octet-stream" : "text/plain",
        upsert: true,
      })

    if (error) {
      throw new Error(`Failed to upload to ${bucket}/${path}: ${error.message}`)
    }

    return data
  },

  /**
   * Download content from a Supabase storage bucket
   */
  async download(bucket: string, path: string): Promise<Blob | null> {
    const { data, error } = await supabase.storage.from(bucket).download(path)

    if (error) {
      throw new Error(
        `Failed to download from ${bucket}/${path}: ${error.message}`,
      )
    }

    return data
  },

  /**
   * Download text content from a Supabase storage bucket
   */
  async downloadText(bucket: string, path: string): Promise<string> {
    const blob = await this.download(bucket, path)
    if (!blob) {
      throw new Error(`No content found at ${bucket}/${path}`)
    }
    return blob.text()
  },

  /**
   * Get a public URL for a file (requires public bucket or signed URL)
   */
  getPublicUrl(bucket: string, path: string) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)

    return data.publicUrl
  },

  /**
   * Create a signed URL for temporary access to a private file
   */
  async createSignedUrl(bucket: string, path: string, expiresIn = 3600) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) {
      throw new Error(
        `Failed to create signed URL for ${bucket}/${path}: ${error.message}`,
      )
    }

    return data.signedUrl
  },

  /**
   * Delete a file from storage
   */
  async delete(bucket: string, paths: string | string[]) {
    const pathArray = Array.isArray(paths) ? paths : [paths]
    const { error } = await supabase.storage.from(bucket).remove(pathArray)

    if (error) {
      throw new Error(`Failed to delete from ${bucket}: ${error.message}`)
    }
  },

  /**
   * List files in a bucket/folder
   */
  async list(
    bucket: string,
    folder?: string,
    options?: { limit?: number; offset?: number },
  ) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, options)

    if (error) {
      throw new Error(
        `Failed to list files in ${bucket}/${folder || ""}: ${error.message}`,
      )
    }

    return data
  },

  /**
   * Create a bucket if it doesn't exist
   */
  async createBucketIfNotExists(bucketName: string, isPublic = false) {
    const { data: existingBuckets } = await supabase.storage.listBuckets()

    const bucketExists = existingBuckets?.some((b) => b.name === bucketName)

    if (!bucketExists) {
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: isPublic,
        allowedMimeTypes: undefined, // Allow all mime types
        fileSizeLimit: 52428800, // 50MB
      })

      if (error && !error.message.includes("already exists")) {
        throw new Error(
          `Failed to create bucket ${bucketName}: ${error.message}`,
        )
      }
    }
  },
}

// Storage bucket names as constants
export const STORAGE_BUCKETS = {
  ARTIFACTS: "artifacts",
  PAGE_CONTENT: "page-content",
} as const

/**
 * Initialize storage buckets on app startup
 */
export async function initializeStorageBuckets() {
  try {
    await storage.createBucketIfNotExists(STORAGE_BUCKETS.ARTIFACTS, false)
    await storage.createBucketIfNotExists(STORAGE_BUCKETS.PAGE_CONTENT, false)
    console.log("Storage buckets initialized successfully")
  } catch (error) {
    console.error("Failed to initialize storage buckets:", error)
    // Don't throw - app can still function if buckets already exist
  }
}
