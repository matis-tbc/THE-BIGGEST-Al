# DESIGN.md — Email Drafter Current Design + Revamp Brief

> This file is the single-source-of-truth snapshot of the app's current UX, visual language, data flow, and known pain points. Drop it into Claude (or any design tool) when planning a revamp. The goal is: keep the things that work, rebuild the things that don't.

---

## What this app is

**Email Drafter** is an Electron + React + TypeScript desktop app that lets a user create Microsoft Outlook drafts in bulk — with smart contact import, per-recipient template routing, per-row attachments, sender-profile signatures, scheduled send, reply tracking, and a preflight gate that blocks bad sends.

It's used by:
- **CU Hyperloop Bus Dev** (primary today) for sponsor outreach, thank-yous, and renewal asks.
- Any small team that needs "mail merge but with an audit trail, local SQLite, and attachments" without paying a CRM. Long-term vision is generic.

Signed-in state is a single Microsoft Graph identity (Matis or `cuhyperloop@colorado.edu` shared account). No multi-tenant, no server backend — everything lives in localStorage + a local SQLite file (`better-sqlite3`) at `userData/emaildrafter.db`.

---

## Current visual language

### Palette

Hard-coded CU brand in a few places, most things free:

- **Background** — deep navy: `#06080f` (`tunnel-900`) with card layer `slate-800/#0a1222`.
- **Accent** — CU Gold `#CFB87C` (hardcoded in signature rendering).
- **Primary interactive** — sky-blue `#4f8cff` (`primary-500`) for buttons.
- **Semantic** — emerald (ok), amber/yellow (warn), rose (fail), cyan (info), indigo/purple (in-flight stages).
- **Neon accents** — `#32f0ff` (cyan), `#f7c75d` (amber). Used sparingly in hero/tunnel chrome.

See `tailwind.config.js` for full palette. CSS is **100% Tailwind** (no CSS modules). Utility-first.

### Typography

Default stack (Tailwind defaults — `system-ui, sans-serif`). No custom fonts loaded. Signature inherits parent font.

### Spacing + chrome

- Cards: `rounded-xl` or `rounded-2xl`, `bg-slate-800/50`, `border border-slate-700`, `p-4`/`p-6`.
- Buttons: `btn-primary` (yellow-500 bg) and `btn-secondary` (border-slate-700). Defined in `src/index.css`.
- Status chips: 2-char padding, tiny uppercase tracking, rounded, with colored border-20 + bg-10 patterns.
- Dark-mode only. No light theme exists.
- Some tunnel-themed chrome (rotating borders, glow shadows) in `SplashScreen` and `TunnelScene` that's more "rendered" than utilitarian — visually striking but inconsistent with the rest.

---

## Information architecture

### Top-level screens (one-at-a-time, no tabs)

User navigates via an app-state `currentStep` string. Each state renders a different component. There is NO router — it's a state machine.

| Step | Component | Purpose |
|---|---|---|
| `splash` | `SplashScreen` | Initial boot with tunnel animation |
| `auth` | `AuthScreen` | Microsoft OAuth sign-in |
| `home` | `CampaignHome` | List campaigns, create new, open existing, sender profiles button, PDF splitter button |
| `campaign-detail` | `CampaignDetail` | Per-campaign view: tabs for Companies / Contacts / Email Finder / Template / Run History; kind chip; action bar with "Run Campaign" + "Retry failed" |
| `campaign-leadgen` | `CompanyGenerator` | AI-driven company discovery (outreach only) |
| `campaign-contacts` | `ContactImport` | CSV upload + column mapper + in-app editor |
| `campaign-template` | `TemplateManager` | Saved templates list (top-3 used + collapsed), paste-template flow, enhanced editor |
| `team` | `MemberManager` | Sender profiles (Identifier + Full Name split), signature preview |
| `attachment` | `AttachmentPicker` | Single-file OR per-row attachment banner |
| `preflight` | `PreflightReview` | Validation checks, per-row template table, preview pane, blocking issues |
| `batch` | `BatchProgress` | Live dispatch progress with 6-column status grid, per-contact rows, send options panel |
| `review` | `ErrorReview` | Post-run results + failures |
| `leadgen` | `CompanyGenerator` | Same as campaign-leadgen but no campaign context |

### Persistent UI chrome

- **App header** (on most screens): Email Drafter Pro brand · Quick Actions (⌘K) · Insights · Replies (live dot if unread)
- **CommandPalette** (⌘K): fuzzy navigate to any step/campaign/action
- **InsightsPanel** (drawer): KPIs, funnel, per-campaign table, CSV export
- **RepliesPanel** (drawer): inbound reply threading with Haiku classifier categories
- **AppErrorBoundary** + **RendererErrorOverlay** for crash recovery

### Wizard-style numeric stepper

Displayed at the top during a campaign run: `Import Contacts → Select Template → Choose Attachment → Preflight Review → Create Drafts → Review Results` with green-check / yellow-current / gray-upcoming states. Doesn't always visually reflect completion (bug).

---

## User flows

### Flow A: Cold outreach campaign (default)

1. Home → New Campaign → pick kind "Outreach"
2. CampaignDetail → Lead Generation (AI suggests companies matching the brief)
3. Email Finder runs pattern guesses against domains
4. Contact Import for manual CSV or confirmed guesses
5. Template Manager → pick or create a template
6. Run Campaign → Attachment → Preflight → Batch → Review

### Flow B: Non-outreach (follow-up / announcement)

User creates campaign with kind "Follow-up" or "Announcement". Skips lead-gen. Softer validation (CU Hyperloop subject guard becomes info-only). Schedule mode defaults to tomorrow 8 AM instead of "now + 30 min".

### Flow C: The sponsor thank-you (canonical test)

This is what the app was hardened on most recently. 41 sponsors (now 42 after the Ansys split), each gets their own PDF attachment + per-sponsor paragraph via a personalized cover email routed through 4 template variants (A/B/C/D). See `CU HYPERLOOP/Bus Dev/Sponsors/Sponsor Thank You 2025-2026 Status.md` in the vault for the full story.

---

## Data model (what's stored and where)

### LocalStorage (browser, persisted)

| Key | Shape | Owner |
|---|---|---|
| `email-drafter.campaigns.v1` | `Campaign[]` (id, name, kind, contacts, runs, companies) | campaignStore |
| `email-drafter.templates.v1` | `StoredTemplate[]` (content, subjects[], variables[], useCount, lastUsedAt, versions[]) | projectStore |
| `email-drafter.projects.v1` | `StoredProjectSnapshot[]` (legacy, mostly unused) | projectStore |
| `email-drafter.team.v1` | `TeamMember[]` (name, identifier, role, major, phone, email) | teamStore |
| `email-drafter.scheduled-local-time` | ISO local datetime string (last-used schedule) | userPrefs |
| `email-drafter.kind-migrated.v1` | `"true"` sentinel | campaignStore migration |
| `email-drafter.sponsor-thank-you-seeded.v6` | `"true"` sentinel | sponsor template seed |
| `email-drafter.show-first-run-notice` | `pending` / `dismissed` | first-run banner |
| `seeded_v11` | `"true"` sentinel for default templates | legacy |

### SQLite (local file, persisted)

`userData/emaildrafter.db` via `better-sqlite3`. Tables:

- `recipients` — one row per dispatched email. Stores `identity_email`, `to_email`, `run_id`, `campaign_id`, `subject`, `graph_message_id`, `internet_message_id`, `conversation_id`, `mode`, `scheduled_for`, `submitted_at`, `status` (submitted/delivered/failed/bounced), `failure_reason`, `dbError`. This is the audit log.
- `replies` — one row per inbound reply matched against a recipient. Haiku-classified into categories (`interested`, `not_interested`, `auto_reply`, `out_of_office`, `bounce`, `needs_followup`, `other`).
- `delta_tokens` — per-identity polling cursors for Inbox + SentItems deltas.
- `runs` — campaign run metadata.
- `companies` — persisted lead-gen results (dedupe cache).
- `meta` — migration flags.

### macOS Keychain

Microsoft OAuth refresh tokens. Not user-visible.

---

## Template system (where variable merge happens)

### Canonical variable resolution (`src/utils/templateMerge.ts`)

Every `{{Variable}}` in a template body / subject / To header runs through `mergeTemplate(content, contact)`:

1. **Pre-expansion** of `{{Signature}}` → 6-line composed block.
2. **Per-variable loop**: for each `{{var}}`, call `getMappedValue(var, contact)` which tries:
   - Direct key match on contact (`contact[var]`)
   - Case-insensitive key match (`contact.first_name` matches `{{First Name}}`)
   - **Canonical resolver** via `normalizeKey(var)` — lowercases, strips underscores/hyphens/whitespace, tolerates plurals (`ies` → `y`, trailing `s` → singular). Then looks up in `CANONICAL_RESOLVERS` table. This is where `first_name` / `First Name` / `firstname` all converge.
   - Fallback empty string.
3. Output fed to `formatEmailBodyHtml` for send.

### Signature rendering (`formatEmailBodyHtml`)

The string `{{Signature}}` expands to:

```
Best,

{{Sender Name}}
CU Hyperloop | {{Sender Role}}
CU Boulder | {{Sender Major}}
{{Sender Phone}} | {{Sender Email}}
```

After inner substitution, the HTML formatter regex-matches `<br><br>Best,<br><br>NAME<br>CU Hyperloop | ...` and wraps the last 4 lines in a styled `<div>` with gold `<strong>` accents. **This is the biggest tech-debt in the design** — see "Hardcoded assumptions" below.

### Canonical merge aliases (paste converter + resolvers)

- `{Name}` / `{Contact Name}` / `{First Name}` → `{{First Name}}` (first token of `contact.name` or `contact.first_name`)
- `{Full Name}` → `{{Name}}`
- `{Last Name}` → derived from last token
- `{Email}` → `{{Sender Email}}` (convention: "email" in a paste usually means the sender's for signature)
- `{Recipient Email}` / `{Contact Email}` → contact's address
- `{Company}` / `{Company Name}` → company
- `{Sender Name}` / `{Sender Role}` / `{Sender Phone}` / `{Sender Email}` / `{Sender Major}` — direct to profile fields

---

## Sender profile system

Two-field split:

- **Full Name** (`name`): rendered in `{{Sender Name}}` and the signature block. E.g. `Owen Wojciak`.
- **Identifier** (`identifier`, optional): matched against CSV `Member` column. E.g. `Owen`. Falls back to Full Name for legacy profiles.

Why split: CSVs stay terse ("Member: Owen") while the signature shows the full name. Matches how humans informally reference teammates.

MemberManager screen has a live signature preview card that renders exactly what the recipient will see (same gold styling).

---

## Dispatch pipeline

```
batchProcessor.processContacts(contacts, templates, defaultTemplateId, attachment, sendOptions)
  │
  ├─ Per recipient, build payload (toEmail + additionalToEmails + bodyHtml + attachmentPath)
  │   Uses mergeTemplate → formatEmailBodyHtml for body
  │
  ├─ IPC → electronAPI.dispatchRun(payload)
  │
  │ (main process)
  │   ├─ For each recipient:
  │   │   ├─ Load per-row attachment from disk (if attachmentPath)
  │   │   ├─ dispatchRecipient(authService, recipient, { mode, deferredSendIso, onPhase })
  │   │   │   ├─ POST /me/messages with buildDraftBody(recipient)
  │   │   │   ├─ onPhase("drafted")  ← UI advances to "Drafted" column
  │   │   │   ├─ if attachment: onPhase("attaching"), upload (<3MB inline or upload session)
  │   │   │   ├─ if send-now / schedule: POST /me/messages/{id}/send
  │   │   │   └─ Return DispatchResult { ok, messageId, conversationId, internetMessageId }
  │   │   ├─ Write recipients row in SQLite
  │   │   └─ Emit final progress event to renderer
  │   └─ Finalize run in SQLite
  │
  └─ Unsubscribe from progress events after dispatchRun resolves
```

Progress events flow back to `BatchProgress.tsx` which paints a 6-column status grid (Pending / Drafting / Drafted / Uploading / Completed / Failed) and per-contact row with name + email + attachment filename.

After draft creation, a separate `SentItems` delta poller runs in `replyPoller.ts` to mark `delivered`. Inbox delta poller matches incoming emails by `conversationId` → stores in `replies` → Haiku classifies (fire-and-forget).

---

## Validation + preflight

`PreflightReview.tsx` runs checks against the selected contacts + active template. Each check is a colored row in a checklist:

| Check | Blocks continue? |
|---|---|
| Invalid emails | Yes (rose) |
| Template errors | Yes |
| Empty recipients after merge | Yes |
| Missing per-row attachment files | Yes |
| Oversize attachments (>150MB) | Yes |
| Template routing failures (CSV name didn't match) | Yes |
| Member column mismatch (no profile) | Yes |
| Unresolved sender fields (template uses `{{Signature}}` but `Sender Name` empty) | Yes |
| Duplicate emails | Warn |
| Empty subjects after merge | Warn |
| Missing "CU Hyperloop" in subject | Warn (outreach only) |
| Subject distribution (A/B split %) | Info |
| Attachment size summary | Info |

Plus two collapsible detail tables:

1. **Per-row template assignment** — every contact + their assigned template. Amber for default-fallback rows, rose for routing mismatches.
2. **Per-row attachments** — clickable list showing file name / size / status.

Plus: single recipient preview (dropdown) with subject + body rendered through `dangerouslySetInnerHTML(sanitizeEmailHtml(...))`. WYSIWYG of the actual draft.

---

## Hardcoded assumptions (the technical debt to fix in the revamp)

1. **"CU Hyperloop" / "CU Boulder" / `#CFB87C`** are hardcoded in:
   - `formatEmailBodyHtml` regex pattern (must match `<br>CU Hyperloop | ...<br>CU Boulder | ...` verbatim)
   - `SIGNATURE_TEMPLATE` string composition
   - MemberManager preview card
   - Preflight CU-Hyperloop-in-subject validation rule
   Any user with a different org/school gets a broken signature + a spurious validation rule.

2. **Signature detection is regex-based**, not structural. The HTML formatter pattern-matches text inside a merged body and wraps it post-hoc. Fragile — any user deviation breaks styling, and different orgs can't use it.

3. **Four sponsor templates are seeded in the codebase** (`sponsorThankYouTemplates.ts`). These are domain-specific artifacts that shouldn't ship in a generic product.

4. **CSV column names with semantic meaning** (`Member`, `attachment_path`, `template`) — users need to know these exact strings. Column mapper helps but doesn't educate.

5. **OAuth app registration is CU-specific**. App ID + redirect URI in the repo point at a single Azure app.

6. **No light theme, no themeable accent.** Gold is not configurable.

7. **Subject validation is CU-specific** — "must contain 'CU Hyperloop'" is a hard-coded rule in preflight.

8. **The tunnel-themed splash + chrome** (`SplashScreen`, `TunnelPlayground`) is CU-Hyperloop vibes. Cool for the team, off-brand for anyone else.

---

## Known UX issues (the disconnects)

Most were patched in the last few sessions but are worth re-examining:

- **Stepper completion state** — steps 3/4 don't show green when passed.
- **"Create Drafts" page** used to hide the per-row attachment info during the actual run; now shows it but the visual design is utilitarian, not delightful.
- **Initial contact import flow** has TWO validation layers (ContactImport's editor + PreflightReview) with slightly different rule sets. Confusing when one says valid and the other says invalid.
- **ColumnMapper** is a wall-of-selects, no visual column preview. Users guess what type each column is.
- **TemplateManager** shows a collapsed "show N more templates" toggle when > 3 exist — works, but the collapse region has no visual distinction from the open one.
- **Paste Template flow** is buried inside TemplateManager as an accordion; easy to miss.
- **SendOptionsPanel** has Mode + Schedule + Stagger + CC inputs stacked vertically — dense and intimidating on first encounter.
- **Campaign kind chip** is clickable but doesn't have a visible affordance (hover hint only).
- **InsightsPanel** + **RepliesPanel** are buttons in the header but feel like afterthoughts; they should be first-class views.
- **No onboarding** — first-time users see an empty home screen with no "start here" signal.
- **Error states** are text-heavy. Stack traces show in `RendererErrorOverlay`; nicer recovery UX would help.

---

## What the revamp should prioritize

**Design goals**:

1. **De-CU the product.** Any sender, any signature, any accent color. Hardcoded strings become profile/team fields. Signature rendering becomes programmatic (not regex-matched).
2. **Delight the first-use path.** Empty state → guided campaign creation → first draft in under 3 minutes without reading docs.
3. **Unify the wizard.** Today's stepper is technically one flow but visually fragmented across 6 screens. Consider: persistent left-nav or a single scrollable canvas.
4. **Reduce the disconnect between preview and reality.** Preview should be pixel-identical to the sent draft, no regex fallback.
5. **Modernize density.** The app currently leans dashboards-and-grids. A cleaner, more guided surface would lower the intimidation factor for non-technical users.
6. **Light theme option.** Some users will want it.

**Non-goals**:

- Rewriting the Graph dispatch pipeline (works).
- Replacing the SQLite audit log (works, handles reply tracking well).
- Moving to a server backend (local-first is a feature, not a bug).

---

## Appendix — where to find things

- UI components: `src/components/`
- Data stores: `src/services/{projectStore,campaignStore,teamStore,userPrefs}.ts`
- Merge engine: `src/utils/templateMerge.ts`
- CSV parser + column inference: `src/utils/csvParser.ts`
- Electron main: `electron/main.ts`
- Graph dispatch: `electron/sendDispatcher.ts`
- SQLite schema + repositories: `electron/db.ts` + `electron/repository/*`
- OAuth: `electron/auth.ts` + `src/services/tokenManager.ts`
- Styling: `src/index.css` (custom classes) + `tailwind.config.js`
- Tests: `src/**/__tests__/*.test.ts` (vitest, 130 passing)
- Architecture doc: `docs/ARCHITECTURE.md`
- User walkthrough: `docs/WALKTHROUGH.md`
- This file (`DESIGN.md`) — the overview for a revamp.

---

**Status**: working app, shipped 40+ real sponsor thank-you drafts on 2026-04-24. Ready for UX/UI overhaul without breaking the dispatch core.
