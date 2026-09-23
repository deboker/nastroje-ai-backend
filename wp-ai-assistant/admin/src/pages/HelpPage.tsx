import { SectionCard } from '../components/SectionCard';

export function HelpPage() {
  return (
    <div className="nastroje-stack">
      <SectionCard title="Help" description="Core setup and rollout checklist.">
        <ol className="nastroje-help-list">
          <li>Set the backend URL and obtain or register a site token.</li>
          <li>Validate the connection before running the first content sync.</li>
          <li>Run a manual sync and confirm documents appear in Supabase.</li>
          <li>Place the shortcode on a page or enable the floating widget.</li>
          <li>Review conversation logs and adjust assistant settings.</li>
        </ol>
      </SectionCard>
    </div>
  );
}
