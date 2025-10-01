/**
 * OpenRouter type definitions
 * Extends OpenAI types with OpenRouter-specific properties
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
} from "openai/resources/chat/completions"

// Re-export OpenAI types for convenience
export type {
  ChatCompletion as OpenRouterCompletion,
  ChatCompletionCreateParams as OpenRouterCreateParams,
  ChatCompletionMessage as OpenRouterMessage,
}

/**
 * OpenRouter-specific model identifiers
 * These are the most commonly used models available on OpenRouter
 */
export const OPENROUTER_MODELS = {
  // OpenAI Models
  GPT_5: "openai/gpt-5",
  GPT_4O: "openai/gpt-4o",
  GPT_4O_MINI: "openai/gpt-4o-mini",
  GPT_4_TURBO: "openai/gpt-4-turbo",
  GPT_35_TURBO: "openai/gpt-3.5-turbo",

  // Anthropic Models
  CLAUDE_35_SONNET: "anthropic/claude-3.5-sonnet",
  CLAUDE_3_OPUS: "anthropic/claude-3-opus",
  CLAUDE_3_SONNET: "anthropic/claude-3-sonnet",
  CLAUDE_3_HAIKU: "anthropic/claude-3-haiku",

  // Google Models
  GEMINI_PRO: "google/gemini-pro",
  GEMINI_PRO_VISION: "google/gemini-pro-vision",
  GEMINI_15_PRO: "google/gemini-1.5-pro",
  GEMINI_15_FLASH: "google/gemini-1.5-flash",

  // Meta Models
  LLAMA_3_70B: "meta-llama/llama-3-70b-instruct",
  LLAMA_3_8B: "meta-llama/llama-3-8b-instruct",

  // Mistral Models
  MISTRAL_LARGE: "mistral/mistral-large",
  MIXTRAL_8X7B: "mistral/mixtral-8x7b-instruct",

  // Free Models (with rate limits)
  QWEN_2_72B_FREE: "qwen/qwen-2-72b-instruct:free",
  LLAMA_3_8B_FREE: "meta-llama/llama-3-8b-instruct:free",
  GEMINI_FLASH_FREE: "google/gemini-flash-1.5-8b:free",
  PHI_3_MINI_FREE: "microsoft/phi-3-mini-128k-instruct:free",
} as const

export type OpenRouterModel =
  (typeof OPENROUTER_MODELS)[keyof typeof OPENROUTER_MODELS]

/**
 * Default model for OpenRouter client
 */
export const DEFAULT_MODEL = OPENROUTER_MODELS.GPT_5

/**
 * OpenRouter API error response
 */
export interface OpenRouterError {
  error: {
    message: string
    type: string
    code?: string
    param?: string
  }
}

/**
 * OpenRouter-specific headers
 */
export interface OpenRouterHeaders {
  Authorization: string
  "HTTP-Referer"?: string
  "X-Title"?: string
}

/**
 * Content processing options
 */
export interface ContentProcessingOptions {
  model?: OpenRouterModel | string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  extractMain?: boolean
  removeMetadata?: boolean
  enhanceStructure?: boolean
}

/**
 * Page processing result
 */
export interface PageProcessingResult {
  processedContent: string
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  processingTime?: number
}

/**
 * Structured extraction schema
 */
export interface ExtractionSchema {
  type: "object"
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  properties: Record<string, any>
  required?: string[]
}

/**
 * Summary options
 */
export interface SummaryOptions {
  maxLength?: number
  style?: "brief" | "detailed" | "technical"
  focusAreas?: string[]
}
