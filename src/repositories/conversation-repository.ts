import { supabase } from '../lib/supabase.js';

type ConversationCreateInput = {
  site_id: string;
  session_id: string;
  user_identifier?: string | null;
  source_page_url?: string | null;
  mode?: string;
};

export class ConversationRepository {
  async createConversation(input: ConversationCreateInput) {
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        site_id: input.site_id,
        session_id: input.session_id,
        user_identifier: input.user_identifier ?? null,
        source_page_url: input.source_page_url ?? null,
        mode: input.mode ?? 'chat',
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async findConversation(siteId: string, conversationId: string) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('site_id', siteId)
      .eq('id', conversationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async listConversations(siteId: string, page: number, perPage: number) {
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const { data, error } = await supabase
      .from('conversations')
      .select('id,session_id,user_identifier,source_page_url,mode,created_at,updated_at')
      .eq('site_id', siteId)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async listMessages(conversationId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('id,role,content,metadata,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async createMessage(conversationId: string, role: string, content: string, metadata: Record<string, unknown> = {}) {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        metadata,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async touchConversation(conversationId: string) {
    const { error } = await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) {
      throw error;
    }
  }
}
