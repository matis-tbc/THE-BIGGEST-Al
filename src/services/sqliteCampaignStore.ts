import { 
  CampaignRecord, 
  CampaignMessageRecord, 
  MessageEventRecord, 
  CampaignAnalytics,
  CampaignStatus,
  MessageStatus,
  EventType 
} from './campaignStore';
import { getDatabase } from './database';

export class SQLiteCampaignStore {
  private db = getDatabase();

  // Campaign operations
  async createCampaign(input: {
    id?: string;
    name: string;
    templateId?: string;
    attachmentName?: string;
  }): Promise<CampaignRecord> {
    const id = input.id || `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    
    const campaign: CampaignRecord = {
      id,
      name: input.name,
      templateId: input.templateId,
      attachmentName: input.attachmentName,
      status: 'drafted',
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.db.execute(
        `INSERT INTO campaigns (id, name, template_id, attachment_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          campaign.id,
          campaign.name,
          campaign.templateId,
          campaign.attachmentName,
          campaign.status,
          campaign.createdAt,
          campaign.updatedAt
        ]
      );

      return campaign;
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to create campaign:', error);
      throw error;
    }
  }

  async upsertMessages(messages: CampaignMessageRecord[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      this.db.transaction(() => {
        messages.forEach(message => {
          this.db.execute(
            `INSERT OR REPLACE INTO campaign_messages 
             (id, campaign_id, contact_id, contact_name, contact_email, message_id, status,
              draft_created_at, queued_at, send_started_at, sent_at, replied_at, error, idempotency_key, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              message.id,
              message.campaignId,
              message.contactId,
              message.contactName,
              message.contactEmail,
              message.messageId,
              message.status,
              message.draftCreatedAt,
              message.queuedAt,
              message.sendStartedAt,
              message.sentAt,
              message.repliedAt,
              message.error,
              message.idempotencyKey,
              new Date().toISOString()
            ]
          );
        });
      });
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to upsert messages:', error);
      throw error;
    }
  }

  async createEvents(events: Omit<MessageEventRecord, 'id' | 'createdAt'>[]): Promise<void> {
    if (events.length === 0) return;

    try {
      this.db.transaction(() => {
        events.forEach(event => {
          const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const createdAt = new Date().toISOString();
          
          this.db.execute(
            `INSERT INTO message_events (id, campaign_id, message_id, contact_id, type, detail, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              event.campaignId,
              event.messageId,
              event.contactId,
              event.type,
              event.detail,
              createdAt
            ]
          );
        });
      });
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to create events:', error);
      throw error;
    }
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    try {
      const rows = this.db.query(
        'SELECT * FROM campaigns ORDER BY updated_at DESC'
      );
      
      return rows.map(row => this.mapCampaignRow(row));
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to list campaigns:', error);
      return [];
    }
  }

  async listMessages(campaignId: string): Promise<CampaignMessageRecord[]> {
    try {
      const rows = this.db.query(
        'SELECT * FROM campaign_messages WHERE campaign_id = ? ORDER BY contact_name',
        [campaignId]
      );
      
      return rows.map(row => this.mapMessageRow(row));
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to list messages:', error);
      return [];
    }
  }

  async listEvents(campaignId: string): Promise<MessageEventRecord[]> {
    try {
      const rows = this.db.query(
        'SELECT * FROM message_events WHERE campaign_id = ? ORDER BY created_at DESC',
        [campaignId]
      );
      
      return rows.map(row => this.mapEventRow(row));
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to list events:', error);
      return [];
    }
  }

  async updateCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    try {
      this.db.execute(
        'UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?',
        [status, new Date().toISOString(), campaignId]
      );
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to update campaign status:', error);
      throw error;
    }
  }

  async updateMessagesByMessageId(
    campaignId: string,
    updates: Array<{ messageId: string; status: MessageStatus; error?: string }>
  ): Promise<void> {
    if (updates.length === 0) return;

    try {
      this.db.transaction(() => {
        updates.forEach(update => {
          const now = new Date().toISOString();
          let setClause = 'status = ?, updated_at = ?';
          const params: any[] = [update.status, now];
          
          if (update.status === 'sending') {
            setClause += ', send_started_at = ?';
            params.push(now);
          } else if (update.status === 'sent') {
            setClause += ', sent_at = ?';
            params.push(now);
          }
          
          if (update.error) {
            setClause += ', error = ?';
            params.push(update.error);
          }
          
          params.push(campaignId, update.messageId);
          
          this.db.execute(
            `UPDATE campaign_messages SET ${setClause} WHERE campaign_id = ? AND message_id = ?`,
            params
          );
        });
      });
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to update messages by message ID:', error);
      throw error;
    }
  }

  async setQueued(campaignId: string, messageIds: string[], idempotencyPrefix: string): Promise<void> {
    if (messageIds.length === 0) return;

    try {
      const now = new Date().toISOString();
      const placeholders = messageIds.map(() => '?').join(',');
      
      this.db.execute(
        `UPDATE campaign_messages 
         SET status = 'queued', queued_at = ?, idempotency_key = ?, updated_at = ?
         WHERE campaign_id = ? AND message_id IN (${placeholders})`,
        [now, idempotencyPrefix, now, campaignId, ...messageIds]
      );
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to set queued:', error);
      throw error;
    }
  }

  async computeAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    try {
      const messages = await this.listMessages(campaignId);
      const total = messages.length;
      
      const drafted = messages.filter(item => item.status === 'drafted').length;
      const queued = messages.filter(item => item.status === 'queued').length;
      const sending = messages.filter(item => item.status === 'sending').length;
      const sent = messages.filter(item => item.status === 'sent').length;
      const failed = messages.filter(item => item.status === 'failed').length;
      const replied = messages.filter(item => item.status === 'replied').length;
      
      const sendRate = total > 0 ? sent / total : 0;
      const replyRate = sent > 0 ? replied / sent : 0;

      // Calculate average times using SQL for better performance
      const sendDurations = this.db.query<{ avg_duration: number }>(
        `SELECT AVG(
          CASE WHEN sent_at IS NOT NULL AND queued_at IS NOT NULL 
          THEN (julianday(sent_at) - julianday(queued_at)) * 86400000
          ELSE NULL END
        ) as avg_duration
        FROM campaign_messages 
        WHERE campaign_id = ? AND status = 'sent'`,
        [campaignId]
      );

      const replyDurations = this.db.query<{ avg_duration: number }>(
        `SELECT AVG(
          CASE WHEN replied_at IS NOT NULL AND sent_at IS NOT NULL 
          THEN (julianday(replied_at) - julianday(sent_at)) * 86400000
          ELSE NULL END
        ) as avg_duration
        FROM campaign_messages 
        WHERE campaign_id = ? AND status = 'replied'`,
        [campaignId]
      );

      const avgTimeToSendMs = sendDurations[0]?.avg_duration || 0;
      const avgTimeToReplyMs = replyDurations[0]?.avg_duration || 0;

      return {
        campaignId,
        total,
        drafted,
        queued,
        sending,
        sent,
        failed,
        replied,
        sendRate,
        replyRate,
        avgTimeToSendMs,
        avgTimeToReplyMs
      };
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to compute analytics:', error);
      // Return default analytics on error
      return {
        campaignId,
        total: 0,
        drafted: 0,
        queued: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        replied: 0,
        sendRate: 0,
        replyRate: 0,
        avgTimeToSendMs: 0,
        avgTimeToReplyMs: 0
      };
    }
  }

  async exportAuditCsv(campaignId: string): Promise<string> {
    try {
      const messages = await this.listMessages(campaignId);
      
      const header = [
        'campaignId',
        'contactId',
        'contactName',
        'contactEmail',
        'messageId',
        'status',
        'draftCreatedAt',
        'queuedAt',
        'sendStartedAt',
        'sentAt',
        'repliedAt',
        'error',
        'idempotencyKey',
      ];
      
      const rows = messages.map(item => [
        campaignId,
        item.contactId,
        item.contactName,
        item.contactEmail,
        item.messageId || '',
        item.status,
        item.draftCreatedAt || '',
        item.queuedAt || '',
        item.sendStartedAt || '',
        item.sentAt || '',
        item.repliedAt || '',
        item.error || '',
        item.idempotencyKey || '',
      ]);
      
      const csvContent = [header, ...rows]
        .map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      
      return csvContent;
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to export audit CSV:', error);
      return '';
    }
  }

  // Helper methods for mapping database rows
  private mapCampaignRow(row: any): CampaignRecord {
    return {
      id: row.id,
      name: row.name,
      templateId: row.template_id,
      attachmentName: row.attachment_name,
      status: row.status as CampaignStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapMessageRow(row: any): CampaignMessageRecord {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      contactId: row.contact_id,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      messageId: row.message_id,
      status: row.status as MessageStatus,
      draftCreatedAt: row.draft_created_at,
      queuedAt: row.queued_at,
      sendStartedAt: row.send_started_at,
      sentAt: row.sent_at,
      repliedAt: row.replied_at,
      error: row.error,
      idempotencyKey: row.idempotency_key,
      updatedAt: row.updated_at
    };
  }

  private mapEventRow(row: any): MessageEventRecord {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      messageId: row.message_id,
      contactId: row.contact_id,
      type: row.type as EventType,
      detail: row.detail,
      createdAt: row.created_at
    };
  }

  // Additional utility methods
  async getCampaignById(campaignId: string): Promise<CampaignRecord | null> {
    try {
      const rows = this.db.query(
        'SELECT * FROM campaigns WHERE id = ?',
        [campaignId]
      );
      
      if (rows.length === 0) return null;
      return this.mapCampaignRow(rows[0]);
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to get campaign by ID:', error);
      return null;
    }
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    try {
      // Cascade delete will handle messages and events due to foreign key constraints
      this.db.execute('DELETE FROM campaigns WHERE id = ?', [campaignId]);
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to delete campaign:', error);
      throw error;
    }
  }

  async getCampaignStats(): Promise<{
    totalCampaigns: number;
    totalMessages: number;
    successRate: number;
    averageMessagesPerCampaign: number;
  }> {
    try {
      const campaignCount = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM campaigns');
      const messageCount = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM campaign_messages');
      const sentCount = this.db.query<{ count: number }>(`SELECT COUNT(*) as count FROM campaign_messages WHERE status = 'sent'`);
      
      const totalCampaigns = campaignCount[0]?.count || 0;
      const totalMessages = messageCount[0]?.count || 0;
      const sentMessages = sentCount[0]?.count || 0;
      
      const successRate = totalMessages > 0 ? sentMessages / totalMessages : 0;
      const averageMessagesPerCampaign = totalCampaigns > 0 ? totalMessages / totalCampaigns : 0;
      
      return {
        totalCampaigns,
        totalMessages,
        successRate,
        averageMessagesPerCampaign
      };
    } catch (error) {
      console.error('[SQLiteCampaignStore] Failed to get campaign stats:', error);
      return {
        totalCampaigns: 0,
        totalMessages: 0,
        successRate: 0,
        averageMessagesPerCampaign: 0
      };
    }
  }
}

// Create and export a singleton instance
export const sqliteCampaignStore = new SQLiteCampaignStore();