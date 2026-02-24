# Email Drafter - Application Workflow & Architecture

## Current Application Flow

```mermaid
flowchart TD
    A[Start Application] --> B{Auth Check}
    B -->|Not Authenticated| C[Auth Screen]
    B -->|Authenticated| D[Campaign Home]
    
    C -->|OAuth Success| D
    
    D -->|Start New Campaign| E[Contact Import]
    E -->|CSV Upload/Edit| F[Template Selection]
    F -->|Select/Create Template| G[Attachment Picker]
    G -->|Choose File| H[Preflight Review]
    H -->|Validate Data| I[Batch Processing]
    
    I -->|Process 20/batch| J{Processing Complete?}
    J -->|Yes| K[Error Review]
    J -->|No| I
    
    K -->|Review Results| L{Any Failures?}
    L -->|Yes| M[Retry Failed Contacts]
    L -->|No| N[Campaign Complete]
    
    M --> E
    
    N -->|Start Over| D
    N -->|Export Results| O[Export CSV]
```

## Current System Architecture

```mermaid
graph TB
    subgraph "Frontend (React)"
        UI[React Components]
        State[React State Management]
        Styles[Tailwind CSS]
    end
    
    subgraph "Services Layer"
        Auth[Auth Service]
        Batch[Batch Processor]
        Graph[Graph Client]
        Attach[Attachment Handler]
        Store[Data Stores]
    end
    
    subgraph "Data Layer"
        Local[LocalStorage]
        Keytar[OS Keychain]
    end
    
    subgraph "External APIs"
        MS[Microsoft Graph API]
        Azure[Azure AD]
    end
    
    UI --> State
    State --> Services
    Services --> Data
    Services --> External
    
    Auth --> Azure
    Graph --> MS
    Batch --> Graph
    Attach --> Graph
    Store --> Local
    Auth --> Keytar
```

## Proposed Enhanced Workflow

```mermaid
flowchart TD
    A[Start Application] --> B{First Time?}
    B -->|Yes| C[Interactive Tutorial]
    B -->|No| D{Auth Check}
    
    C --> D
    
    D -->|Not Authenticated| E[Auth Screen<br/>with improved UX]
    D -->|Authenticated| F[Dashboard<br/>with Analytics]
    
    E -->|OAuth Success| F
    
    F -->|New Campaign| G[Smart Contact Import<br/>with deduplication]
    F -->|Template Library| H[Template Manager<br/>WYSIWYG Editor]
    F -->|Campaign History| I[Analytics Dashboard]
    
    G -->|Enhanced CSV Processing| J[Contact Validation<br/>& Cleaning]
    J --> K[Template Selection<br/>with Preview]
    
    H --> K
    
    K --> L[Attachment Picker<br/>with progress estimation]
    L --> M[Advanced Preflight<br/>with warnings/suggestions]
    M --> N[Intelligent Batch Processing<br/>with partial recovery]
    
    N --> O{Processing Complete?}
    O -->|Yes| P[Comprehensive Review<br/>with analytics]
    O -->|No| N
    
    P --> Q{Success Rate > 95%?}
    Q -->|Yes| R[Campaign Complete<br/>Export & Share]
    Q -->|No| S[Smart Retry System<br/>auto-fix suggestions]
    
    S --> G
    
    R -->|New Campaign| F
    R -->|Schedule Next| T[Scheduler<br/>future campaigns]
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI
    participant Service as Batch Processor
    participant Graph as Graph Client
    participant MS as Microsoft Graph
    participant DB as Database
    
    User->>UI: Upload CSV Contacts
    UI->>Service: Process Contacts
    Service->>DB: Store Contacts
    
    User->>UI: Select Template
    UI->>DB: Load Template
    
    User->>UI: Choose Attachment
    UI->>Service: Prepare Attachment
    
    User->>UI: Start Processing
    UI->>Service: Begin Batch Processing
    
    loop For Each Batch 20 contacts
        Service->>Graph: Create Drafts Batch
        Graph->>MS: API Call
        MS-->>Graph: Draft IDs
        Graph-->>Service: Results
        
        Service->>Graph: Attach Files
        Graph->>MS: Upload Session
        MS-->>Graph: Upload Complete
        Graph-->>Service: Attachment Status
    end
    
    Service->>DB: Store Results
    Service->>UI: Update Progress
    UI->>User: Show Results
```

## Permission Boundary Diagram

```mermaid
graph LR
    subgraph "Application Scope"
        A[Contact Data]
        B[Templates]
        C[Local Storage]
        D[UI State]
    end
    
    subgraph "Microsoft Graph Access<br/>Current Permissions"
        E[Create Drafts]
        F[Read User Profile]
        G[Upload Attachments]
    end
    
    subgraph "Microsoft Graph Access<br/>NOT Available"
        H[Send Emails]
        I[Read Mailbox]
        J[Access Calendar]
        K[Read Contacts]
    end
    
    A --> E
    B --> E
    E --> G
    F --> D
    
    style H fill:#f96
    style I fill:#f96
    style J fill:#f96
    style K fill:#f96
```

## Improvement Implementation Sequence

```mermaid
gantt
    title Email Drafter Improvement Timeline
    dateFormat  YYYY-MM-DD
    section Foundation
    SQLite Migration        :crit, 2026-02-24, 7d
    Error Handling Enhance  :2026-02-24, 5d
    Testing Infrastructure  :2026-03-03, 7d
    
    section User Experience
    Template Editor         :2026-03-10, 10d
    Contact Management      :2026-03-10, 8d
    Analytics Dashboard     :2026-03-20, 10d
    
    section Performance
    Memory Optimization     :2026-03-30, 7d
    Batch Processing Opt    :2026-03-30, 5d
    Caching Implementation  :2026-04-06, 5d
    
    section Polish
    Keyboard Shortcuts      :2026-04-10, 3d
    Theme Support           :2026-04-10, 3d
    Documentation           :2026-04-13, 5d
```

## Key Decision Points

### 1. Database Migration Strategy
```
Option A: Gradual Migration
- Keep LocalStorage for existing data
- New data goes to SQLite
- Background migration process
- Risk: Data inconsistency

Option B: Big Bang Migration  
- One-time migration script
- Validate all data before cutover
- Risk: Migration failure

Recommended: Option B with rollback plan
```

### 2. Template Editor Technology
```
Option A: Tiptap (ProseMirror based)
- Pros: Extensible, good React support
- Cons: Larger bundle size

Option B: Draft.js (Facebook)
- Pros: Stable, good documentation
- Cons: Less active development

Option C: Custom simple editor
- Pros: Lightweight, full control
- Cons: More development time

Recommended: Option A (Tiptap) for balance
```

### 3. Error Recovery Strategy
```
Option A: Automatic retry with backoff
- Pros: Better user experience
- Cons: May hide underlying issues

Option B: Manual retry with analysis
- Pros: User learns from errors
- Cons: More user intervention

Option C: Hybrid approach
- Automatic for transient errors
- Manual for persistent errors

Recommended: Option C with clear error categorization
```

## Monitoring Points

### Application Health Checks
1. **Authentication Success Rate** (>95%)
2. **Draft Creation Success Rate** (>99%)
3. **Attachment Upload Success Rate** (>98%)
4. **Batch Processing Time** (<30 seconds per batch)
5. **Memory Usage** (<100MB for 10k contacts)

### User Experience Metrics
1. **Time to First Campaign** (<5 minutes)
2. **Template Creation Time** (<2 minutes)
3. **Error Recovery Time** (<1 minute)
4. **User Satisfaction Score** (>4/5)

### Technical Metrics
1. **API Call Latency** (p95 < 500ms)
2. **Database Query Performance** (<50ms)
3. **Bundle Size** (<5MB)
4. **Startup Time** (<3 seconds)

## Risk Assessment Matrix

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| Graph API rate limiting | High | Medium | Implement exponential backoff, queue management |
| Large file upload failure | Medium | High | Resumable uploads, chunk verification |
| Data migration failure | Low | High | Backup before migration, rollback plan |
| Memory leak with large datasets | Medium | High | Memory profiling, virtual scrolling |
| Authentication token expiry | High | High | Automatic refresh with buffer |
| LocalStorage data loss | Medium | High | SQLite migration priority |

## Conclusion

The current workflow is functional but has several areas for improvement. The proposed enhancements focus on:
1. **Data persistence** (migrating from LocalStorage to SQLite)
2. **User experience** (better editors, previews, analytics)
3. **Error resilience** (smarter retry and recovery)
4. **Performance** (optimized processing and memory usage)

The modular architecture allows for incremental improvements without major rewrites. Starting with the foundation (database migration and error handling) will provide the stability needed for subsequent user experience enhancements.