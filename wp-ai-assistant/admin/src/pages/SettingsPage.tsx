import type { CSSProperties } from 'react';
import type { PluginSettings } from '../types';
import { SectionCard } from '../components/SectionCard';

type SettingsPageProps = {
  settings: PluginSettings;
  availablePostTypes: Record<string, string>;
  onChange: (key: keyof PluginSettings, value: unknown) => void;
  onTogglePostType: (postType: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
};

export function SettingsPage({
  settings,
  availablePostTypes,
  onChange,
  onTogglePostType,
  onSave,
  saving,
}: SettingsPageProps) {
  const previewStyle = {
    '--nastroje-preview-accent': settings.ui_primary_color,
    '--nastroje-preview-surface': settings.ui_surface_color,
    '--nastroje-preview-text': settings.ui_text_color,
    '--nastroje-preview-border': settings.ui_border_color,
    '--nastroje-preview-radius': `${settings.ui_border_radius}px`,
  } as CSSProperties;

  return (
    <div className="nastroje-stack">
      <SectionCard
        title="Settings"
        description="Assistant behavior, connection, and sync controls."
        actions={
          <button className="button button-primary" onClick={onSave} disabled={saving}>
            Save settings
          </button>
        }
      >
        <div className="nastroje-form-grid">
          <label>
            <span>Assistant name</span>
            <input value={settings.assistant_name} onChange={(event) => onChange('assistant_name', event.target.value)} />
          </label>
          <label>
            <span>Backend URL</span>
            <input value={settings.backend_url} onChange={(event) => onChange('backend_url', event.target.value)} />
          </label>
          <label>
            <span>Site token</span>
            <input value={settings.site_token} onChange={(event) => onChange('site_token', event.target.value)} />
          </label>
          <label>
            <span>Primary language</span>
            <input value={settings.language} onChange={(event) => onChange('language', event.target.value)} />
          </label>
          <label>
            <span>Tone</span>
            <input value={settings.tone} onChange={(event) => onChange('tone', event.target.value)} />
          </label>
          <label>
            <span>Theme</span>
            <input value={settings.theme} onChange={(event) => onChange('theme', event.target.value)} />
          </label>
        </div>

        <div className="nastroje-form-grid">
          <label>
            <span>Primary color</span>
            <input type="color" value={settings.ui_primary_color} onChange={(event) => onChange('ui_primary_color', event.target.value)} />
          </label>
          <label>
            <span>Surface color</span>
            <input type="color" value={settings.ui_surface_color} onChange={(event) => onChange('ui_surface_color', event.target.value)} />
          </label>
          <label>
            <span>Text color</span>
            <input type="color" value={settings.ui_text_color} onChange={(event) => onChange('ui_text_color', event.target.value)} />
          </label>
          <label>
            <span>Border color</span>
            <input type="color" value={settings.ui_border_color} onChange={(event) => onChange('ui_border_color', event.target.value)} />
          </label>
          <label>
            <span>Border radius</span>
            <input
              type="number"
              min={0}
              max={40}
              value={settings.ui_border_radius}
              onChange={(event) => onChange('ui_border_radius', Number(event.target.value) || 0)}
            />
          </label>
        </div>

        <div className="nastroje-design-preview" style={previewStyle}>
          <div className="nastroje-design-preview__panel">
            <div className="nastroje-design-preview__header">Widget preview</div>
            <div className="nastroje-design-preview__body">
              <div className="nastroje-design-preview__message">Dobrý deň, ako vám môžem pomôcť?</div>
              <div className="nastroje-design-preview__message nastroje-design-preview__message--user">Hľadám AI tool na support.</div>
            </div>
            <div className="nastroje-design-preview__footer">
              <div className="nastroje-design-preview__input">Napíšte správu...</div>
              <button type="button">Odoslať</button>
            </div>
          </div>
        </div>

        <label className="nastroje-full">
          <span>Welcome message</span>
          <textarea value={settings.welcome_message} onChange={(event) => onChange('welcome_message', event.target.value)} />
        </label>

        <label className="nastroje-full">
          <span>Privacy notice</span>
          <textarea value={settings.privacy_notice} onChange={(event) => onChange('privacy_notice', event.target.value)} />
        </label>

        <div className="nastroje-checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={settings.widget_enabled}
              onChange={(event) => onChange('widget_enabled', event.target.checked)}
            />
            <span>Enable floating widget</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.shortcode_enabled}
              onChange={(event) => onChange('shortcode_enabled', event.target.checked)}
            />
            <span>Enable shortcode</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.include_woocommerce_products}
              onChange={(event) => onChange('include_woocommerce_products', event.target.checked)}
            />
            <span>Include WooCommerce products</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.lead_capture_enabled}
              onChange={(event) => onChange('lead_capture_enabled', event.target.checked)}
            />
            <span>Enable brief / lead flow</span>
          </label>
        </div>

        <div className="nastroje-post-types">
          <h3>Allowed post types</h3>
          {Object.entries(availablePostTypes).map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={settings.allowed_post_types.includes(value)}
                onChange={() => onTogglePostType(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="nastroje-form-grid">
          <label>
            <span>Lead form name</span>
            <input value={settings.lead_form_name} onChange={(event) => onChange('lead_form_name', event.target.value)} />
          </label>
          <label>
            <span>Lead CTA label</span>
            <input value={settings.lead_cta_label} onChange={(event) => onChange('lead_cta_label', event.target.value)} />
          </label>
        </div>

        <label className="nastroje-full">
          <span>Lead intro message</span>
          <textarea value={settings.lead_intro_message} onChange={(event) => onChange('lead_intro_message', event.target.value)} />
        </label>

        <label className="nastroje-full">
          <span>Lead success message</span>
          <textarea value={settings.lead_success_message} onChange={(event) => onChange('lead_success_message', event.target.value)} />
        </label>
      </SectionCard>
    </div>
  );
}
