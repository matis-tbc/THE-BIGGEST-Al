# Email Drafter

A desktop application that merges contact lists with email templates, attaches files, and automatically creates draft emails in Microsoft Outlook via Graph API.

## Features

- **Contact Management**: Import contacts from CSV files with validation
- **Template System**: Upload text templates with variable substitution ({{name}}, {{email}}, etc.)
- **File Attachments**: Attach files up to 150MB using Microsoft's Large File Attachment API
- **Batch Processing**: Process up to 20 contacts per batch with parallel execution
- **Progress Tracking**: Real-time progress display with error handling and retry capabilities
- **Secure Authentication**: OAuth 2.0 PKCE flow with token storage in OS credential manager

## Prerequisites

Before running the application, you need to set up an Azure App Registration:

### Azure Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Search for "App registrations" and click on it
3. Click "New registration"
4. Fill in:
   - **Name**: Email Drafter
   - **Supported account types**: "Accounts in any organizational directory and personal Microsoft accounts"
   - **Redirect URI**: You can leave this blank at creation and add it in Authentication settings
5. Click "Register"
6. Copy the **Application (client) ID**
7. Go to "API permissions" and add:
   - `User.Read` (delegated)
   - `Mail.ReadWrite` (delegated) 
   - `Files.ReadWrite` (delegated)
8. Configure environment variables before launch:
   - `AZURE_CLIENT_ID=<application-client-id>`
   - `AZURE_TENANT_ID=<directory-tenant-id>`
   - `AZURE_REDIRECT_URI=http://localhost:3000/redirect` (optional if default)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the project root:
```bash
AZURE_CLIENT_ID=your-client-id
AZURE_TENANT_ID=your-tenant-id
AZURE_REDIRECT_URI=http://localhost:3000/redirect
```

3. Build the application:
```bash
npm run build
```

4. Run in development mode:
```bash
npm run dev
```

## Usage

1. **Sign In**: Authenticate with your Microsoft account
2. **Import Contacts**: Upload CSV, correct rows directly in the in-app CSV editor, and continue with valid contacts
3. **Select Template**: Create/edit/save templates in-app (or upload files), including optional `Subject:` and `To:` sections
4. **Choose Attachment**: Select a file to attach to all emails (up to 150MB)
5. **Create Drafts**: The app will process contacts in batches and create drafts in your Outlook
6. **Review Results**: Check the status of each email and retry any failures

## CSV Format

Your CSV file should include at least `name` and `email` columns:

```csv
name,email,company,department
John Doe,john@example.com,Acme Corp,Sales
Jane Smith,jane@example.com,Tech Inc,Marketing
```

## Template Variables

Use double curly braces for variables in your templates:

```
Hello {{name}},

Thank you for your interest in {{company}}. We'll be in touch soon.

Best regards,
The Team
```

## Technical Details

- **Framework**: Electron + React + TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: OAuth 2.0 PKCE with system browser
- **Token Storage**: OS credential manager (keytar)
- **State Management**: SQLite database
- **File Handling**: Large File Attachment API for files >3MB
- **Batch Processing**: Up to 20 contacts per batch, 3 concurrent batches

## Limitations

- Maximum 20 emails per batch (Graph API limit)
- ~100-200 emails per minute realistic throughput
- Attachment size limit: 150MB per message total
- Access token requires refresh every hour

## Security

- No client secrets in code (PKCE flow)
- Tokens encrypted in OS keychain
- Never logs access tokens
- CSV sanitization to prevent formula injection
- Template variable validation

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create distributable
npm run dist
```

## Troubleshooting

### Authentication Issues
- Ensure your Azure App Registration is configured correctly
- Check that the redirect URI matches exactly: `http://localhost:3000/redirect`
- Verify API permissions are granted

### File Upload Issues
- Files larger than 3MB use the Large File Attachment API
- Check your internet connection for large files
- Ensure you have sufficient OneDrive storage

### Rate Limiting
- The app automatically handles rate limits with exponential backoff
- Processing will pause and resume automatically
- Large batches may take several minutes to complete

## Authentication Setup Requirements

The app uses OAuth 2.0 PKCE. In Azure AD the registration must be configured as a **public client**.

1. Open the Azure Portal → **App registrations** → your app.
2. Under **Authentication** add a platform **Mobile and desktop applications** and include the redirect URI `http://localhost:3000/redirect`.
3. In the same page, expand **Advanced settings** and enable **Allow public client flows**.
4. API permissions should include `User.Read`, `Mail.ReadWrite`, and `Files.ReadWrite` (delegated).

If these settings are missing you will see an error similar to `AADSTS70002: The provided request must include a 'client_secret' input parameter`. Update the settings above and rerun the app.

## Development Launch Sequence

1. Stop any stray Vite/Electron processes:
   ```bash
   pkill -f electron || true
   pkill -f vite || true
   ```
2. Start the renderer dev server on the fixed port:
   ```bash
   npm run dev:react
   ```
3. In a new terminal, launch Electron:
   ```bash
   npx cross-env NODE_ENV=development electron .
   ```
   (Alternatively use `npm run dev` once you know port 5173 is free.)

An in-app overlay will surface any renderer errors with a retry button. The DevTools console (⌥⌘I / Ctrl+Shift+I) will contain full stack traces.

## Regression Checklist

Run this quick checklist after auth or processing changes:

1. Sign in succeeds and app lands on `Import Contacts`.
2. Header shows authenticated account and token expiry time.
3. CSV import supports cell edits, bulk cleanup, and corrected CSV export.
4. Template editor supports save/duplicate/delete and version restore.
5. Preflight blocks processing on invalid emails or template errors.
6. Draft creation runs and review screen exports real results.

## License

MIT License
