import { supabase } from '../lib/supabase.js';

export class OpsRepository {
  async createSyncLog(siteId: string, syncType: string) {
    const { data, error } = await supabase
      .from('sync_logs')
      .insert({
        site_id: siteId,
        sync_type: syncType,
        status: 'running',
        items_processed: 0,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async finishSyncLog(syncLogId: string, input: { status: string; items_processed: number; error_message?: string | null }) {
    const { error } = await supabase
      .from('sync_logs')
      .update({
        status: input.status,
        items_processed: input.items_processed,
        error_message: input.error_message ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', syncLogId);

    if (error) {
      throw error;
    }
  }

  async logUsage(siteId: string, eventType: string, metadata: Record<string, unknown>) {
    const { error } = await supabase.from('usage_logs').insert({
      site_id: siteId,
      event_type: eventType,
      metadata,
    });

    if (error) {
      throw error;
    }
  }
}
