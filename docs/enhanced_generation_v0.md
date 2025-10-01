# Enhanced Page Processing and llms.txt Generation Specification

## Overview

This specification describes improvements to the page processing pipeline and llms.txt generation system, focusing on:
1. Extracting and storing page titles and descriptions from Firecrawl metadata
2. Generating AI-powered page summaries
3. Improving llms.txt and llms-full.txt generation with structured content


## 1. Page Title and Summary Generation

### 1.1 Database Schema Updates

Add the following columns to the `PageVersion` table:

```prisma
model PageVersion {
  // ... existing fields ...

  // New metadata fields
  page_title       String?   // Title from Firecrawl metadata or AI-generated
  page_description String?   // One-line description (always generated)
  page_summary     String?   // One paragraph summary (generated if enough content)

  // ... rest of existing fields ...
}
```

### 1.2 Firecrawl Metadata Extraction

#### Current State
- Firecrawl sends `title` and `description` in the webhook payload
- These fields are currently ignored

#### New Implementation
In `handleCrawlPage` function:
```typescript
// Extract metadata from Firecrawl webhook
const pageMetadata = {
  title: data.metadata?.title || null,
  description: data.metadata?.description || null,
  // Pass to processUrl event
}
```

### 1.3 AI-Powered Summary Generation

#### Input
- Cleaned page content (after `cleanContent()` function)
- Firecrawl metadata (if available)

#### Output Structure
```typescript
interface PageSummaryResponse {
  description: string;  // Always present: one-line description (50-100 chars)
  summary: string;      // Sometimes empty: one paragraph summary (200-500 chars)
}
```

#### OpenRouter Integration

New method in `openRouterService`:

```typescript
async generatePageSummary(content: string, metadata?: {
  title?: string;
  description?: string;
}): Promise<PageSummaryResponse> {
  const prompt = `
    Analyze this page content and provide:
    1. A one-line description (50-100 characters) that captures the essence of the page
    2. If there's substantial content, a one-paragraph summary (200-500 characters)

    ${metadata?.title ? `Page title: ${metadata.title}` : ''}
    ${metadata?.description ? `Existing description: ${metadata.description}` : ''}

    Page content:
    ${content}

    Return as JSON with "description" and "summary" fields.
    If the content is too brief or lacks substance, return empty string for "summary".
  `;

  // Use structured output with JSON schema
  return await this.client.chat.completions.create({
    model: "gpt-4o-mini", // Fast, cheap model for summaries
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "page_summary",
        schema: {
          type: "object",
          properties: {
            description: { type: "string", minLength: 1, maxLength: 100 },
            summary: { type: "string", maxLength: 500 }
          },
          required: ["description", "summary"]
        }
      }
    }
  });
}
```

### 1.4 Integration into processUrl Function

Modified flow to match current implementation with new summary generation:

```typescript
async function processUrl(event) {
  // Step 1: Get context (domain, job info) - EXISTING

  // Step 2: Clean content - EXISTING
  const cleanedContent = await step.run("clean-content", async () => {
    return cleanContent(rawContent, {
      extractMain: true,
      removeMetadata: true,
    });
  });

  // Step 3: Generate diff with previous version - EXISTING
  const diffAnalysis = await step.run("generate-diff", async () => {
    // Get previous version, generate diff
    // Returns: { isNew, diff, previousVersionId }
  });

  // Step 4: Check if content changed - early exit if no changes - EXISTING
  if (!diffAnalysis.isNew && diffAnalysis.diff && !diffAnalysis.diff.hasChanges) {
    // Store unchanged content, create version with semanticImportance: null
    // Skip remaining steps
    return { skipped: true };
  }

  // Step 4.5: Generate page summary (NEW - ADD HERE)
  const pageSummary = await step.run("generate-page-summary", async () => {
    const summaryData = await openRouter.generatePageSummary(
      cleanedContent,
      event.data.metadata,  // Pass Firecrawl metadata if available
      domainInfo.openrouter_model || "openai/gpt-4o-mini"
    );

    return {
      title: event.data.metadata?.title || extractTitleFromContent(cleanedContent),
      description: summaryData.description,
      summary: summaryData.summary
    };
  });

  // Step 5: Evaluate semantic importance of changes - EXISTING
  const semanticAnalysis = await step.run("evaluate-change-importance", async () => {
    // Returns score 1-4
  });

  // Step 6: Conditional enhancement based on semantic importance - EXISTING
  let processedContent = null;
  if (semanticAnalysis.score >= 2) {
    processedContent = await step.run("enhance-content", async () => {
      // Enhance with OpenRouter
    });
  }

  // Step 7: Store content to storage - EXISTING

  // Step 8: Create page version record - MODIFY
  const pageVersion = await step.run("create-page-version", async () => {
    return await db.page.createVersion({
      pageId,
      jobId,
      url,
      rawMdBlobUrl: storagePaths.rawPath,
      htmlMdBlobUrl: storagePaths.processedPath,
      changeStatus,
      reason: semanticAnalysis.reason,
      semanticImportance: semanticAnalysis.score,
      // NEW fields
      pageTitle: pageSummary.title,
      pageDescription: pageSummary.description,
      pageSummary: pageSummary.summary,
    });
  });

  // Steps 9-11: Update last known version, increment counters, emit event - EXISTING
}
```

## 2. Enhanced llms.txt Generation

### 2.1 Data Collection

When generating llms.txt, collect all page data including new fields:

```typescript
interface PageData {
  url: string;
  title: string;        // From page_title field
  description: string;  // From page_description field
  summary?: string;     // From page_summary field (if exists)
  rawContent: string;   // From Supabase storage
}
```

### 2.2 llms.txt Format Generation

#### Prompt Template

```typescript
const llmsTxtPrompt = `
Format the following website content according to the llms.txt specification.

Current page being formatted:
URL: ${currentPage.url}
Title: ${currentPage.title}
Raw content:
${currentPage.rawContent}

Other pages on this site (for context):
${otherPages.map(p => `
- Title: ${p.title}
  URL: ${p.url}
  Description: ${p.description}
  ${p.summary ? `Summary: ${p.summary}` : ''}
`).join('\n')}

Output format requirements:
1. Start with main title using #
2. Add description using > quote syntax
3. Include relevant details in plain text
4. Create ## sections for major topics
5. Use - [Link title](url) format for links
6. Optional sections at the end

Example format:
# Page Title

> One-line description goes here

Key details and context about the page content.

## Main Section

- [Related Page](https://example.com/page): Brief description
- [Another Page](https://example.com/other): Description

## Optional

- [Additional Resource](https://example.com/resource)

Generate the llms.txt content following this exact structure.
`;
```

### 2.3 llms-full.txt Generation

The full version includes:
- All pages (not just changed ones)
- Complete summaries
- Detailed categorization
- Full content excerpts where relevant

```typescript
async function generateLlmsFullTxt(pages: PageData[]): Promise<string> {
  // Group pages by category (using AI categorization)
  const categorized = await categorizePagesWithAI(pages);

  // Generate comprehensive document
  let fullContent = `# ${domain.name} - Complete Documentation\n\n`;
  fullContent += `> ${await generateSiteOverview(pages)}\n\n`;

  for (const category of categorized) {
    fullContent += `## ${category.name}\n\n`;

    for (const page of category.pages) {
      fullContent += `### [${page.title}](${page.url})\n\n`;
      fullContent += `> ${page.description}\n\n`;

      if (page.summary) {
        fullContent += `${page.summary}\n\n`;
      }

      // Include key excerpts from raw content
      const keyExcerpts = await extractKeyExcerpts(page.rawContent);
      if (keyExcerpts.length > 0) {
        fullContent += `Key Points:\n`;
        keyExcerpts.forEach(excerpt => {
          fullContent += `- ${excerpt}\n`;
        });
        fullContent += '\n';
      }
    }
  }

  return fullContent;
}
```

## 3. Implementation Pipeline

### Phase 1: Database and Storage (~30 mins)
1. ✅ Update Prisma schema with new fields (page_title, page_description, page_summary)
2. Run migration: `pnpm db:generate && pnpm db:push`
3. Update TypeScript types in db layer

### Phase 2: OpenRouter Client (~45 mins)
1. ✅ Re-implement `generatePageSummary` method with structured JSON output
2. Add method to wrapper class for mock support
3. Test with sample content

### Phase 3: Event System & Metadata Extraction (~45 mins)
1. Update event types to include metadata field
2. Modify `handleCrawlPage` to pass metadata in event
3. Update `processUrl` to receive and use metadata

### Phase 4: Summary Generation Integration (~1 hour)
1. Add summary generation step to `processUrl` (after cleaning, before/after diff)
2. Store summaries in PageVersion record
3. Handle case when no changes detected (still generate summaries)
4. Test with real crawl data

### Phase 5: llms.txt Generation Enhancement (~1.5 hours)
1. Update data fetching to include new fields
2. Implement new prompt template using titles/descriptions
3. Modify `generateLlmsTxt` to use structured page data
4. Update `generateLlmsFullTxt` for comprehensive output

### Phase 6: Testing and Optimization (~1 hour)
1. Integration tests for full pipeline
2. Verify AI response quality matches FastHTML example
3. Optimize prompts based on output
4. Performance testing with large sites

## 4. Important Design Decisions

### When Summary Generation Happens
- **Always generate summaries**: Even for unchanged pages (semantic_importance = null) to ensure metadata
- **Placement in pipeline**: After cleaning, can be before or after diff generation
- **Cost consideration**: Use cheapest model (gpt-4o-mini) since this runs for every page

### Separation of Concerns
- **Summary Generation**: Cheap, always runs, provides metadata (title, description, summary)
- **Content Enhancement**: Expensive, only runs when semantic_importance >= 2
- **This separation optimizes costs** while ensuring all pages have useful metadata

### Handling Edge Cases
- **No Firecrawl metadata**: Extract title from content or use URL
- **No changes detected**: Still generate and store summaries for consistency
- **Empty content**: Return minimal description, empty summary

## 5. Configuration and Settings

### Environment Variables
No new environment variables required - uses existing OpenRouter configuration.

### AI Model Selection
- **Summary Generation**: `gpt-4o-mini` (fast, cheap)
- **llms.txt Formatting**: `gpt-4o` or `claude-3.5-sonnet` (quality)
- **Categorization**: `gpt-4o-mini` (structural understanding)

### Cost Optimization
- Cache summaries in database (one-time generation)
- Skip summary regeneration for unchanged pages
- Use cheaper models for simple tasks
- Batch API calls where possible

## 5. Migration Strategy

### For Existing Data
1. Run one-time migration script to:
   - Extract titles from existing content
   - Generate descriptions/summaries for existing PageVersions
   - Backfill database fields

### Script Location
`scripts/migrate-page-summaries.ts`

```typescript
async function migrateExistingSummaries() {
  const pageVersions = await prisma.pageVersion.findMany({
    where: {
      page_description: null,
      page_summary: null
    }
  });

  for (const pv of pageVersions) {
    const rawContent = await fetchFromSupabase(pv.raw_md_blob_url);
    const cleaned = cleanContent(rawContent);

    const summary = await openRouterService.generatePageSummary(cleaned);

    await prisma.pageVersion.update({
      where: { id: pv.id },
      data: {
        page_title: pv.page_title || extractTitleFromContent(cleaned),
        page_description: summary.description,
        page_summary: summary.summary
      }
    });

    await sleep(100); // Rate limiting
  }
}
```


## 7. Example Output

### Sample PageVersion Record
```json
{
  "id": "abc-123",
  "page_id": "page-456",
  "url": "https://docs.example.com/guide/quickstart",
  "page_title": "FastHTML Quick Start Guide",
  "page_description": "Learn how to build your first FastHTML application in under 5 minutes",
  "page_summary": "This guide walks through creating a basic FastHTML application, from installation to deployment. You'll learn how to set up routes, handle requests, work with templates, and integrate HTMX for dynamic interactions. The tutorial includes examples of form handling, database integration, and WebSocket support.",
  "content_fingerprint": "sha256:abcd1234...",
  "changed_enough": true
}
```

### Sample llms.txt Output
```markdown
# FastHTML

> FastHTML is a Python library for building server-rendered hypermedia applications with Starlette, Uvicorn, HTMX, and FastTags.

FastHTML combines modern Python web technologies into a cohesive framework for creating fast, interactive web applications without complex JavaScript frameworks. It emphasizes server-side rendering, progressive enhancement, and developer productivity.

## Core Documentation

- [Quick Start Guide](https://docs.example.com/guide/quickstart): Build your first FastHTML app in 5 minutes
- [Concise Guide](https://docs.example.com/guide/concise): Idiomatic FastHTML patterns and best practices
- [API Reference](https://docs.example.com/api): Complete function and method documentation

## Tutorials

- [WebSocket Applications](https://docs.example.com/tutorials/websockets): Real-time features with HTMX and WebSockets
- [CRUD Applications](https://docs.example.com/tutorials/crud): Building database-backed applications
- [Component Development](https://docs.example.com/tutorials/components): Creating reusable FT components

## Optional

- [Deployment Guide](https://docs.example.com/deployment): Deploying to various platforms
- [Performance Optimization](https://docs.example.com/performance): Tips for scaling FastHTML apps
```

## 8. Error Handling

### Graceful Degradation
1. If Firecrawl metadata missing → Extract title from content
2. If summary generation fails → Use empty summary, log error
3. If llms.txt generation fails → Fall back to simple format
4. If AI API unavailable → Queue for retry with exponential backoff

### Validation
- Enforce max lengths on database fields
- Validate JSON structure from AI responses
- Sanitize content before AI processing
- Check for null/empty values before storage

## 9. Future Enhancements

### Planned Improvements
1. **Multi-language support**: Detect language and generate summaries accordingly
2. **Custom prompts per domain**: Allow domain-specific summarization rules
3. **Incremental updates**: Only regenerate changed sections of llms.txt
4. **Quality scoring**: AI-based quality assessment of generated content
5. **Template system**: Customizable llms.txt output formats

### Research Areas
- Semantic chunking for better summaries
- Vector embeddings for similarity detection
- Streaming generation for large sites
- Cross-page relationship mapping