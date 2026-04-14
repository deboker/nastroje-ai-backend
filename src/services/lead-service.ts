import { randomUUID } from 'node:crypto';
import { ConversationRepository } from '../repositories/conversation-repository.js';
import { LeadRepository } from '../repositories/lead-repository.js';
import { OpsRepository } from '../repositories/ops-repository.js';
import type { SiteContext } from '../types/site-context.js';

type LeadAnswerInput = {
  field_id: string;
  label: string;
  value: string;
};

type LeadSubmitInput = {
  session_id?: string;
  source_page_url?: string;
  conversation_id?: string;
  answers: LeadAnswerInput[];
};

export class LeadService {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly opsRepository: OpsRepository,
  ) {}

  async syncDefaultForm(
    siteId: string,
    enabled: boolean,
    leadFlowConfig: NonNullable<SiteContext['settings']>['lead_flow_config'],
  ) {
    return this.leadRepository.upsertDefaultForm(siteId, enabled, leadFlowConfig || {});
  }

  async getActiveForm(siteContext: SiteContext) {
    return this.leadRepository.getActiveForm(siteContext.site.id);
  }

  async submit(siteContext: SiteContext, input: LeadSubmitInput) {
    const form = await this.leadRepository.getActiveForm(siteContext.site.id);

    if (!form) {
      throw new Error('No active lead form is configured for this site.');
    }

    const conversation =
      (input.conversation_id &&
        (await this.conversationRepository.findConversation(siteContext.site.id, input.conversation_id))) ||
      (await this.conversationRepository.createConversation({
        site_id: siteContext.site.id,
        session_id: input.session_id || randomUUID(),
        source_page_url: input.source_page_url || null,
        user_identifier: this.extractAnswer(input.answers, ['email']),
        mode: 'brief',
      }));

    const normalizedAnswers = input.answers.map((answer) => ({
      field_id: answer.field_id,
      label: answer.label,
      value: answer.value,
    }));

    const transcript = normalizedAnswers.map((answer) => `${answer.label}: ${answer.value}`).join('\n');
    await this.conversationRepository.createMessage(conversation.id, 'user', transcript, {
      mode: 'brief',
      form_id: form.id,
      answers: normalizedAnswers,
    });

    const summary = this.buildSummary(normalizedAnswers, siteContext.site.language || 'sk');

    await this.conversationRepository.createMessage(conversation.id, 'assistant', summary, {
      mode: 'brief',
      form_id: form.id,
    });
    await this.conversationRepository.touchConversation(conversation.id);

    const submission = await this.leadRepository.createSubmission({
      site_id: siteContext.site.id,
      form_id: form.id,
      conversation_id: conversation.id,
      session_id: input.session_id || conversation.session_id || randomUUID(),
      source_page_url: input.source_page_url || null,
      contact_name: this.extractAnswer(input.answers, ['name', 'full_name']),
      contact_email: this.extractAnswer(input.answers, ['email']),
      company_name: this.extractAnswer(input.answers, ['company', 'company_name']),
      answers: normalizedAnswers,
      summary,
      metadata: {
        flow: 'brief',
      },
    });

    await this.opsRepository.logUsage(siteContext.site.id, 'lead_submission', {
      submission_id: submission.id,
      form_id: form.id,
      answer_count: normalizedAnswers.length,
    });

    return {
      submission_id: submission.id,
      conversation_id: conversation.id,
      summary,
      message: form.success_message,
    };
  }

  async listSubmissions(siteContext: SiteContext, page: number, perPage: number) {
    const submissions = await this.leadRepository.listSubmissions(siteContext.site.id, page, perPage);
    return { submissions };
  }

  async getSubmission(siteContext: SiteContext, submissionId: string) {
    const submission = await this.leadRepository.findSubmission(siteContext.site.id, submissionId);
    if (!submission) {
      throw new Error('Lead submission not found for this site.');
    }

    return { submission };
  }

  async deleteSubmission(siteContext: SiteContext, submissionId: string) {
    const deleted = await this.leadRepository.deleteSubmission(siteContext.site.id, submissionId);
    if (!deleted) {
      throw new Error('Lead submission not found for this site.');
    }

    await this.opsRepository.logUsage(siteContext.site.id, 'lead_submission_deleted', {
      submission_id: submissionId,
    });

    return {
      deleted: true,
      submission_id: submissionId,
    };
  }

  private extractAnswer(answers: LeadAnswerInput[], keys: string[]) {
    const match = answers.find((answer) => keys.includes(answer.field_id));
    return match?.value || null;
  }

  private buildSummary(answers: LeadAnswerInput[], language: string) {
    const parts = answers
      .filter((answer) => answer.value.trim())
      .map((answer) => `${answer.label}: ${answer.value.trim()}`);

    if (language.startsWith('sk')) {
      return `Zachytený brief: ${parts.join(' | ')}`;
    }

    return `Captured brief: ${parts.join(' | ')}`;
  }
}
