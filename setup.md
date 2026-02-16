# Email Drafter Setup Guide

## 1. Azure App Registration Setup

### Step 1: Create App Registration
1. Go to [Azure Portal](https://portal.azure.com)
2. Search for "App registrations" and click on it
3. Click "New registration"
4. Fill in:
   - **Name**: `Email Drafter`
   - **Supported account types**: "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"
   - **Redirect URI**: Select "Web" and enter `http://localhost:3000/redirect`
5. Click "Register"

### Step 2: Configure API Permissions
1. In the left sidebar, click "API permissions"
2. Click "+ Add a permission"
3. Select "Microsoft Graph"
4. Choose "Delegated permissions"
5. Add these permissions:
   - `User.Read`
   - `Mail.ReadWrite`
   - `Files.ReadWrite`
6. Click "Add permissions"
7. Click "Grant admin consent" (if you have admin rights)

### Step 3: Copy Client ID
1. From the app overview page, copy the **Application (client) ID**
2. It looks like: `12345678-1234-1234-1234-123456789abc`

## 2. Update Code with Your Client ID

### Update the Client ID
1. Open `electron/auth.ts`
2. Replace `YOUR_ACTUAL_CLIENT_ID_FROM_AZURE` with your actual Client ID:

```typescript
const CLIENT_ID = 'your-actual-client-id-here';
```

## 3. Install and Run

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## 4. Test the Application

1. **Sign In**: Click "Sign in with Microsoft" and authenticate
2. **Import Contacts**: Upload a CSV file with name, email columns
3. **Upload Template**: Upload a text file with variables like `{{name}}`, `{{email}}`
4. **Select Attachment**: Choose a file to attach (up to 150MB)
5. **Create Drafts**: The app will process contacts and create drafts in Outlook

## 5. Sample Files

### Sample CSV (contacts.csv):
```csv
name,email,company,department
John Doe,john@example.com,Acme Corp,Sales
Jane Smith,jane@example.com,Tech Inc,Marketing
Bob Johnson,bob@example.com,Startup Co,Engineering
```

### Sample Template (template.txt):
```
Hello {{name}},

Thank you for your interest in {{company}}. We'll be in touch soon.

Best regards,
The Team
```

## Troubleshooting

### Authentication Issues
- Ensure redirect URI is exactly: `http://localhost:3000/redirect`
- Check that API permissions are granted
- Try signing out and back in

### File Upload Issues
- Files >3MB use Large File Attachment API
- Check your internet connection
- Ensure sufficient OneDrive storage

### Rate Limiting
- App automatically handles rate limits
- Large batches may take several minutes
- Processing will pause and resume automatically
