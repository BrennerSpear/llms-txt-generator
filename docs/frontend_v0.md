# Frontend Components Specification v0

## Overview
This document outlines all frontend components needed for the llms.txt generator application. The UI will provide comprehensive management of domains, crawl jobs, configuration, and prompt templates.

## Core Components

### 1. Domain Crawler Component
**Purpose**: Initiate new website crawls with configurable settings

**Features**:
- URL input field (auto-normalizes domain)
- Editable configuration fields:
  - `checkIntervalMinutes` (default: 1440)
  - `openrouterModel` (default: "openai/gpt-4o-mini")
  - `maxPages` (default: 10)
  - `promptProfileId` (optional dropdown)
- Submit button to trigger crawl
- Error handling for duplicate active jobs
- Success notification with job ID link

**API**: `POST /api/domains/crawl`

**State Management**:
- Form validation
- Loading state during submission
- Error/success messaging

---

### 2. Domains Table Component
**Purpose**: Display all crawled domains with key metrics and artifacts

**Table Columns**:
- Domain name (clickable link to domain detail page)
- Status (active/inactive)
- Pages scanned count
- Last crawl date
- Check interval
<!-- - OpenRouter model -->
- Actions:
  - View `llms.txt` (web preview)
  - Download `llms.txt`
  - View `llms-full.txt` (web preview)
  - Download `llms-full.txt`
  - Trigger new crawl

**APIs**:
- `GET /api/domains` (to be created)
- `GET /api/domains/[domainId]/artifacts` (to be created)

---

### 3. Domain Detail Page Component (`/domains/[domainId]`)
**Purpose**: Deep dive into a specific domain's pages and versions

**Sections**:
- **Domain Header**:
  - Domain name, status, configuration
  - Quick actions (trigger crawl, edit settings, view artifacts)

- **Pages Table**:
  - URL
  - Last version date
  - Number of versions
  - Change detection status (changed/unchanged)
  - Similarity score
  - Actions:
    - View raw markdown (`raw_md_blob_url`)
    - View processed HTML markdown (`html_md_blob_url`)
    - Version history modal

- **Version History Modal**:
  - List of all versions for a page
  - Fingerprint comparison
  - Similarity scores between versions
  - Diff viewer for content changes

**APIs**:
- `GET /api/domains/[domainId]` (to be created)
- `GET /api/domains/[domainId]/pages` (to be created)
- `GET /api/pages/[pageId]/versions` (to be created)

---

### 4. Jobs Dashboard Component
**Purpose**: Monitor all crawl jobs with live updates

**Table Columns**:
- Job ID
- Domain
- Type (initial/update)
- Status (processing/finished/failed/canceled)
- Progress (pages_received/pages_expected)
- Started at
- Duration/ETA
- Actions:
  - View details
  - Cancel (if processing)

**Features**:
- **Live Polling**:
  - 5-second refresh for processing jobs
  - Visual indicator (spinner/pulse) on processing rows
  - Auto-stop polling when all jobs complete
- **Status Badges**: Color-coded by status
- **Progress Bar**: Visual representation of pages processed
- **Filters**: By status, domain, date range

**APIs**:
- `GET /api/jobs` (to be created)
- `GET /api/jobs/[jobId]` (existing)
- `POST /api/jobs/[jobId]/cancel` (existing)

---

## API Endpoints Summary

### Existing Endpoints:
- `POST /api/domains/crawl`
- `GET /api/jobs/[jobId]`
- `POST /api/jobs/[jobId]/cancel`

### New Endpoints Needed:
- `GET /api/domains` - List all domains with stats
- `GET /api/domains/[domainId]` - Domain details
- `GET /api/domains/[domainId]/pages` - Pages for domain
- `GET /api/domains/[domainId]/artifacts` - Latest artifacts
- `PUT /api/domains/[domainId]` - Update domain settings
- `GET /api/pages/[pageId]/versions` - Version history
- `GET /api/jobs` - List all jobs with filters
- `GET /api/config` - Get global configuration
- `PUT /api/config` - Update global configuration
- `GET /api/prompt-profiles` - List prompt templates
- `GET /api/prompt-profiles/[id]` - Get specific template
- `POST /api/prompt-profiles` - Create template
- `PUT /api/prompt-profiles/[id]` - Update template
- `DELETE /api/prompt-profiles/[id]` - Delete template
- `POST /api/prompt-profiles/test` - Test template with sample

---

## Technical Considerations

### State Management
- Use React Query/SWR for server state
- Local state for forms and UI interactions
- polling for live updates

### Performance
- Lazy loading for artifact content

---

## Implementation Priority

1. **Phase 1** (MVP):
   - Domain Crawler Component
   - Domains Table Component
   - Domain Detail Page
   

2. **Phase 2**:
   - Jobs Dashboard Component (with polling)
   - Artifact Viewer
   - Basic Prompt Templates View

3. **Phase 3**:
   - Global Configuration
   - Prompt Template Creator

---

## Notes

- All timestamps should display in user's local timezone
- Include loading states for all async operations
- Implement proper error boundaries
- Add confirmation dialogs for destructive actions