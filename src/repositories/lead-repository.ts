import { supabase } from '../lib/supabase.js';
import type { LeadQuestion } from '../types/site-context.js';

type LeadFormConfig = {
  form_name?: string;
  intro_message?: string;
  success_message?: string;
  cta_label?: string;
  questions?: LeadQuestion[];
};

type LeadSubmissionAnswer = {
  field_id: string;
  label: string;
  value: string;
};

type LeadSubmissionInput = {
  site_id: string;
  form_id: string;
  conversation_id?: string | null;
  session_id: string;
  source_page_url?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  company_name?: string | null;
  answers: LeadSubmissionAnswer[];
  summary: string;
  metadata?: Record<string, unknown>;
};

export class LeadRepository {
  async upsertDefaultForm(siteId: string, enabled: boolean, config: LeadFormConfig) {
    const { data, error } = await supabase
      .from('lead_forms')
      .upsert(
        {
          site_id: siteId,
          name: config.form_name || 'Default Brief Flow',
          slug: 'default-brief',
          mode: 'brief',
          status: enabled ? 'active' : 'inactive',
          intro_message:
            config.intro_message ||
            'Pred odpoveďou na dopyt si vypýtam niekoľko stručných informácií, aby sme vám vedeli pripraviť lepší návrh.',
          success_message:
            config.success_message ||
            'Ďakujeme, brief sme uložili. Náš tím sa vám ozve s ďalším krokom.',
          cta_label: config.cta_label || 'Vyplniť brief',
          fields: config.questions || [],
        },
        {
          onConflict: 'site_id,slug',
        },
      )
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async getActiveForm(siteId: string) {
    const { data, error } = await supabase
      .from('lead_forms')
      .select('*')
      .eq('site_id', siteId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async createSubmission(input: LeadSubmissionInput) {
    const { data, error } = await supabase
      .from('lead_submissions')
      .insert({
        site_id: input.site_id,
        form_id: input.form_id,
        conversation_id: input.conversation_id ?? null,
        session_id: input.session_id,
        source_page_url: input.source_page_url ?? null,
        contact_name: input.contact_name ?? null,
        contact_email: input.contact_email ?? null,
        company_name: input.company_name ?? null,
        answers: input.answers,
        summary: input.summary,
        status: 'new',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async listSubmissions(siteId: string, page: number, perPage: number) {
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const { data, error } = await supabase
      .from('lead_submissions')
      .select('id,form_id,conversation_id,session_id,contact_name,contact_email,company_name,status,summary,created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async findSubmission(siteId: string, submissionId: string) {
    const { data, error } = await supabase
      .from('lead_submissions')
      .select('*')
      .eq('site_id', siteId)
      .eq('id', submissionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }
}
