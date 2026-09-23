import { SectionCard } from '../components/SectionCard';

type ContentSyncPageProps = {
  selectedTypes: string[];
  availableTypes: Array<{ value: string; label: string }>;
  onToggle: (value: string) => void;
  onRunSync: () => Promise<void>;
  loading: boolean;
  logs: Array<Record<string, unknown>>;
};

export function ContentSyncPage({
  selectedTypes,
  availableTypes,
  onToggle,
  onRunSync,
  loading,
  logs,
}: ContentSyncPageProps) {
  return (
    <div className="nastroje-stack">
      <SectionCard
        title="Content Sync"
        description="Manual sync for posts, pages, categories, and products."
        actions={
          <button className="button button-primary" onClick={onRunSync} disabled={loading}>
            Run sync
          </button>
        }
      >
        <div className="nastroje-post-types">
          {availableTypes.map((type) => (
            <label key={type.value}>
              <input
                type="checkbox"
                checked={selectedTypes.includes(type.value)}
                onChange={() => onToggle(type.value)}
              />
              <span>{type.label}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent Sync Logs">
        <div className="nastroje-log-list">
          {logs.map((entry, index) => (
            <article className="nastroje-log-item" key={index}>
              <strong>{String(entry.status ?? 'unknown')}</strong>
              <span>{String(entry.items_processed ?? 0)} items</span>
              <small>{String(entry.finished_at ?? entry.started_at ?? '')}</small>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
