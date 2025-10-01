# Change Detection V0 Specification

## Overview

This document specifies the new change detection system that replaces Firecrawl's built-in change detection with a custom implementation that provides git-diff style change analysis and AI-powered semantic importance scoring.

## Goals

1. **Disable Firecrawl Change Detection**: Make Firecrawl's change tracking an optional flag that can be disabled
2. **Custom Change Detection**: Implement our own change detection after content cleaning
3. **Diff-Based Analysis**: Generate git-style diffs to visualize changes between versions
4. **Semantic Scoring**: Use LLM to evaluate the semantic importance of changes
5. **Conditional Processing**: Only proceed with expensive operations (summarization) when changes are semantically significant

## Architecture Changes

### 1. Firecrawl Configuration (F1 - startCrawl)

**Location**: `src/lib/inngest/functions/startCrawl.ts`

**Change**: Add optional flag to disable Firecrawl's change tracking

```typescript
// When initiating Firecrawl crawl, add option:
{
  scrapeOptions: {
    // ... existing options
    changeDetection: false, // NEW: disable Firecrawl's change tracking
  }
}
```

**Rationale**: We want to receive all pages regardless of Firecrawl's change detection, so we can perform our own analysis.

### 2. Event Schema Updates

**Location**: `src/lib/inngest/client.ts`

**Change**: The `changeTracking` field in events becomes optional and may be undefined when disabled.

```typescript
"page/process.requested": {
  data: {
    // ... existing fields
    changeTracking?: ChangeTracking; // Now optional
  };
}
```

### 3. Process URL Function (F3 - processUrl)

**Location**: `src/lib/inngest/functions/processUrl.ts`

This function will be significantly restructured to implement the new change detection pipeline.

#### New Pipeline Flow

```
1. Get Context (existing)
   ↓
2. Clean Content (existing, but separated from enhancement)
   ↓
3. Generate Diff with Previous Version
   ↓
4. Check if Content Changed (based on diff)
   ↓
   NO CHANGES? → Store version, skip AI processing, mark as unchanged
   ↓
   HAS CHANGES? → Continue to step 5
   ↓
5. Evaluate Semantic Importance (AI call #1 - cheap model)
   ↓
6. Check Importance Score
   ↓
   SCORE = 1? → Store version, skip summarization, mark as minor change
   ↓
   SCORE >= 2? → Continue to step 7
   ↓
7. Enhance/Summarize Content (AI call #2 - existing model)
   ↓
9. Store Processed Content
   ↓
10. Create Page Version Record
   ↓
11. Update Last Known Version
   ↓
12. Increment Pages Processed
   ↓
13. Emit Page Processed Event
```

#### Step-by-Step Implementation

**Step 2: Clean Content**

```typescript
const cleanedContent = await step.run("clean-content", async () => {
  return cleanContent(rawContent, {
    extractMain: true,
    removeMetadata: true,
  });
});
```

**Step 3: Generate Diff**

Create a new utility function `generateContentDiff()` in `src/lib/utils/diff.ts`:

```typescript
export interface ContentDiff {
  hasChanges: boolean;
  additions: number;
  deletions: number;
  diffText: string; // Formatted diff output
  changePercentage: number;
}

export function generateContentDiff(
  oldContent: string,
  newContent: string
): ContentDiff
```

This function should:
- Use a diff library (e.g., `diff` npm package) to generate unified diff
- Calculate addition/deletion counts
- Calculate change percentage
- Format output similar to git diff

**Step 3 Implementation in processUrl**:

```typescript
const diffAnalysis = await step.run("generate-diff", async () => {
  // Get previous version's cleaned content
  const previousVersion = await db.page.getPreviousVersion(
    domainInfo.id,
    url
  );

  if (!previousVersion) {
    return {
      isNew: true,
      diff: null,
    };
  }

  // Fetch previous cleaned content from storage
  let previousContent = "";
  if (previousVersion.html_md_blob_url) {
    const blob = await storage.download(
      STORAGE_BUCKETS.ARTIFACTS,
      previousVersion.html_md_blob_url
    );
    if (blob) {
      previousContent = await blob.text();
    }
  }

  // Generate diff
  const diff = generateContentDiff(previousContent, cleanedContent);

  return {
    isNew: false,
    diff,
    previousVersionId: previousVersion.id,
  };
});
```

**Step 4: Early Exit on No Changes**

```typescript
// If no changes detected, skip AI processing
if (!diffAnalysis.isNew && !diffAnalysis.diff?.hasChanges) {
  // Store the version anyway (for audit trail)
  const storagePath = await step.run("store-unchanged-content", async () => {
    const path = getProcessedPagePath(domainUrl, jobId, new Date(job.started_at), url);
    await storage.upload(STORAGE_BUCKETS.ARTIFACTS, path, cleanedContent);
    return path;
  });

  const pageVersion = await step.run("create-unchanged-version", async () => {
    return await db.page.createVersion({
      pageId,
      jobId,
      url,
      rawMdBlobUrl: storagePath,
      htmlMdBlobUrl: null, // No enhanced version
      semanticImportance: null, // null = no changes
      reason: "No changes detected in diff",
    });
  });

  // Skip remaining steps, emit completion event
  await step.run("emit-page-processed", async () => {
    await sendEvent("page/processed", {
      pageId,
      versionId: pageVersion.id,
      jobId,
      url,
      semanticImportance: null,
      reason: "No changes detected",
    });
  });

  return { success: true, skipped: true, reason: "No changes" };
}
```

**Step 5: Evaluate Semantic Importance**

Create new OpenRouter method in `src/lib/openrouter/client.ts`:

```typescript
/**
 * Evaluate semantic importance of content changes
 * Returns a score from 1-4:
 * 1 = Minor/insignificant (typos, formatting, dates)
 * 2 = Moderate (small content updates, minor corrections)
 * 3 = Significant (new information, meaningful updates)
 * 4 = Major (substantial content changes, new features/sections)
 */
async evaluateChangeImportance(
  contentDiff: string,
  model = "openai/gpt-4o-mini" // Use cheap model
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

Return ONLY a single integer (1, 2, 3, or 4). No explanation.`;

  const response = await this.createChatCompletion({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Evaluate these changes:\n\n${contentDiff}` }
    ],
    temperature: 0.1,
    max_tokens: 10,
  });

  const scoreText = response.choices[0]?.message?.content?.trim() ?? "2";
  const score = parseInt(scoreText, 10);

  // Validate and clamp to 1-4 range
  if (isNaN(score) || score < 1 || score > 4) {
    console.warn(`Invalid change importance score: ${scoreText}, defaulting to 2`);
    return 2;
  }

  return score;
}
```

**Step 5 Implementation in processUrl**:

```typescript
const semanticAnalysis = await step.run("evaluate-change-importance", async () => {
  if (diffAnalysis.isNew) {
    return { score: 4, reason: "New page" };
  }

  const score = await openRouter.evaluateChangeImportance(
    diffAnalysis.diff.diffText
  );

  return { score, reason: `Semantic importance: ${score}/4` };
});
```

**Step 6: Conditional Enhancement Based on Score**

```typescript
// Only enhance/summarize if score >= 2
let enhancedContent: string | null = null;

if (semanticAnalysis.score >= 2) {
  enhancedContent = await step.run("enhance-content", async () => {
    const systemPrompt = domainInfo.prompt_profile?.summary_prompt || undefined;
    const model = domainInfo.openrouter_model || "openai/gpt-4o-mini";

    return await openRouter.processPageContent(
      cleanedContent,
      systemPrompt,
      model
    );
  });
} else {
  // Score = 1: Skip expensive enhancement
  await step.run("skip-enhancement", async () => {
    console.log(`⏭️ Skipping content enhancement for ${url} (importance score: 1)`);
  });
}
```

**Step 7-13: Continue with existing flow**

- Generate fingerprint on cleaned content (not enhanced)
- Store both cleaned and enhanced (if generated) content
- Update database with semantic importance score
- Emit events as before

## Database Schema Changes

**Location**: `prisma/schema.prisma`

### Remove Deprecated Change Detection Fields

**IMPORTANT**: Remove the following fields from `PageVersion` model as they are no longer needed with the new diff-based change detection:

```prisma
model PageVersion {
  // REMOVE these fields:
  content_fingerprint String   // ❌ Remove - no longer using fingerprint-based detection
  prev_fingerprint    String?  // ❌ Remove - replaced by diff-based analysis
  similarity_score    Float?   // ❌ Remove - replaced by semantic_importance scoring
  changed_enough      Boolean  // ❌ Remove - replaced by semantic_importance threshold logic

  // REMOVE this index:
  @@index([content_fingerprint])  // ❌ Remove - no longer needed
}
```

### Add New Field

Add new field to `PageVersion` model:

```prisma
model PageVersion {
  // ... existing fields

  semantic_importance Int?     @db.SmallInt // 1-4 scale, null for pages before this feature

  // ... rest of model
}
```

### Updated PageVersion Schema

The complete updated model should look like:

```prisma
model PageVersion {
  id                  String   @id @default(uuid())
  page_id             String
  page                Page     @relation(fields: [page_id], references: [id], onDelete: Cascade)
  job_id              String
  job                 Job      @relation(fields: [job_id], references: [id], onDelete: Cascade)
  url                 String
  raw_md_blob_url     String?
  html_md_blob_url    String?
  change_status       String?  // "same", "updated", etc from Firecrawl (may deprecate later)
  reason              String?  // Human-readable reason for change/no-change decision
  semantic_importance Int?     @db.SmallInt // NEW: 1-4 scale (null = unchanged/no diff)
  created_at          DateTime @default(now())

  @@index([page_id, created_at(sort: Desc)])
}
```

Migration required: `pnpm db:generate && pnpm db:push`

### Code Files Requiring Updates

Remove all references to `content_fingerprint`, `prev_fingerprint`, `similarity_score`, and `changed_enough` in the following files:

1. **`src/lib/inngest/functions/processUrl.ts`**
   - Remove fingerprint generation step
   - Remove fingerprint comparison logic
   - Remove similarity_score calculation
   - Remove changed_enough logic
   - Update `createVersion()` calls to remove these deprecated parameters
   - Replace with diff-based change detection and semantic_importance

2. **`src/lib/inngest/client.ts`**
   - Update event type definitions for `page/processed` event
   - Remove `similarityScore` and `changedEnough` from event data types
   - Add `semanticImportance` to event data types

3. **`src/lib/inngest/functions/assembleArtifacts.ts`**
   - Update any logic that filters pages by `changed_enough`
   - Replace with semantic_importance threshold checks (e.g., `semantic_importance >= 2`)

4. **`src/lib/inngest/functions/finalizeJob.ts`**
   - Update any references to changed_enough or similarity_score
   - Update job stats/summary to use semantic_importance metrics instead

5. **`src/lib/db/pages.ts`**
   - Update `createVersion()` function signature
   - Remove `contentFingerprint`, `prevFingerprint`, `similarityScore`, `changedEnough` parameters
   - Add `semanticImportance` parameter
   - Update `getPreviousVersionByFingerprint()` - rename

6. **`src/lib/utils/fingerprint.ts`**
   - This entire file can be DEPRECATED or removed
   - Functions like `generateFingerprint()`, `calculateSimilarity()`, `hasChangedEnough()` are replaced by diff-based detection

7. **Test files**:
   - `test/test-db.ts` - Update mock data creation
   - `src/lib/mocks/factory.ts` - Update factory functions
   - `test/integration-tests/inngest-functions.test.ts` - Update test assertions

8. **Documentation**:
   - `docs/implementation_v0.md` - Update references
   - `docs/inngest_v0.md` - Update event schemas
   - `docs/tech_spec_v0.md` - Update architecture descriptions
   - `CLAUDE.md` - Update if it references these fields

## New Utility Files

### 1. `src/lib/utils/diff.ts`

Implement content diffing functionality:

```typescript
import { diffLines, Change } from 'diff'; // npm package

export interface ContentDiff {
  hasChanges: boolean;
  additions: number;
  deletions: number;
  diffText: string;
  changePercentage: number;
}

export function generateContentDiff(
  oldContent: string,
  newContent: string
): ContentDiff {
  // Normalize content before diffing
  const normalizedOld = normalizeForDiff(oldContent);
  const normalizedNew = normalizeForDiff(newContent);

  // Generate line-by-line diff
  const changes: Change[] = diffLines(normalizedOld, normalizedNew);

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const change of changes) {
    const lineCount = change.value.split('\n').length - 1;
    if (change.added) {
      additions += lineCount;
    } else if (change.removed) {
      deletions += lineCount;
    } else {
      unchanged += lineCount;
    }
  }

  // Format as git-style diff
  const diffText = formatDiff(changes);

  // Calculate change percentage
  const totalLines = additions + deletions + unchanged;
  const changedLines = additions + deletions;
  const changePercentage = totalLines > 0 ? (changedLines / totalLines) * 100 : 0;

  return {
    hasChanges: additions > 0 || deletions > 0,
    additions,
    deletions,
    diffText,
    changePercentage,
  };
}

function normalizeForDiff(content: string): string {
  return content
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\t/g, '  ')    // Normalize tabs to spaces
    .trim();
}

function formatDiff(changes: Change[]): string {
  let result = '';

  for (const change of changes) {
    if (change.added) {
      result += `+ ${change.value}`;
    } else if (change.removed) {
      result += `- ${change.value}`;
    } else {
      result += `  ${change.value}`;
    }
  }

  return result;
}
```

## Configuration

### Environment Variables

No new environment variables required. Uses existing `OPENROUTER_API_KEY`.

### Domain Settings

Consider adding future domain-level settings:
- `disable_change_detection`: Boolean to skip change detection entirely
- `change_importance_threshold`: Minimum score to trigger enhancement (default: 2)
- `change_importance_model`: Model to use for evaluation (default: "openai/gpt-4o-mini")

## Testing Approach

### Unit Tests

1. **Diff Generation** (`src/lib/utils/diff.test.ts`)
   - Test identical content (no changes)
   - Test additions only
   - Test deletions only
   - Test mixed changes
   - Test whitespace normalization

2. **OpenRouter Change Evaluation** (manual testing initially)
   - Test with various diff sizes
   - Verify score range (1-4)
   - Test with edge cases (empty diffs, huge diffs)

### Integration Tests

Update `test/integration-tests/crawl-pipeline.test.ts`:

1. **No Changes Scenario**
   - Crawl same content twice
   - Verify second crawl skips AI processing
   - Verify version created with score=null, changedEnough=false

2. **Minor Changes (Score 1)**
   - Crawl with typo fixes
   - Verify AI evaluation returns score=1
   - Verify enhancement is skipped
   - Verify version created with score=1

3. **Significant Changes (Score 3-4)**
   - Crawl with substantial content updates
   - Verify AI evaluation returns score >= 3
   - Verify full enhancement pipeline runs
   - Verify version created with appropriate score

## Performance Considerations

### Cost Optimization

1. **Early Exit on No Changes**: Saves ~$0.001 per unchanged page (OpenRouter call avoided)
2. **Cheap Model for Evaluation**: Use `gpt-4o-mini` (~$0.0001 per evaluation)
3. **Skip Enhancement on Score=1**: Saves ~$0.001 per trivial change

Estimated savings for typical crawl with 100 pages:
- 80 unchanged pages: $0.08 saved
- 15 minor changes (score=1): $0.015 saved
- 5 significant changes: Full processing

Total savings: ~$0.095 per 100-page crawl (~50% reduction in API costs)

### Throughput

- Diff generation: < 100ms per page (in-memory operation)
- AI evaluation: ~200-500ms per page (cheap model, small prompt)
- Overall: Adds ~300-600ms per changed page, saves ~1-2s per unchanged page

Net result: **Improved overall throughput** due to early exits

## Migration Strategy

### Phase 1: Deploy with Feature Flag
1. Deploy code with `USE_FIRECRAWL_CHANGE_DETECTION=true` (default)
2. Monitor existing behavior in production

### Phase 2: Enable for Test Domain
1. Set `USE_FIRECRAWL_CHANGE_DETECTION=false` for one domain
2. Monitor change detection accuracy
3. Compare costs and throughput

### Phase 3: Full Rollout
1. Disable Firecrawl change detection globally
2. Monitor cost reduction and accuracy
3. Tune semantic importance thresholds based on data

## Monitoring & Metrics

Add logging for:
1. Change detection decisions: `no_change`, `score_1`, `score_2`, `score_3`, `score_4`
2. Processing time per step (diff, evaluation, enhancement)
3. Cost per page (track AI call counts)
4. False positives/negatives (manual review initially)

Add to job completion summary:
- Total pages: unchanged / score=1 / score=2+ / new
- Cost savings from skipped processing
- Average time per page

## Future Enhancements

### V1 Improvements (Future Consideration)

1. **Diff Storage**: Store actual diff text in database for debugging/audit
2. **Smart Diffing**: Ignore common noise (timestamps, version numbers, etc.)
3. **Batch Evaluation**: Send multiple diffs to LLM in one call for efficiency
4. **Custom Importance Prompts**: Allow per-domain evaluation criteria
5. **Change Classification**: Categorize changes (content, structure, code, etc.)
6. **Diff Visualization**: UI component to show changes between versions

## Dependencies

### New NPM Packages

```json
{
  "diff": "^5.1.0"  // For generating content diffs
}
```

Install: `pnpm add diff`

### TypeScript Types

```bash
pnpm add -D @types/diff
```

## Rollback Plan

If issues arise:

1. **Immediate**: Set `changeDetection: true` in Firecrawl config to re-enable their detection
2. **Database**: `semantic_importance` field is optional, old code continues working
3. **Code**: Keep existing fingerprint-based detection as fallback

No data loss risk - all content still stored, just processing logic changes.

## Success Criteria

1. **Accuracy**: > 95% of "unchanged" pages are correctly identified
2. **Cost**: > 40% reduction in OpenRouter API costs for typical crawls
3. **Performance**: No increase in average page processing time
4. **Reliability**: < 1% error rate in semantic evaluation (score out of range)

## Open Questions

1. **Diff Size Limit**: Should we truncate very large diffs before sending to LLM? (Suggested: 4000 tokens max)
2. **Score Calibration**: Will scores 1-4 need adjustment based on real-world data?
3. **Storage of Diffs**: Should we persist diff text for debugging/audit? (Not in V0)
4. **Batch Processing**: Can we evaluate multiple diffs in parallel for efficiency gains?

## Document History

- **2025-10-01**: Initial V0 specification created
