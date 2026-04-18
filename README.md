# Email Drafter

A desktop app for CU Hyperloop's business team to run bulk email outreach campaigns through Microsoft Outlook. Organize campaigns, discover companies with AI, import contacts, merge templates, attach files, and create drafts via Graph API.

## Features

- **Campaign Manager**: Create named campaigns that persist across sessions. Each campaign tracks companies, contacts, templates, and run history.
- **AI Company Discovery**: Search for relevant companies using Claude. Copy results to Apollo/ContactOut for contact finding, or save directly to a campaign. Supports "Search for More" (deduped), refinement, and expanded fields.
- **Contact Import**: Paste from Google Sheets or upload CSV. In-app editor with bulk cleanup, drag-select, per-row template assignment, and team member auto-injection.
- **Template System**: Versioned templates with `{{variable}}` merge fields, optional `Subject:` lines, and per-contact template mapping.
- **Sender Profiles**: Store team member info that auto-populates via the "Member" CSV column.
- **File Attachments**: Up to 150MB using Microsoft's Large File Attachment API.
- **Batch Draft Creation**: Real-time progress, error handling, retry, result export.
- **Server-side scheduling and stagger**: Scheduled and staggered sends go through Outlook's deferred-delivery property, so the app can close and Exchange releases messages on time.
- **Reply tracking**: Per-identity inbox `/delta` poll every 60s, matched by `conversationId` against sent recipients. Desktop notifications on new replies.
- **Delivery confirmation + bounce detection**: SentItems `/delta` poll flips recipient status to `delivered`; transport-header parsing catches bounces and marks failures.
- **Haiku reply classification**: Every reply auto-classified into `interested / not_interested / auto_reply / out_of_office / bounce / needs_followup / other`.
- **Insights dashboard**: Hero metrics, 30d sparklines, funnel, per-campaign table, recent activity feed, CSV export.
- **Run history forensics**: Append-only `.jsonl` log for every IPC handler that touched a recipient.

## Tech Stack

- **Framework**: Electron + React + TypeScript
- **Styling**: Tailwind CSS
- **AI**: Anthropic API (Claude Haiku) for company discovery + reply classification
- **Auth**: OAuth 2.0 PKCE → Microsoft Graph API
- **Token Storage**: OS credential manager (keytar)
- **Telemetry**: SQLite (better-sqlite3) at `userData/emaildrafter.db` — recipients, replies, runs, delta tokens
- **Other persistence**: localStorage (campaigns, templates, team members — unrelated to reply telemetry)

## Setup

### Prerequisites

- Node.js 18+
- Python 3 with `setuptools` (for native `better-sqlite3` build). On macOS with Python 3.12+ which dropped `distutils`, use a project venv (see Install).
- macOS Command Line Tools with intact C++ stdlib (fallback `CPLUS_INCLUDE_PATH` is wired in `package.json` postinstall).
- An Azure App Registration with:
  - `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access` (delegated permissions)
  - Platform: Mobile and desktop applications, redirect URI `http://localhost:3000/redirect`
  - "Allow public client flows" enabled
- An Anthropic API key (for company discovery + reply classification)

### Install

```bash
# One-time: create the Python venv that node-gyp needs for better-sqlite3
python3 -m venv .venv
.venv/bin/pip install setuptools

npm install
```

`.npmrc` pins npm to the project venv so rebuilds work even on Python 3.13+.

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
- Company discovery + reply classification require an Anthropic API key
- Reply poller needs the app open; scheduled/staggered sends do NOT (Exchange holds deferred messages server-side)

## License

MIT
