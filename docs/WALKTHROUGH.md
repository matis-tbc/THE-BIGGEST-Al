# Email Drafter - Feature Walkthrough

## Overview

Email Drafter is a desktop app for creating bulk Outlook draft emails for CU Hyperloop sponsorship outreach. It handles the full pipeline: import contacts, assign templates, merge variables, attach sponsorship packets, and batch-create drafts via the Microsoft Graph API.

---

## 1. Template Paste Import

**What it does:** Paste raw template text from Google Docs and it auto-converts to the app's format.

**How to use:**
1. Open the Template page (via campaign or the linear flow)
2. Click **"Paste Template"** to expand the panel
3. The **Template Name** field is at the top. Leave it blank for auto-detection or type your own
4. Paste your template text into the textarea
5. The app **instantly auto-converts** on paste:
   - `{Name}` becomes `{{First Name}}`
   - `{Your Name}` becomes `{{Sender Name}}`
   - `{Company Name}` becomes `{{Company}}`
   - `{Role}` becomes `{{Sender Role}}`
   - `{Major}` becomes `{{Sender Major}}`
   - `{Phone Number}` becomes `{{Sender Phone}}`
   - `{Email}` becomes `{{Sender Email}}`
6. The template name auto-fills from the content (e.g., "reaching out to Zayo Group because..." extracts "Zayo Group")
7. If all variables are recognized, you see a green **"7 variables auto-mapped"** badge. Click "details" to see the full mapping table
8. Subject lines default to A/B: `"CU Hyperloop // {{Company}}"` and `"Partnership Opportunity - CU Hyperloop"`. Click "edit" to change
9. Click **"Save Template"** - done

**Template variable reference:**

| In Google Docs | In the app | What it becomes |
|---|---|---|
| {Name} | {{First Name}} | Contact's first name |
| {CONTACT NAME} | {{First Name}} | Contact's first name |
| {Your Name} or {MY NAME} | {{Sender Name}} | Team member's full name |
| {Role} | {{Sender Role}} | Team member's role |
| {Major} | {{Sender Major}} | Team member's major |
| {Phone Number} | {{Sender Phone}} | Team member's phone |
| {Email} | {{Sender Email}} | Team member's email |
| {Company Name} or {Company} | {{Company}} | Contact's company |

---

## 2. Smart Contact Paste (Column Mapper)

**What it does:** Paste tab-separated contact data from Google Sheets without needing a header row. The app auto-detects column types.

**How to use:**
1. Copy rows from your spreadsheet (no need to include headers)
2. Go to Import Contacts, paste into the textarea, click **"Import from Pasted Text"**
3. If the app detects headerless data, the **Column Mapper** appears:
   - Each non-blank column shows sample values and an auto-detected type
   - Types detected: Name, Email, Company, Title/Role, Team Member, Template Code, Campaign Tag, Date, Notes, Doc Link (skipped)
   - Override any column by clicking the dropdown
4. Click **"Confirm Mapping"** to import

**Template code matching:**
Your spreadsheet's template code column (GO, GD, Zayo, WRF, etc.) auto-matches to templates:

| Code | Matches template |
|---|---|
| GO | General Oil & Engineering (GO) |
| GD | General Defense (GD) |
| Zayo | Zayo Group |
| WRF | Water Research Foundation (WRF) |
| Micron | Micron |
| Intel | Intel |
| Texas Instruments | Texas Instruments |
| Qorvo | Qorvo |
| L3Harris | L3Harris |
| SRC | SRC |
| Digikey | Digikey |

**Team member injection:**
If the spreadsheet has a "Member" column (e.g., "Owen", "Alex"), the app looks up the team member's profile and auto-injects their name, role, major, phone, and email into the contact data for template merging.

---

## 3. Subject Line A/B Testing

**What it does:** Each template has 2+ subject lines that alternate across contacts.

**How it works:**
- Default subjects: `"CU Hyperloop // {{Company}}"` and `"Partnership Opportunity - CU Hyperloop"`
- Contact #1 gets Subject A, #2 gets Subject B, #3 gets Subject A, etc.
- In the template editor, a distribution hint shows: "Subject 01 = 24, Subject 02 = 23"
- In preflight review, the Subject Distribution section shows each variant with count, percentage, and a progress bar
- Each contact preview shows an `[A]` or `[B]` badge next to the subject

---

## 4. Campaign Workflow

**Full flow:**
1. **Create Campaign** from the home screen
2. **Companies tab** - generate target companies with AI or add manually
3. **Contacts tab** - import contacts (paste from spreadsheet or upload CSV)
4. **Template tab** - select a template (per-contact templates from import are used automatically)
5. **Run Campaign** - select attachment (sponsorship PDF), run preflight review, create drafts

**Per-contact templates:**
If contacts were imported with a template column, each contact already has a template assigned. The campaign-level template is just a fallback for contacts without one. If every contact has a template, you can run without selecting a campaign-level template.

---

## 5. Preflight Review

**What it shows:**
- Invalid/duplicate email counts
- Template errors (missing variables)
- Empty subjects/recipients after merge
- Missing "CU Hyperloop" in subject (required for Power Automate)
- Per-contact issues with name, email, template name, and specific errors/warnings
- Click the eye icon to preview that contact's merged email
- Subject distribution with `[A]`/`[B]` badges and percentage bars

**Attachment safety:**
If you selected a PDF attachment and the upload fails (e.g., 429 rate limit), those contacts are marked as **failed** with "Attachment upload did not complete" - they won't silently pass as "completed" without the attachment.

---

## 6. Batch Progress

- Shows real-time status: Pending, Drafting, Drafted, Uploading (attachment), Completed, Failed
- Progress bar with percentage
- When done, stays on the progress screen until you click **"Review Results"**
- Export results as CSV for record-keeping

---

## 7. Seeded Templates (14 total)

The app comes pre-loaded with these monetary outreach templates:

1. **Zayo Group** - fiber infrastructure focus
2. **Qorvo** - RF/power management/sensors
3. **Digikey** - long-term component supplier relationship
4. **L3Harris** - defense/resilient communications
5. **SRC** - semiconductor research/hardware reliability
6. **Water Research Foundation (WRF)** - infrastructure/water sector
7. **General - Reliable Systems** - generic for reliable systems companies
8. **General - Hardware Validation** - generic for hardware companies
9. **General - Analog & Embedded** - generic for analog/embedded (TI-style)
10. **General Defense (GD)** - defense/constrained environments
11. **General Oil & Engineering (GO)** - oil/energy/cross-discipline
12. **Micron** - memory/semiconductor
13. **Intel** - hardware validation
14. **Texas Instruments** - analog/embedded processing

Plus the original 8 seed templates (Digikey, Robbins, General Tunneling, Skanska, 3M, Exxon, Delve Underground, Amtrak) and 6 in-kind templates (Global Industrial, KD Kanopy, EZ-UP, Custom Tents, Tent Craft, American Tent).

---

## 8. Team Member Profiles

Set up in the **Team Manager** (accessible from the home screen):
- Each member has: Name, Role, Major, Phone, Email
- When contacts are imported with a "Member" column, the member's profile is auto-injected
- Template variables like `{{Sender Name}}`, `{{Sender Role}}`, etc. are filled from the profile

---

## 9. Replies Panel

Button in the app header, with a health dot:

- **Green** = polling healthy (<2m since last tick)
- **Amber** = slow (2-10m)
- **Rose** = error or stalled

Click the button to open the panel. Each reply row shows:
- Sender, subject, preview
- A color-coded **classification badge**: interested, not_interested, auto_reply, out_of_office, bounce, needs_followup, other
- Click a reply to mark it seen; close the panel to mark all seen

Controls:
- **Refresh**: force a poll now
- **Backfill**: clear inbox + SentItems delta tokens and re-scan from scratch (useful if you reinstall or change Graph permissions)
- **Enable notifications** banner (first launch only): opt in once for desktop notifications on new replies

---

## 10. Insights Panel

Button in the app header next to Replies.

- **Hero metrics**: Sent, Delivered, Replied, Bounced, Failed, each with percentage of total
- **30-day sparklines** for sends + replies
- **Funnel**: Sent → Delivered → Replied bar chart
- **Per-campaign table**: sends, deliveries, replies, bounces, reply rate, last activity
- **Recent activity feed**: last 50 sends + replies interleaved, chronologically
- **Export CSV**: dump all recipients for the active identity

Scoped automatically to the signed-in account. Switch accounts in the Send Options panel to see the other identity's data.

---

## 11. Send modes: Draft / Send now / Schedule

In the Send Options panel before each run:

- **Draft** — create drafts, don't send. Review in Outlook, then return to the app and use the "Send N drafts" button with optional stagger/schedule.
- **Send now** — send immediately. If stagger > 0, each recipient is submitted with a deferred-send property (server-side staggering, so the app can close).
- **Schedule** — pick a date and time. Messages submit now but Exchange holds them until release. App can close; machine can sleep.

Scheduled/staggered sends write to `userData/runs/<runId>.jsonl` and the SQLite recipient table before returning, so you can audit after the fact.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+K (Mac) / Ctrl+K (Win) | Open command palette |
| Command palette | Quick navigate to Home, Team, Tunnel, create campaign, sign out |
