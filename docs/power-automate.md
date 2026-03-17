# Power Automate Integration

The CU Hyperloop Email Drafter relies on two Power Automate (PA) flows for email sending and inbox logging. This is because CU's school IT only grants Microsoft Graph API permissions for **creating drafts**, not for sending emails directly.

## Flow 1: Draft Sender

- **Trigger:** Recurrence (every 30 seconds)
- **Action:** Scans the Outlook Drafts folder for messages where the subject contains **"CU Hyperloop"**
- **Result:** Sends each matching draft and moves it to Sent Items
- **Why:** The app creates drafts via Graph API; this flow is the workaround that actually sends them

## Flow 2: Inbox Logger

- **Trigger:** When a new email arrives with "CU Hyperloop" in the subject
- **Action:** Logs the sender, subject, date, and body to an Excel spreadsheet on SharePoint/OneDrive
- **Why:** Provides a centralized record of inbound replies for the business team to track engagement

## Why This Architecture?

School IT restricts the Azure AD app registration to `Mail.ReadWrite` (draft creation) only. Direct `Mail.Send` permission is not granted. Power Automate runs under a licensed user account that has full Outlook access, bridging the gap.

## Important: Subject Line Requirement

Both flows filter on the presence of **"CU Hyperloop"** in the subject line. If a draft is created without this string in the subject, it will **not** be picked up by Power Automate and will sit in Drafts indefinitely.

The Email Drafter app enforces this with a preflight validation warning.

## Future Enhancements

1. **HTTP Triggers:** Replace the polling recurrence with HTTP-triggered flows so the app can invoke PA on demand after creating drafts
2. **Excel Log Reading:** Read the inbox log Excel file from the app to show response tracking and reply rates directly in the dashboard
3. **Status Callbacks:** Have PA write send-success/failure status back to a shared location the app can read
