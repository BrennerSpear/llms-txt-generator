import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),

    // Inngest
    INNGEST_EVENT_KEY: z.string().min(1).optional(),
    INNGEST_SIGNING_KEY: z.string().min(1).optional(),

    // Firecrawl
    FIRECRAWL_API_KEY: z.string().min(1).optional(),
    FIRECRAWL_WEBHOOK_SECRET: z.string().min(1).optional(),
    FIRECRAWL_WEBHOOK_URL: z.string().url().optional(),

    // OpenRouter
    OPENROUTER_API_KEY: z.string().min(1).optional(),

    // Feature flags
    USE_MOCK_SERVICES: z
      .string()
      .transform((val) => val === "true")
      .optional(),

    // Vercel (optional)
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    VERCEL_OIDC_TOKEN: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,

    // Inngest
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,

    // Firecrawl
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: process.env.FIRECRAWL_WEBHOOK_SECRET,
    FIRECRAWL_WEBHOOK_URL: process.env.FIRECRAWL_WEBHOOK_URL,

    // OpenRouter
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,

    // Feature flags
    USE_MOCK_SERVICES: process.env.USE_MOCK_SERVICES,

    // Vercel
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
})
