#!/usr/bin/env tsx
/**
 * Initialize Supabase storage buckets for local development
 * Run with: pnpm tsx scripts/init-storage.ts
 *
 * This script is idempotent - safe to run multiple times
 */

import { resolve } from "node:path"
// Load env vars before any other imports
import { config } from "dotenv"

// Load .env file
config({ path: resolve(process.cwd(), ".env") })

// Now we can import modules that depend on env vars
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:")
  console.error("  NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗")
  console.error(
    "  SUPABASE_SERVICE_ROLE_KEY:",
    SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗",
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

/**
 * Create a storage bucket if it doesn't exist (idempotent)
 */
async function ensureBucketExists(
  bucketName: string,
  options: {
    public?: boolean
    allowedMimeTypes?: string[]
    fileSizeLimit?: number
  } = {},
): Promise<void> {
  try {
    // Check if bucket exists
    const { data: existingBuckets, error: listError } =
      await supabase.storage.listBuckets()

    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`)
    }

    const bucketExists = existingBuckets?.some((b) => b.name === bucketName)

    if (bucketExists) {
      console.log(`✓ Bucket already exists: ${bucketName}`)
      return
    }

    // Create the bucket
    const { error: createError } = await supabase.storage.createBucket(
      bucketName,
      {
        public: options.public ?? false,
        allowedMimeTypes: options.allowedMimeTypes ?? undefined, // Allow all mime types
        fileSizeLimit: options.fileSizeLimit ?? 52428800, // Default 50MB
      },
    )

    if (createError) {
      // Check if it's a race condition where bucket was created between our check and create
      if (createError.message.includes("already exists")) {
        console.log(
          `✓ Bucket already exists: ${bucketName} (created by another process)`,
        )
        return
      }
      throw new Error(
        `Failed to create bucket ${bucketName}: ${createError.message}`,
      )
    }

    console.log(`✅ Created bucket: ${bucketName}`)
  } catch (error) {
    console.error(`❌ Error handling bucket ${bucketName}:`, error)
    throw error
  }
}

/**
 * Main function to initialize all required storage buckets
 */
async function initializeStorageBuckets(): Promise<void> {
  console.log("🚀 Initializing Supabase storage buckets...")
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log("")

  const buckets = [{ name: "artifacts", public: true }]

  let hasErrors = false

  for (const bucket of buckets) {
    try {
      await ensureBucketExists(bucket.name, { public: bucket.public })
    } catch (error) {
      hasErrors = true
      // Continue with other buckets even if one fails
    }
  }

  if (hasErrors) {
    console.log(
      "\n⚠️  Some buckets could not be created, but existing ones are ready.",
    )
    process.exit(1)
  } else {
    console.log("\n✅ All storage buckets initialized successfully!")
  }
}

// Run if executed directly
// Using import.meta.url to check if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeStorageBuckets()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Unexpected error:", error)
      process.exit(1)
    })
}

export { initializeStorageBuckets, ensureBucketExists }
