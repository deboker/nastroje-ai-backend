import { useEffect, useState } from 'react';
import type { DashboardResponse, PluginSettings } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { ContentSyncPage } from './pages/ContentSyncPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { HelpPage } from './pages/HelpPage';
import { LeadsPage } from './pages/LeadsPage';

declare global {
  interface Window {
    NastrojeAIAdmin: {
      restBase: string;
      currentView: string;
      settings: PluginSettings;
      availablePostTypes: Record<string, string>;
      syncState: {
        logs: Array<Record<string, unknown>>;
      };
    };
  }
}

const adminData = window.NastrojeAIAdmin;

export function App() {
  const [settings, setSettings] = useState<PluginSettings>(adminData.settings);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [syncTypes, setSyncTypes] = useState<string[]>([...settings.allowed_post_types, 'category']);
  const [conversations, setConversations] = useState<Array<{ id: string; session_id: string; updated_at: string }>>([]);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string; created_at: string }>>([]);
  const [submissions, setSubmissions] = useState<Array<{ id: string; summary: string; status: string }>>([]);
  const [submission, setSubmission] = useState<{ id: string; summary: string; answers: Array<{ label: string; value: string }> } | null>(null);

  useEffect(() => {
    void fetch(`${adminData.restBase}/dashboard`, { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data: DashboardResponse) => setDashboard(data));
  }, []);

  const updateSetting = (key: keyof PluginSettings, value: unknown) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const togglePostType = (postType: string) => {
    setSettings((current) => ({
      ...current,
      allowed_post_types: current.allowed_post_types.includes(postType)
        ? current.allowed_post_types.filter((value) => value !== postType)
        : [...current.allowed_post_types, postType],
    }));
  };

  const toggleSyncType = (value: string) => {
    setSyncTypes((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  };

  const currentView = adminData.currentView;

  if (currentView === 'settings') {
    return (
      <SettingsPage
        settings={settings}
        availablePostTypes={adminData.availablePostTypes}
        onChange={updateSetting}
        onTogglePostType={togglePostType}
        onSave={async () => {}}
        saving={false}
      />
    );
  }

  if (currentView === 'sync') {
    return (
      <ContentSyncPage
        selectedTypes={syncTypes}
        availableTypes={Object.entries(adminData.availablePostTypes).map(([value, label]) => ({ value, label }))}
        onToggle={toggleSyncType}
        onRunSync={async () => {}}
        loading={false}
        logs={dashboard?.logs ?? adminData.syncState.logs}
      />
    );
  }

  if (currentView === 'conversations') {
    return <ConversationsPage conversations={conversations} messages={messages} onSelect={async () => {}} />;
  }

  if (currentView === 'leads') {
    return <LeadsPage submissions={submissions} submission={submission} onSelect={async () => {}} />;
  }

  if (currentView === 'help') {
    return <HelpPage />;
  }

  return (
    <DashboardPage
      dashboard={dashboard}
      onRegisterSite={async () => {}}
      onTestConnection={async () => {}}
      onRunSync={async () => {}}
      loading={false}
    />
  );
}
