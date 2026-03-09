# Data Storage Migration Analysis & Recommendations

## Current State Analysis

### Current Implementation
- **Storage Method**: `window.localStorage` (browser-based, limited to ~5-10MB)
- **Data Structures**: JSON serialization of arrays/objects
- **Files Affected**:
  1. `src/services/projectStore.ts` - Templates and project snapshots
  2. `src/services/campaignStore.ts` - Campaigns, messages, events
- **Limitations**: 
  - Data loss if browser data cleared
  - No transaction support
  - Limited query capabilities
  - Poor performance with large datasets
  - No backup/restore functionality

## Available Options for Always-On PC

### Option 1: Local SQLite Database (Recommended)
**Cost**: $0 (already included in dependencies)
**Complexity**: Medium
**Best for**: Single-user desktop application with always-on PC

**Pros:**
- ✅ Already has `better-sqlite3` dependency installed
- ✅ Zero cost, no external services needed
- ✅ Excellent performance for desktop applications
- ✅ ACID compliance with transactions
- ✅ File-based, easy to backup/copy
- ✅ Works offline
- ✅ Mature with good tooling

**Cons:**
- ❌ Single-file database (corruption risk)
- ❌ Limited concurrent write performance
- ❌ No built-in replication

**Implementation Approach:**
- Use existing `better-sqlite3` package
- Store database file in user's app data directory
- Implement migration from LocalStorage
- Add backup/restore functionality

### Option 2: PostgreSQL (Local Installation)
**Cost**: $0 (open source)
**Complexity**: High
**Best for**: Multi-user or future scaling needs

**Pros:**
- ✅ Robust enterprise-grade database
- ✅ Excellent concurrent performance
- ✅ Advanced query capabilities
- ✅ Built-in replication options
- ✅ Better for future multi-user scenarios

**Cons:**
- ❌ Requires separate installation/management
- ❌ Higher memory/CPU usage
- ❌ More complex setup and maintenance
- ❌ Overkill for single-user desktop app

### Option 3: SQLite with WAL mode (Enhanced)
**Cost**: $0
**Complexity**: Medium
**Best for**: Better performance with concurrent reads

**Pros:**
- ✅ All SQLite benefits
- ✅ Better concurrent read performance
- ✅ Reduced write contention
- ✅ Still zero cost and simple

**Cons:**
- ❌ Slightly more complex configuration
- ❌ Still single-file limitations

### Option 4: LiteFS (Distributed SQLite)
**Cost**: $0 (open source)
**Complexity**: High
**Best for**: Future distributed scenarios

**Pros:**
- ✅ SQLite with replication
- ✅ Good for multiple instances
- ✅ Built by Fly.io for edge distribution

**Cons:**
- ❌ Complex setup
- ❌ Overkill for current needs

### Option 5: Cloud Database (Supabase/Neon)
**Cost**: $0-$25/month (free tier available)
**Complexity**: Medium-High
**Best for**: Cloud-first or multi-device access

**Pros:**
- ✅ Cloud backup automatically
- ✅ Access from multiple devices
- ✅ Managed service (no maintenance)
- ✅ Good free tiers available

**Cons:**
- ❌ Monthly cost for higher usage
- ❌ Requires internet connection
- ❌ Data privacy concerns
- ❌ Vendor lock-in

## Recommendation: SQLite with Enhanced Features

### Why SQLite is the Best Choice:

1. **Cost Effective**: Already paid for (in dependencies), zero ongoing cost
2. **Development Ready**: `better-sqlite3` is already in `package.json`
3. **Desktop Friendly**: Perfect for single-user desktop applications
4. **Low Maintenance**: No server to manage, just file backups
5. **Performance**: More than sufficient for email campaign data

### Enhanced SQLite Implementation:

```typescript
// Proposed database schema
const SCHEMA = `
-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT, -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  versions TEXT DEFAULT '[]' -- JSON array of version objects
);

-- Template versions (separate table for better querying)
CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT,
  attachment_name TEXT,
  status TEXT DEFAULT 'drafted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign messages
CREATE TABLE IF NOT EXISTS campaign_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  message_id TEXT,
  status TEXT DEFAULT 'drafted',
  draft_created_at TIMESTAMP,
  queued_at TIMESTAMP,
  send_started_at TIMESTAMP,
  sent_at TIMESTAMP,
  replied_at TIMESTAMP,
  error TEXT,
  idempotency_key TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Message events
CREATE TABLE IF NOT EXISTS message_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  message_id TEXT,
  contact_id TEXT,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Contacts (for future enhancement)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT,
  department TEXT,
  custom_fields TEXT, -- JSON object
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(status);
CREATE INDEX IF NOT EXISTS idx_message_events_campaign_id ON message_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates(updated_at DESC);
`;
```

## Migration Strategy

### Phase 1: Dual-Write Approach (Safest)
1. **Create new SQLite database service**
2. **Modify stores to write to both LocalStorage AND SQLite**
3. **Read from SQLite when available, fallback to LocalStorage**
4. **Run validation to ensure data consistency**

### Phase 2: Data Migration
1. **Create migration script** that reads LocalStorage and writes to SQLite
2. **Validate migrated data** (counts, sample records)
3. **Provide rollback option** (keep LocalStorage backup)

### Phase 3: Cutover
1. **Update all services to read/write only from SQLite**
2. **Remove LocalStorage dependencies**
3. **Keep LocalStorage as backup for 30 days**
4. **Implement automatic backup of SQLite database**

## Implementation Plan

### Week 1: Foundation
1. **Create database service** (`src/services/database.ts`)
   - SQLite connection management
   - Schema initialization
   - Migration utilities
2. **Implement basic CRUD operations**
3. **Add database backup functionality**

### Week 2: Store Migration
1. **Migrate `projectStore.ts` to SQLite**
   - Create `SQLiteProjectStore` class
   - Implement same interface
   - Add dual-write capability
2. **Migrate `campaignStore.ts` to SQLite**
   - Create `SQLiteCampaignStore` class
   - Implement analytics queries in SQL

### Week 3: Data Migration & Testing
1. **Create migration script**
2. **Test with sample data**
3. **Implement validation checks**
4. **Create rollback procedure**

### Week 4: Cutover & Optimization
1. **Update application to use SQLite stores**
2. **Remove LocalStorage dependencies**
3. **Add database maintenance tasks**
4. **Implement automatic backups**

## Cost Analysis

### SQLite Solution
- **Initial Development**: 4 weeks of development time
- **Ongoing Cost**: $0
- **Infrastructure**: Uses existing PC storage
- **Backup Cost**: $0 (backup to same PC or cloud storage)

### Cloud Solution Comparison
- **Supabase Free Tier**: $0/month (500MB database, 50MB file storage)
- **Supabase Pro**: $25/month (8GB database, 100GB file storage)
- **Neon Free Tier**: $0/month (3GB storage, 10k row limit)
- **Neon Pro**: $19/month (100GB storage)

### Total Cost of Ownership (3 years)
- **SQLite**: $0 + development time
- **Cloud Basic**: $0-$900 (depending on tier)
- **Cloud Pro**: $900-$2,700

## Risk Mitigation

### Data Loss Risks
1. **SQLite File Corruption**
   - Solution: Daily automated backups
   - Solution: Implement WAL (Write-Ahead Logging) mode
   - Solution: Checksum verification

2. **Migration Failure**
   - Solution: Dual-write during migration
   - Solution: Keep LocalStorage backup for 30 days
   - Solution: Validation scripts to compare data

3. **Performance Issues**
   - Solution: Proper indexing
   - Solution: Query optimization
   - Solution: Connection pooling

### Backup Strategy
```bash
# Proposed backup script (run daily via cron)
#!/bin/bash
BACKUP_DIR="/path/to/backups/emaildrafter"
DB_PATH="/path/to/emaildrafter.db"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/backup_$DATE.db'"

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.db" -mtime +30 -delete

# Optional: Upload to cloud storage
# rclone copy "$BACKUP_DIR/backup_$DATE.db" "cloud:emaildrafter-backups/"
```

## Performance Considerations

### Expected Data Volumes
- **Templates**: 50-100 records (small, <1MB total)
- **Campaigns**: 100-500 records per month
- **Messages**: 10,000-50,000 records per month
- **Events**: 3x message count

### SQLite Performance
- **Read Speed**: ~50,000 records/second
- **Write Speed**: ~10,000 records/second
- **File Size**: ~100MB per year at high usage
- **Memory Usage**: <50MB for application + database

### Optimization Techniques
1. **Use WAL mode** for better concurrency
2. **Proper indexing** on frequently queried columns
3. **Batch inserts** for message/event data
4. **Regular VACUUM** to maintain performance
5. **Connection pooling** for Electron main/renderer processes

## Implementation Details

### Database Service Interface
```typescript
// src/services/database.ts
export class DatabaseService {
  private db: Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeSchema();
    this.enableWAL();
  }
  
  private initializeSchema(): void {
    this.db.exec(SCHEMA);
  }
  
  private enableWAL(): void {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  
  // Query methods
  query<T>(sql: string, params?: any[]): T[]
  execute(sql: string, params?: any[]): Result
  transaction<T>(fn: () => T): T
  
  // Backup/restore
  backup(destinationPath: string): Promise<void>
  restore(sourcePath: string): Promise<void>
  
  // Maintenance
  vacuum(): void
  analyze(): PerformanceStats
}
```

### Store Adapter Pattern
```typescript
// src/services/sqliteProjectStore.ts
export class SQLiteProjectStore implements ProjectStore {
  constructor(private db: DatabaseService) {}
  
  async listTemplates(): Promise<StoredTemplate[]> {
    return this.db.query(
      'SELECT * FROM templates ORDER BY updated_at DESC'
    );
  }
  
  // ... implement all ProjectStore interface methods
}
```

## Conclusion

**Recommendation: SQLite with WAL mode and automated backups**

This solution provides:
1. **Zero ongoing cost** - uses existing PC resources
2. **High reliability** - ACID compliance with transactions
3. **Easy backups** - single file to copy/backup
4. **Good performance** - more than sufficient for email campaign data
5. **Low maintenance** - no server management required

The migration can be done incrementally with minimal risk, and the existing `better-sqlite3` dependency means no additional package installation is needed. The total implementation time is estimated at 4 weeks with the dual-write approach ensuring data safety throughout the migration.