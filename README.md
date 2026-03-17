# Email Drafter

A desktop app for CU Hyperloop's business team to run bulk email outreach campaigns through Microsoft Outlook. Organize campaigns, discover companies with AI, import contacts, merge templates, attach files, and create drafts via Graph API.

## Features

- **Campaign Manager**: Create named campaigns that persist across sessions. Each campaign tracks companies, contacts, templates, and run history.
- **AI Company Discovery**: Search for relevant companies using Claude. Copy results to Apollo/ContactOut for contact finding, or save directly to a campaign. Supports "Search for More" (deduped), refinement, and expanded fields (industry, size, relevance score, suggested contact titles).
- **Contact Import**: Paste from Google Sheets or upload CSV. In-app editor with bulk cleanup (trim, dedupe, extract first names), drag-select, per-row template assignment, and team member auto-injection for sender fields.
- **Template System**: Create and version templates with `{{variable}}` merge fields, optional `Subject:` lines, and per-contact template mapping.
- **Sender Profiles**: Store team member info (name, role, major, phone, email) that auto-populates via the "Member" CSV column.
- **File Attachments**: Attach files up to 150MB using Microsoft's Large File Attachment API.
- **Batch Draft Creation**: Process contacts in parallel batches. Real-time progress, error handling, retry, and result export.
- **Run History**: Each campaign records past runs with success/fail counts.

## Tech Stack

- **Framework**: Electron + React + TypeScript
- **Styling**: Tailwind CSS
- **AI**: Anthropic API (Claude Haiku) for company discovery
- **Auth**: OAuth 2.0 PKCE → Microsoft Graph API
- **Token Storage**: OS credential manager (keytar)
- **Persistence**: localStorage (campaigns, templates, team members)

## Setup

### Prerequisites

- Node.js 18+
- An Azure App Registration with:
  - `User.Read`, `Mail.ReadWrite`, `Files.ReadWrite` (delegated permissions)
  - Platform: Mobile and desktop applications, redirect URI `http://localhost:3000/redirect`
  - "Allow public client flows" enabled
- An Anthropic API key (for company discovery)

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root:

```
AZURE_CLIENT_ID=your-client-id
AZURE_TENANT_ID=your-tenant-id
AZURE_REDIRECT_URI=http://localhost:3000/redirect
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Run

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Workflow

1. **Sign in** with your Microsoft account
2. **Create a campaign** (e.g. "Canopies Q2")
3. **Generate companies** using AI search — copy name/website to Apollo or ContactOut
4. **Import contacts** — paste from your Google Sheet with contact info
5. **Select a template** for the campaign
6. **Attach a file** (optional)
7. **Run** — drafts appear in your Outlook Drafts folder
8. **Review results** — retry failures, export results

The old linear flow (no campaign) still works as a fallback from the home screen.

## CSV Format

Include at least `name` and `email`. Any extra columns become merge variables:

```csv
name,email,company,Template,Member
John Doe,john@example.com,Acme Corp,Product Outreach,Nathaniel
```

- **Template** column: auto-maps to a saved template by name
- **Member** column: auto-fills sender fields from saved team profiles

## Limitations

- ~100-200 emails per minute (Graph API throttling)
- 150MB attachment limit per message
- Access tokens refresh every hour
- Company discovery requires an Anthropic API key

## License

MIT
