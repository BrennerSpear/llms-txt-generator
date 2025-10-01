/**
 * OpenRouter client for LLM API calls
 * Uses OpenAI SDK with OpenRouter's base URL
 */

import { OpenAI } from "openai"
import type {
  ChatCompletion,
  ChatCompletionCreateParams,
} from "openai/resources/chat/completions"
import { env } from "~/env"
import { mockOpenRouter } from "../mocks/openrouter"

// Re-export types for convenience
export type OpenRouterRequest = ChatCompletionCreateParams
export type OpenRouterResponse = ChatCompletion

/**
 * OpenRouter client configuration
 */
export class OpenRouterClient {
  private client: OpenAI

  constructor(apiKey?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? env.OPENROUTER_API_KEY,
      baseURL: baseURL ?? "https://openrouter.ai/api/v1",
      defaultHeaders: {
        // Optional: Add site attribution headers if needed
        // "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL,
        // "X-Title": "llms-txt-generator"
      },
    })
  }

  /**
   * Create a chat completion
   */
  async createChatCompletion(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    return (await this.client.chat.completions.create({
      ...request,
      stream: false,
    })) as OpenRouterResponse
  }

  /**
   * Create a streaming chat completion
   */
  async *createChatCompletionStream(
    request: OpenRouterRequest,
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      ...request,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  /**
   * Process page content with OpenRouter
   * This is the main function used by the processUrl Inngest function
   */
  async processPageContent(
    content: string,
    systemPrompt?: string,
    model = "openai/gpt-4o-mini",
  ): Promise<string> {
    const defaultSystemPrompt = `You are a documentation processor. Your task is to clean and enhance markdown content for inclusion in an llms.txt file.

Instructions:
1. Remove unnecessary metadata, navigation elements, and boilerplate
2. Preserve all important technical information
3. Improve structure and clarity where needed
4. Keep code examples intact
5. Maintain markdown formatting
6. Focus on content that would be valuable for an LLM to understand the documentation

Return only the processed markdown content without any additional commentary.`

    const response = await this.createChatCompletion({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt ?? defaultSystemPrompt,
        },
        {
          role: "user",
          content: `Process the following markdown content:\n\n${content}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    })

    return response.choices[0]?.message?.content ?? content
  }

  /**
   * Summarize page content
   */
  async summarizeContent(
    content: string,
    maxLength = 500,
    model = "openai/gpt-4o-mini",
  ): Promise<string> {
    const response = await this.createChatCompletion({
      model,
      messages: [
        {
          role: "system",
          content: `You are a concise summarizer. Create a brief summary of the provided content in ${maxLength} characters or less. Focus on the most important information.`,
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.5,
      max_tokens: Math.ceil(maxLength / 3), // Rough token estimate
    })

    return response.choices[0]?.message?.content ?? ""
  }

  /**
   * Extract structured data from content
   */

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  async extractStructuredData<T = any>(
    content: string,
    schema: string,
    model = "openai/gpt-4o-mini",
  ): Promise<T> {
    const response = await this.createChatCompletion({
      model,
      messages: [
        {
          role: "system",
          content: `You are a data extraction specialist. Extract structured data from the provided content according to this schema: ${schema}. Return only valid JSON.`,
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    })

    const result = response.choices[0]?.message?.content
    if (!result) {
      throw new Error("No response from OpenRouter")
    }

    try {
      return JSON.parse(result) as T
    } catch (error) {
      throw new Error(`Failed to parse OpenRouter response as JSON: ${error}`)
    }
  }
}

/**
 * OpenRouter client wrapper that handles mock vs real based on environment
 */
class OpenRouterClientWrapper {
  private client: OpenRouterClient | typeof mockOpenRouter
  private useMock: boolean

  constructor() {
    // Determine if we should use mock
    this.useMock =
      env.USE_MOCK_SERVICES === true ||
      (env.USE_MOCK_SERVICES !== false && env.NODE_ENV === "development")

    if (this.useMock) {
      console.log("[OpenRouter] Using mock service")
      this.client = mockOpenRouter
    } else {
      console.log("[OpenRouter] Using real service")
      this.client = new OpenRouterClient()
    }
  }

  /**
   * Create a chat completion - delegates to mock or real client
   */
  async createChatCompletion(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    return await this.client.createChatCompletion(request)
  }

  /**
   * Process page content - delegates to mock or real client
   */
  async processPageContent(
    content: string,
    systemPrompt?: string,
    model = "openai/gpt-4o-mini",
  ): Promise<string> {
    return await this.client.processPageContent(content, systemPrompt, model)
  }

  /**
   * Summarize content - only available in real client
   */
  async summarizeContent(
    content: string,
    maxLength = 500,
    model = "openai/gpt-4o-mini",
  ): Promise<string> {
    if ("summarizeContent" in this.client) {
      return await this.client.summarizeContent(content, maxLength, model)
    }
    // Fallback for mock - just truncate
    return content.substring(0, maxLength)
  }

  /**
   * Extract structured data - only available in real client
   */

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  async extractStructuredData<T = any>(
    content: string,
    schema: string,
    model = "openai/gpt-4o-mini",
  ): Promise<T> {
    if ("extractStructuredData" in this.client) {
      return await this.client.extractStructuredData(content, schema, model)
    }
    // Fallback for mock
    return {} as T
  }
}

// Export singleton instance
export const openRouter = new OpenRouterClientWrapper()
