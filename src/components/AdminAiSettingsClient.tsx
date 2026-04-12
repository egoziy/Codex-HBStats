'use client';

import { useEffect, useState } from 'react';

export default function AdminAiSettingsClient() {
  const [settings, setSettings] = useState({
    enabled: false,
    provider: 'claude',
    hasClaudeKey: false,
    hasOpenaiKey: false,
  });
  const [keyInput, setKeyInput] = useState({ claude: '', openai: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/ai-settings')
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setSettings(d);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');

    const payload: Record<string, unknown> = {
      enabled: settings.enabled,
      provider: settings.provider,
    };
    if (keyInput.claude) payload.apiKeyClaude = keyInput.claude;
    if (keyInput.openai) payload.apiKeyOpenai = keyInput.openai;

    try {
      const res = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setSettings(data);
        setKeyInput({ claude: '', openai: '' });
        setMessage('הגדרות AI נשמרו בהצלחה');
      } else {
        setMessage(data.error || 'שגיאה בשמירה');
      }
    } catch {
      setMessage('שגיאת רשת');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-stone-800">הגדרות עוזר AI</h3>

      <label className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          className="h-4 w-4 accent-red-800"
        />
        <span className="text-sm font-medium text-stone-700">עוזר AI פעיל</span>
      </label>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-stone-600">ספק AI</label>
        <select
          value={settings.provider}
          onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
          className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="openai">ChatGPT (OpenAI)</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-stone-600">
          מפתח Claude API{' '}
          {settings.hasClaudeKey && <span className="text-green-600 font-bold">(מוגדר)</span>}
        </label>
        <input
          type="password"
          value={keyInput.claude}
          onChange={(e) => setKeyInput({ ...keyInput, claude: e.target.value })}
          placeholder={settings.hasClaudeKey ? '••••••••' : 'sk-ant-...'}
          className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-stone-600">
          מפתח OpenAI API{' '}
          {settings.hasOpenaiKey && <span className="text-green-600 font-bold">(מוגדר)</span>}
        </label>
        <input
          type="password"
          value={keyInput.openai}
          onChange={(e) => setKeyInput({ ...keyInput, openai: e.target.value })}
          placeholder={settings.hasOpenaiKey ? '••••••••' : 'sk-...'}
          className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-red-800 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? 'שומר...' : 'שמור הגדרות AI'}
        </button>
        {message && (
          <span className={`text-sm font-medium ${message.includes('הצלחה') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
