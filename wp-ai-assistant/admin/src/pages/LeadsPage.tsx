import { useState } from 'react';
import { SectionCard } from '../components/SectionCard';

type LeadAnswer = {
  label?: string;
  value?: string;
};

type LeadSubmission = {
  id: string;
  contact_name?: string;
  contact_email?: string;
  company_name?: string;
  summary?: string;
  status?: string;
  created_at?: string;
  answers?: LeadAnswer[];
};

type LeadDetail = LeadSubmission & {
  answers?: LeadAnswer[];
};

type LeadsPageProps = {
  submissions: LeadSubmission[];
  submission: LeadDetail | null;
  selectedSubmissionId?: string;
  deleting?: boolean;
  onSelect: (id: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function leadRows(submissions: LeadSubmission[]) {
  return submissions.map((submission) => ({
    id: submission.id || '',
    created_at: submission.created_at || '',
    contact_name: submission.contact_name || '',
    contact_email: submission.contact_email || '',
    company_name: submission.company_name || '',
    status: submission.status || '',
    summary: submission.summary || '',
    answers: (submission.answers || []).map((answer) => `${answer.label || ''}: ${answer.value || ''}`).join(' | '),
  }));
}

function downloadLeadFile(submissions: LeadSubmission[], format: 'txt' | 'csv', dateFrom: string, dateTo: string) {
  const rows = leadRows(submissions);
  const datePart = [dateFrom || 'all', dateTo || 'all'].join('_');
  let content = '';
  let mimeType = 'text/plain;charset=utf-8';

  if (format === 'csv') {
    const headers = ['id', 'created_at', 'contact_name', 'contact_email', 'company_name', 'status', 'summary', 'answers'];
    content = `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(',')).join('\n')}`;
    mimeType = 'text/csv;charset=utf-8';
  } else {
    content = rows
      .map((row, index) =>
        [
          `Lead ${index + 1}`,
          `ID: ${row.id}`,
          `Dátum: ${row.created_at}`,
          `Meno: ${row.contact_name}`,
          `E-mail: ${row.contact_email}`,
          `Firma/projekt: ${row.company_name}`,
          `Stav: ${row.status}`,
          `Súhrn: ${row.summary}`,
          `Odpovede: ${row.answers}`,
        ].join('\n'),
      )
      .join('\n\n---\n\n');
  }

  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `nastroje-ai-leads-${datePart}.${format}`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}

export function LeadsPage({ submissions, submission, selectedSubmissionId, deleting, onSelect, onDelete }: LeadsPageProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredSubmissions = submissions.filter((item) => {
    const createdDate = String(item.created_at || '').slice(0, 10);
    if (dateFrom && createdDate < dateFrom) return false;
    if (dateTo && createdDate > dateTo) return false;
    return true;
  });
  const visibleSubmissions = filteredSubmissions.slice(0, 10);

  return (
    <div className="nastroje-split-grid">
      <SectionCard
        title="Lead Submissions"
        description="Zachytené brief odpovede a kontaktné údaje pre tento web."
        actions={
          <>
            <button className="button button-secondary" type="button" onClick={() => downloadLeadFile(filteredSubmissions, 'txt', dateFrom, dateTo)} disabled={!filteredSubmissions.length}>
              Stiahnuť TXT
            </button>
            <button className="button button-secondary" type="button" onClick={() => downloadLeadFile(filteredSubmissions, 'csv', dateFrom, dateTo)} disabled={!filteredSubmissions.length}>
              Stiahnuť CSV
            </button>
          </>
        }
      >
        <div className="nastroje-lead-toolbar">
          <label>
            <span>Dátum od</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            <span>Dátum do</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button className="button button-secondary" type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} disabled={!dateFrom && !dateTo}>
            Vyčistiť filter
          </button>
          <small>Zobrazuje sa posledných {visibleSubmissions.length} z {filteredSubmissions.length} filtrovaných leadov.</small>
        </div>
        <div className="nastroje-list">
          {visibleSubmissions.length ? (
            visibleSubmissions.map((item) => (
              <button className={`nastroje-list-item${selectedSubmissionId === item.id ? ' is-selected' : ''}`} key={item.id} onClick={() => onSelect(item.id)}>
                <strong>{item.contact_name || item.contact_email || item.id}</strong>
                <span>{item.company_name || item.status}</span>
                <small>{item.created_at || ''}</small>
              </button>
            ))
          ) : (
            <p>{submissions.length ? 'Pre vybraný dátumový rozsah nie sú žiadne leady.' : 'Pre tento web zatiaľ nie sú zachytené žiadne leady.'}</p>
          )}
        </div>
      </SectionCard>
      <SectionCard
        title="Submission Detail"
        actions={
          submission && onDelete ? (
            <button className="button nastroje-button-danger" type="button" onClick={onDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete lead'}
            </button>
          ) : null
        }
      >
        {submission ? (
          <div className="nastroje-message-list">
            <article className="nastroje-message nastroje-message--assistant">
              <strong>{submission.contact_name || submission.contact_email || submission.id}</strong>
              <p>{submission.company_name || submission.status || ''}</p>
              <small>{submission.created_at || ''}</small>
            </article>
            <article className="nastroje-message nastroje-message--assistant">
              <strong>Summary</strong>
              <p>{submission.summary || ''}</p>
            </article>
            {(submission.answers || []).map((answer, index) => (
              <article className="nastroje-message nastroje-message--user" key={`${answer.label || 'answer'}-${index}`}>
                <strong>{answer.label}</strong>
                <p>{answer.value}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>Select a submission to inspect the captured brief.</p>
        )}
      </SectionCard>
    </div>
  );
}
