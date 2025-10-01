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
    console.log("[OpenRouter REAL Client] processPageContent called")
    console.log(`[OpenRouter REAL Client] Model: ${model}`)
    console.log(
      `[OpenRouter REAL Client] API Key: ${this.client.apiKey?.substring(0, 20)}...`,
    )

    const defaultSystemPrompt = `You are a documentation processor. Your task is to clean and enhance markdown content for inclusion in an llms.txt file.

Instructions:
1. Remove unnecessary metadata, navigation elements, and boilerplate
2. Preserve all important technical information
3. Improve structure and clarity where needed
4. Keep code examples intact
5. Maintain markdown formatting
6. Focus on content that would be valuable for an LLM to understand the documentation

Return only the processed markdown content without any additional commentary.`

    console.log("[OpenRouter REAL Client] Making API call to OpenRouter...")

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

    console.log("[OpenRouter REAL Client] API call completed")
    console.log(
      `[OpenRouter REAL Client] Response received: ${response.choices.length} choices`,
    )

    return response.choices[0]?.message?.content ?? content
  }

  /**
   * Evaluate semantic importance of content changes
   * Returns a score from 1-4:
   * 1 = Minor/insignificant (typos, formatting, dates)
   * 2 = Moderate (small content updates, minor corrections)
   * 3 = Significant (new information, meaningful updates)
   * 4 = Major (substantial content changes, new features/sections)
   *
   * NOTE / TODO We should be using structured output here.
   */
  async evaluateChangeImportance(
    contentDiff: string,
    model = "openai/gpt-4o-mini",
  ): Promise<number> {
    const systemPrompt = `You are a content change analyzer. Evaluate the semantic importance of changes shown in a git-style diff.

Score the changes on a scale of 1-4:
- 1: Minor/insignificant (typos, whitespace, formatting, date updates, trivial wording)
- 2: Moderate (small content updates, minor corrections, updated examples)
- 3: Significant (new information, meaningful content updates, structural changes)
- 4: Major (substantial new content, new features/sections, fundamental changes)

Consider:
- Volume of changes
- Type of changes (factual updates vs formatting)
- Impact on documentation meaning
- Value for users/LLMs consuming this content

Return ONLY a single integer (1, 2, 3, or 4). No explanation.`

    const response = await this.createChatCompletion({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Evaluate these changes:\n\n${contentDiff}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 10,
    })

    const scoreText = response.choices[0]?.message?.content?.trim() ?? "2"
    const score = Number.parseInt(scoreText, 10)

    // Validate and clamp to 1-4 range
    if (Number.isNaN(score) || score < 1 || score > 4) {
      console.warn(
        `Invalid change importance score: ${scoreText}, defaulting to 2`,
      )
      return 2
    }

    return score
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

  /**
   * Generate page summary with structured output
   * Returns description (always) and summary (if enough content)
   */
  async generatePageSummary(
    content: string,
    metadata?: {
      title?: string
      description?: string
      [key: string]: unknown
    },
    model = "openai/gpt-4o-mini",
  ): Promise<{ description: string; summary: string }> {
    const prompt = `Analyze this page content and provide:
1. A one-line description (50-100 characters) that captures the essence of the page
2. If there's substantial content, a one-paragraph summary (200-500 characters)

${metadata?.title ? `Page title: ${metadata.title}` : ""}
${metadata?.description ? `Existing description: ${metadata.description}` : ""}

Page content:
${content.substring(0, 8000)} ${content.length > 8000 ? "...[truncated]" : ""}

Return as JSON with "description" and "summary" fields.
If the content is too brief or lacks substance, return empty string for "summary".`

    const response = await this.createChatCompletion({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a documentation summarizer that creates concise, informative descriptions and summaries.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    })

    const result = response.choices[0]?.message?.content
    if (!result) {
      // Fallback if no response
      return {
        description: "Page content",
        summary: "",
      }
    }

    try {
      const parsed = JSON.parse(result) as {
        description?: string
        summary?: string
      }

      // Validate and sanitize the response
      return {
        description: (parsed.description || "Page content").substring(0, 100),
        summary: (parsed.summary || "").substring(0, 500),
      }
    } catch (error) {
      console.error("Failed to parse page summary response:", error)
      // Fallback on parse error
      return {
        description: "Page content",
        summary: "",
      }
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

    console.log("[OpenRouter] USE_MOCK_SERVICES:", env.USE_MOCK_SERVICES)
    console.log("[OpenRouter] NODE_ENV:", env.NODE_ENV)
    console.log("[OpenRouter] useMock result:", this.useMock)

    if (this.useMock) {
      console.log("[OpenRouter] Using mock service")
      this.client = mockOpenRouter
    } else {
      console.log("[OpenRouter] Using real service")
      console.log("[OpenRouter] API Key present:", !!env.OPENROUTER_API_KEY)
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
    console.log(`[OpenRouter] processPageContent called with model: ${model}`)
    console.log(`[OpenRouter] Using ${this.useMock ? "MOCK" : "REAL"} client`)
    console.log(`[OpenRouter] Content length: ${content.length} characters`)

    const result = await this.client.processPageContent(
      content,
      systemPrompt,
      model,
    )

    console.log(
      `[OpenRouter] Processed content length: ${result.length} characters`,
    )
    return result
  }

  /**
   * Evaluate change importance - delegates to mock or real client
   */
  async evaluateChangeImportance(
    contentDiff: string,
    model = "openai/gpt-4o-mini",
  ): Promise<number> {
    console.log(
      `[OpenRouter] evaluateChangeImportance called with model: ${model}`,
    )
    console.log(`[OpenRouter] Using ${this.useMock ? "MOCK" : "REAL"} client`)

    if ("evaluateChangeImportance" in this.client) {
      return await this.client.evaluateChangeImportance(contentDiff, model)
    }

    // Fallback for mock - return a default score of 3 (significant)
    console.log("[OpenRouter] Mock fallback: returning score 3")
    return 3
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

  /**
   * Generate page summary - delegates to mock or real client
   */
  async generatePageSummary(
    content: string,
    metadata?: {
      title?: string
      description?: string
      [key: string]: unknown
    },
    model = "openai/gpt-4o-mini",
  ): Promise<{ description: string; summary: string }> {
    if ("generatePageSummary" in this.client) {
      return await this.client.generatePageSummary(content, metadata, model)
    }
    // Fallback for mock - generate simple summary
    const firstLine = content.split("\n")[0] || "Page content"
    return {
      description: firstLine.substring(0, 100),
      summary: content.length > 500 ? content.substring(0, 500) : "",
    }
  }
}

// Export singleton instance
export const openRouter = new OpenRouterClientWrapper()
