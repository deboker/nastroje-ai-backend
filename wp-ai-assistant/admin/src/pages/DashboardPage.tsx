import type { DashboardResponse } from '../types';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';

type DashboardPageProps = {
  dashboard: DashboardResponse | null;
  onRegisterSite: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onRunSync: () => Promise<void>;
  loading: boolean;
};

export function DashboardPage({
  dashboard,
  onRegisterSite,
  onTestConnection,
  onRunSync,
  loading,
}: DashboardPageProps) {
  return (
    <div className="nastroje-stack">
      <SectionCard
        title="Dashboard"
        description="Connection status, sync health, and usage snapshot."
        actions={
          <>
            <button className="button button-secondary" onClick={onRegisterSite} disabled={loading}>
              Register site
            </button>
            <button className="button button-secondary" onClick={onTestConnection} disabled={loading}>
              Test connection
            </button>
            <button className="button button-primary" onClick={onRunSync} disabled={loading}>
              Sync now
            </button>
          </>
        }
      >
        <div className="nastroje-stats-grid">
          <StatCard label="Connection" value={dashboard?.connectionStatus ?? 'not_configured'} />
          <StatCard label="Site status" value={dashboard?.siteStatus ?? 'not_registered'} />
          <StatCard label="Documents" value={dashboard?.stats.totalDocuments ?? 0} />
          <StatCard label="Conversations" value={dashboard?.stats.totalConversations ?? 0} />
          <StatCard label="Leads" value={dashboard?.stats.totalLeads ?? 0} />
        </div>
      </SectionCard>
    </div>
  );
}
