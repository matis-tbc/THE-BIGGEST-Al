# Architecture

Snapshot of the current code. Phases 0 through 5 of `SEND_SCHEDULING_PLAN.md` are shipped.

## Stack

- **Electron 28** (main + preload + renderer)
- **React 18 + TypeScript + Tailwind** (renderer)
- **Microsoft Graph SDK + raw fetch** for Outlook (renderer uses SDK; main uses raw fetch via `graphHelper`)
- **Anthropic API** for company discovery (Haiku) and reply classification (Haiku)
- **better-sqlite3** for telemetry store at `userData/emaildrafter.db`
- **keytar** for OS-level token storage
- **Vite** dev server on port **5273** (NOT 5173, which the portfolio project owns)
- **OAuth redirect server** on port **3000** (started by main process at boot)

## Process boundaries

```
┌─────────────── Electron Main ────────────────┐    ┌────────── Renderer ──────────┐
│                                              │    │                              │
│  electron/main.ts ─── IPC handlers ──────────┼─◄──┤  src/services/*              │
│  electron/auth.ts ─── OAuth + keytar         │    │    batchProcessor            │
│  electron/graphHelper.ts ─── /me/* fetch     │    │    replyTracker (IPC)        │
│  electron/sendDispatcher.ts ─── per-recipient│    │    replyPoller (60s tick)    │
│  electron/db.ts ─── better-sqlite3 handle    │    │    tokenManager              │
│  electron/repository/* ─── CRUD wrappers     │    │                              │
│  electron/bounceParser.ts ─── DSN parsing    │    │  src/components/*            │
│  electron/anthropic.ts ─── HTTP wrapper      │    │    InsightsPanel             │
│  electron/classifyReply.ts ─── Haiku         │    │    RepliesPanel              │
│  electron/companyGeneratorService.ts ── AI   │    │    SendOptionsPanel          │
│  electron/migrate-from-localstorage.ts       │    │    BatchProgress             │
│  electron/preload.ts ─── window.electronAPI ─┼─►──┤  src/App.tsx (step state)    │
└──────────────────────────────────────────────┘    └──────────────────────────────┘
        │
        ▼ filesystem
   userData/
     ├── runs/<runId>.jsonl       (append-only forensic log)
     └── emaildrafter.db          (SQLite: recipients, replies, delta_tokens, runs, meta)
```

## IPC surface (`electron/main.ts`)

### Auth
- `auth:start-login`, `auth:get-tokens`, `auth:get-user-profile`, `auth:refresh-token`, `auth:logout`, `auth:handle-redirect`, `auth:check-scopes`

### Mail
- `mail:dispatch-run` — orchestrate a full campaign run. Persists each recipient to `recipients` (status: `draft`/`submitted`/`failed`), captures `internet_message_id` + `conversation_id`, creates a `runs` row at start + finalizes counts at end. Routes through deferred delivery if `mode='schedule'` OR `staggerSeconds > 0`.
- `mail:send-drafts` — send pre-existing draft messageIds with optional schedule/stagger. On success, flips matching `recipients.status` to `submitted` + stamps `submitted_at`.
- `mail:poll-inbox-delta` — inbox `/delta` with expanded `body` + `PR_TRANSPORT_MESSAGE_HEADERS`. Main-process inline-marks bounces via `bounceParser.detectBounce` when headers or body indicate a DSN.
- `mail:poll-sent-items-delta` — SentItems `/delta` for delivery confirmation. Separate per-identity delta token (folder=`SentItems`).

### DB
- `db:record-replies` — insert replies, fire-and-forget Haiku classification on each new row.
- `db:list-replies`, `db:list-recipients`, `db:list-runs`, `db:list-campaigns`, `db:recent-activity`, `db:timeline`, `db:metrics`, `db:get-recipient-timeline`
- `db:mark-reply-seen`, `db:mark-all-replies-seen`, `db:mark-delivered`, `db:mark-bounced`
- `db:get-delta-token`, `db:set-delta-token`, `db:clear-delta-token` (per-identity + folder)
- `db:is-migrated`, `db:run-migration` (one-shot localStorage → SQLite)

### Classification
- `replies:reclassify(replyId)` — manual override + re-run.

### App
- `app:open-external`

### Pre-existing
- `company:search` and the `email:*` family (pattern guesser, MX verify, LinkedIn parse).

## Key modules

### `electron/db.ts`
- `initDb(userDataDir)` — opens `userData/emaildrafter.db`, enables WAL + foreign keys, runs `CREATE TABLE IF NOT EXISTS` schema. Called once in `app.whenReady`.
- `getDb()` — returns the shared handle. Throws if called before init.
- `getMeta(key)` / `setMeta(key, value)` — generic key/value for migration flags, future feature gates.

### `electron/repository/*`
- `recipients.ts` — `upsertRecipient`, `listRecipients`, `findByConversationId`, `getRecipientTimeline` (joins replies by conversation_id).
- `replies.ts` — `insertReplyIfNew` (no-op if the id already exists; auto-links `recipient_id` by conversationId), `listReplies`, `markSeen`, `markAllSeen`.
- `runs.ts` — `createRun`, `finalizeRun`, `listRuns`.
- `deltaTokens.ts` — `getDeltaToken` auto-rotates tokens older than 28 days (before Graph returns 410), `setDeltaToken`, `clearDeltaToken`.
- `metrics.ts` — `computeMetrics` — aggregate counts + reply rate.
- `campaigns.ts` — `listCampaignAggregates`, `recentActivity`, `sendsRepliesTimeline` (30d buckets).

### `electron/bounceParser.ts`
Pure function. Recognizes mailer-daemon/postmaster senders, DSN `multipart/report` content types, `Auto-Submitted: auto-replied`, `X-Failed-Recipients:`, and `Final-Recipient:` lines in the body. Returns `{isBounce, failedRecipients[], diagnostic}`.

### `electron/anthropic.ts`
Thin HTTP wrapper around `/v1/messages`. One function, `anthropicMessage({model, maxTokens, system, messages})`. Reads `ANTHROPIC_API_KEY` from env.

### `electron/classifyReply.ts`
- `classifyAndPersist(replyId)` — idempotent (short-circuits if already classified). Calls Haiku, parses strict JSON, updates `replies.classification*` columns.
- `reclassify(replyId)` — clears classification columns and re-runs.
- Categories: `interested | not_interested | auto_reply | out_of_office | bounce | needs_followup | other`.
- Cost at projected volume (~150 replies/mo): ~$0.20/mo.

### `electron/migrate-from-localstorage.ts`
`runMigration(dump)` idempotent, gated by `meta.migrated_from_localstorage_v1`. Takes `{tracked, replies, deltaLinks}` the renderer dumps from localStorage, upserts into SQLite. Renderer clears localStorage keys on success.

### `electron/sendDispatcher.ts`
`dispatchRecipient(authService, recipient, options)` — atomic per-recipient: POST `/me/messages` (with optional deferred-send extended property) → optional attachment (inline ≤3MB or upload session) → optional POST `/me/messages/{id}/send`. Returns `{recipientId, ok, messageId, conversationId, internetMessageId?, error?}`.

### `src/services/batchProcessor.ts`
`BatchProcessor.processContacts(...)` — builds recipient payloads, reads File → base64, calls `electronAPI.dispatchRun` with `identityEmail` attached. Main process owns persistence; renderer no longer writes to `replyTracker` directly.

### `src/services/replyTracker.ts`
All functions async, backed by IPC. Public surface: `getReplies`, `recordReplies`, `markReplySeen`, `markAllRepliesSeen`, `getDeltaLink`, `setDeltaLink`, `getTrackedRecipientByConversation`, `migrateFromLocalStorageOnce`. No more direct localStorage writes; legacy dumps flow through `dbRunMigration` on first poll then get cleared.

### `src/services/replyPoller.ts`
- 60s interval. Each tick: one-shot migrate → inbox poll → fire-and-forget SentItems poll → classify new replies (main-process side).
- `subscribeHealth(listener)` — live `{lastPollAt, lastError}` for the header dot.
- `backfill()` — clears both delta tokens and re-polls from scratch.

### `src/components/InsightsPanel.tsx`
Slide-out modal. Hero metrics (sent/delivered/replied/bounced/failed), 30d sparklines, funnel bar, per-campaign table (sortable), recent activity feed (sends + replies interleaved), CSV export of all recipients for the active identity. Scoped to current `identityEmail` automatically.

### `src/components/RepliesPanel.tsx`
Slide-out modal with:
- **Health dot** on the trigger button (green <2m since last poll, amber <10m, rose on error/stall).
- **Notification opt-in banner** (shown only if `Notification.permission === 'default'`).
- **Backfill button** clears delta tokens, re-polls from scratch.
- **Classification badges** per reply, color-coded by category.

### `src/components/SendOptionsPanel.tsx`, `BatchProgress.tsx`
Unchanged from Phase 0. See `SEND_SCHEDULING_PLAN.md` for the pipeline behaviors.

## Storage

| Where | What | Lifecycle |
|---|---|---|
| OS keychain (keytar) | OAuth access + refresh tokens | Cleared on logout. |
| `userData/runs/<runId>.jsonl` | Append-only forensic log of every IPC handler that touched a recipient | Never auto-deleted. |
| `userData/pending-auth.json` | OAuth state during redirect window | Cleared after redirect handled. |
| `userData/emaildrafter.db` | SQLite telemetry: `recipients`, `replies`, `delta_tokens`, `runs`, `meta` | WAL mode. One-shot migrate from localStorage on first run; old localStorage keys cleared after success. |
| localStorage `campaigns`, `templates`, `members`, etc. | Existing campaign/template state (unrelated to reply telemetry) | Stays in localStorage. |

## Account model

Direct sign-in as either Matis personally or `cuhyperloop@colorado.edu` (a regular Entra user with shared credentials, NOT a delegated shared mailbox). All Graph calls are `/me/...`. `Mail.Send.Shared` and `Mail.ReadWrite.Shared` are NOT used. Switch account via SendOptionsPanel → `logout()` + `startLogin()`.

## Reliability

- **Token refresh**: `graphHelper.graphFetch` retries any 401 once after `refreshAccessToken`.
- **Idempotent sends**: every recipient gets a UUID, sent as `client-request-id` header for Graph server-side dedup.
- **Forensic log**: `appendRunLog` writes before the IPC returns.
- **Stagger via deferred delivery**: app-quit-safe. Exchange holds and releases deferred messages regardless of client state.
- **Per-identity delta tokens**: switching accounts doesn't reset reply or delivery scanning. Auto-rotate at 28 days to avoid Graph 410.
- **WAL journal**: SQLite survives power loss with minimal data loss.
- **Poller health dot**: live visible state so users can tell if polling is silently stalled.

## Build quirks

Python 3.13 removed `distutils`. To get `better-sqlite3` to build natively against Electron 28 on macOS:

- `.venv/` at project root has `setuptools` installed.
- `.npmrc` pins `python=$PWD/.venv/bin/python3`.
- `package.json` `postinstall` sets `CPLUS_INCLUDE_PATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1` because the Xcode Command Line Tools default `c++/v1` include directory is missing stdlib headers (`climits`, etc).

Fresh installs: `npm install` → postinstall rebuilds native deps with the working env. If CLT gets reinstalled and the SDK path fixes itself, the env var becomes a harmless no-op.

## Verification (live smoke test)

1. 5 sends → 5 rows in `recipients` with status=`submitted`.
2. Reply to one → lands in `replies` with classification within ~10s; matching recipient status flips to `delivered`.
3. Send to `nobody@nonexistent-tld.invalid` → status=`bounced` with diagnostic within ~5 min.
4. Restart app → Replies panel + Insights panel still populated from SQLite.
5. Kill network 2 min → health dot rose → auto-recovers on reconnect.

## Known gaps

- Per-recipient timeline drilldown (API exists: `db:get-recipient-timeline`) is not yet surfaced in InsightsPanel UI.
- Insights date-range filter is hardcoded to 30d; needs UI toggle.
- Schema uses `CREATE TABLE IF NOT EXISTS` only; future schema changes will need explicit `ALTER TABLE` migrations keyed on `meta` version.
- Classification runs on every new reply synchronously within the poller tick; very high reply volumes could starve the main thread. Queue + rate-limit if that ever becomes real.
