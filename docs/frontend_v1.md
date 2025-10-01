---

### 5. Global Configuration Component
**Purpose**: Manage system-wide settings

**Configuration Groups**:
- **Crawler Settings**:
  - Default check interval
  - Default max pages
  - Firecrawl API configuration

- **LLM Settings**:
  - Default OpenRouter model
  - Model-specific parameters
  - Rate limiting configuration

- **Storage Settings**:
  - Retention policies
  - Cleanup schedules

- **Notification Settings**:
  - Email configuration
  - Webhook endpoints

**Implementation**:
- JSON editor with schema validation
- Save/reset buttons
- Version history
- Import/export configuration

**APIs**:
- `GET /api/config` (to be created)
- `PUT /api/config` (to be created)

**Database**: New `Config` table with single JSON object

---

### 6. Prompt Templates Component
**Purpose**: View and manage LLM prompt templates

**Features**:
- **Template List View**:
  - Name
  - Version
  - Usage count
  - Created/updated dates
  - Actions (view, edit, duplicate, delete)

- **Template Editor**:
  - Name field
  - Template sections:
    - `summary_prompt` (main summarization prompt)
    - `llms_txt_header` (header for llms.txt)
    - `assemble_template` (assembly instructions)
  - Parameters JSON editor
  - Preview with variable substitution
  - Version management

**Database Model**: `PromptProfile` (already exists)

**APIs**:
- `GET /api/prompt-profiles` (to be created)
- `GET /api/prompt-profiles/[id]` (to be created)
- `PUT /api/prompt-profiles/[id]` (to be created)

---

### 7. Prompt Template Creator Component
**Purpose**: Create new prompt templates with guided setup

**Features**:
- **Template Wizard**:
  - Step 1: Basic info (name, description)
  - Step 2: Summary prompt builder
  - Step 3: Header customization
  - Step 4: Assembly rules
  - Step 5: Test with sample content

- **Variable Reference**:
  - Available variables list
  - Auto-complete in editor
  - Syntax highlighting

- **Template Library**:
  - Pre-built templates for common use cases
  - Import from library
  - Export to share

**APIs**:
- `POST /api/prompt-profiles` (to be created)
- `POST /api/prompt-profiles/test` (to be created)
