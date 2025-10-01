/**
 * Mock OpenRouter service for local development
 * Simulates LLM API calls without making real requests
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
} from "openai/resources/chat/completions"
import { DEFAULT_MODEL } from "../openrouter/types"

// Re-export types for convenience
export type OpenRouterMessage = ChatCompletionMessage
export type OpenRouterRequest = ChatCompletionCreateParams
export type OpenRouterResponse = ChatCompletion

/**
 * Mock function to simulate OpenRouter API calls
 */
export async function mockOpenRouterCompletion(
  request: OpenRouterRequest,
): Promise<OpenRouterResponse> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200))

  // Extract the user's message to understand what they're asking for
  const userMessage = request.messages.find((m) => m.role === "user")?.content
  const userContent =
    typeof userMessage === "string"
      ? userMessage
      : Array.isArray(userMessage)
        ? userMessage
            .map((part) =>
              typeof part === "string"
                ? part
                : part.type === "text"
                  ? part.text
                  : "",
            )
            .join(" ")
        : ""

  // Generate appropriate mock response based on the context
  let responseContent: string

  if (userContent.toLowerCase().includes("summarize")) {
    responseContent = generateMockSummary(userContent)
  } else if (userContent.toLowerCase().includes("extract")) {
    responseContent = generateMockExtraction(userContent)
  } else if (userContent.toLowerCase().includes("llms.txt")) {
    responseContent = generateMockLlmsTxt(userContent)
  } else {
    responseContent = generateGenericMockResponse(userContent)
  }

  // If JSON format is requested, wrap in JSON
  if (request.response_format?.type === "json_object") {
    responseContent = JSON.stringify(
      {
        result: responseContent,
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )
  }

  // Calculate mock token counts (rough approximation)
  const promptTokens = request.messages.reduce((acc, msg) => {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? JSON.stringify(msg.content)
          : msg.content
            ? JSON.stringify(msg.content)
            : ""
    return acc + Math.ceil(content.length / 4)
  }, 0)
  const completionTokens = Math.ceil(responseContent.length / 4)

  return {
    id: `mock_completion_${Date.now()}`,
    model: request.model,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: responseContent,
          refusal: null,
        },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    system_fingerprint: undefined,
  }
}

/**
 * Generate a mock summary response
 */
function generateMockSummary(content: string): string {
  const templates = [
    "This page provides a comprehensive overview of the main features and capabilities. Key highlights include improved performance, enhanced user experience, and robust API integration.",
    "The documentation covers essential concepts for getting started with the platform. It emphasizes best practices, common patterns, and troubleshooting guidelines.",
    "This content focuses on technical implementation details and architectural decisions. Important considerations include scalability, security, and maintainability.",
    "The article discusses recent updates and improvements to the system. Notable changes include new API endpoints, performance optimizations, and bug fixes.",
  ]

  // Pick a random template
  const template =
    templates[Math.floor(Math.random() * templates.length)] ?? templates[0]

  if (!template) {
    return "This content provides valuable information and insights."
  }

  // Add some context-specific details if the content mentions specific terms
  const additions: string[] = []

  if (content.includes("API")) {
    additions.push(
      "The API documentation is particularly detailed with examples.",
    )
  }
  if (content.includes("guide") || content.includes("tutorial")) {
    additions.push("Step-by-step tutorials are provided for common use cases.")
  }
  if (content.includes("security")) {
    additions.push("Security best practices are emphasized throughout.")
  }

  return additions.length > 0 ? `${template} ${additions.join(" ")}` : template
}

/**
 * Generate a mock extraction response
 */
function generateMockExtraction(content: string): string {
  return JSON.stringify(
    {
      title: "Mock Page Title",
      mainTopics: [
        "Introduction and Overview",
        "Core Concepts",
        "Implementation Details",
        "Best Practices",
        "Troubleshooting",
      ],
      keyPoints: [
        "Comprehensive documentation coverage",
        "Easy-to-follow examples",
        "Production-ready configurations",
        "Performance optimization tips",
      ],
      codeExamples: 3,
      lastUpdated: new Date(
        Date.now() - Math.random() * 30 * 86400000,
      ).toISOString(),
      estimatedReadTime: "5-7 minutes",
      difficulty: "Intermediate",
    },
    null,
    2,
  )
}

/**
 * Generate mock llms.txt content
 */
function generateMockLlmsTxt(content: string): string {
  return `# Mock Project Documentation

## Overview
This is a mock llms.txt file generated for testing purposes. It provides a structured overview of the project suitable for LLM consumption.

## Key Features
- **Feature A**: Advanced functionality with comprehensive API
- **Feature B**: User-friendly interface with intuitive controls
- **Feature C**: Robust security and authentication system
- **Feature D**: Scalable architecture supporting high loads

## Getting Started

### Installation
\`\`\`bash
npm install mock-package
# or
yarn add mock-package
\`\`\`

### Basic Usage
\`\`\`javascript
import { MockService } from 'mock-package';

const service = new MockService();
await service.initialize();
\`\`\`

## API Reference

### Core Methods
- \`initialize()\`: Set up the service
- \`process(data)\`: Process input data
- \`cleanup()\`: Clean up resources

## Configuration
The service can be configured using environment variables or a configuration file.

### Environment Variables
- \`API_KEY\`: Your API key
- \`BASE_URL\`: API base URL
- \`TIMEOUT\`: Request timeout in milliseconds

## Best Practices
1. Always handle errors appropriately
2. Use connection pooling for better performance
3. Implement proper logging and monitoring
4. Follow security guidelines

## Troubleshooting

### Common Issues
- **Connection errors**: Check network configuration
- **Authentication failures**: Verify API credentials
- **Timeout errors**: Increase timeout values

## Additional Resources
- [Documentation](https://example.com/docs)
- [API Reference](https://example.com/api)
- [Community Forum](https://example.com/forum)

---
Generated: ${new Date().toISOString()}
Version: 1.0.0-mock`
}

/**
 * Generate a generic mock response
 */
function generateGenericMockResponse(content: string): string {
  const responses = [
    "I understand your request. Based on the provided content, here's a comprehensive analysis with actionable insights and recommendations.",
    "After reviewing the material, I've identified several key points that warrant attention. The implementation appears well-structured with room for optimization.",
    "The content has been processed successfully. The analysis reveals important patterns and opportunities for improvement.",
    "Thank you for providing this information. The evaluation shows strong fundamentals with specific areas that could benefit from enhancement.",
  ]

  const response =
    responses[Math.floor(Math.random() * responses.length)] ?? responses[0]
  return response ?? "The content has been analyzed and processed successfully."
}

/**
 * Mock OpenRouter client for drop-in replacement during development
 */
export class MockOpenRouterClient {
  constructor(
    private apiKey: string,
    private baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  async createCompletion(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    return mockOpenRouterCompletion(request)
  }

  async createChatCompletion(
    request: OpenRouterRequest,
  ): Promise<OpenRouterResponse> {
    return mockOpenRouterCompletion(request)
  }

  /**
   * Mock streaming response (returns async generator)
   */
  async *createCompletionStream(
    request: OpenRouterRequest,
  ): AsyncGenerator<string, void, unknown> {
    const response = await mockOpenRouterCompletion(request)
    const content = response.choices[0]?.message.content ?? ""

    // Simulate streaming by yielding chunks
    const chunkSize = 10
    for (let i = 0; i < content.length; i += chunkSize) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      yield content.slice(i, i + chunkSize)
    }
  }

  /**
   * Mock process page content - matches the real client interface
   */
  async processPageContent(
    content: string,
    systemPrompt?: string,
    model: string = DEFAULT_MODEL,
  ): Promise<string> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Return a mock processed version of the content
    // In real usage, this would clean and enhance the markdown
    const lines = content.split("\n")
    const processedLines: string[] = []

    for (const line of lines) {
      // Skip obvious navigation/metadata lines
      if (
        line.includes("Cookie Policy") ||
        line.includes("Terms of Service") ||
        line.includes("Previous Page") ||
        line.includes("Next Page")
      ) {
        continue
      }

      // Keep the line if it has content
      if (line.trim()) {
        processedLines.push(line)
      }
    }

    // Add mock enhancement header
    const enhanced = `# [Processed Document]

${processedLines.join("\n")}

---
_Content processed and optimized for LLM consumption_`

    return enhanced
  }
}

// Export a singleton instance
export const mockOpenRouter = new MockOpenRouterClient("mock_api_key")
