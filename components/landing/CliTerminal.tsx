'use client';

import { useRef, useState } from 'react';

type TabId = 'edit' | 'schedule' | 'agents';

interface TabLine {
  kind: 'cmd' | 'comment' | 'out';
  text: string;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'agents', label: 'Agents' },
];

const BLANK: TabLine = { kind: 'out', text: '\u00A0' };

// Only real commands and flags from docs/cli.md; output lines match what the
// CLI actually prints (cli/src/commands/shared.ts printPostSummary, out.note,
// out.table, auth.ts status --json).
const TAB_CONTENT: Record<TabId, TabLine[]> = {
  edit: [
    { kind: 'comment', text: '# pull as Markdown + YAML front matter (takes an edit lock)' },
    { kind: 'cmd', text: 'pawpress posts pull my-post-slug -o post.md' },
    { kind: 'out', text: 'Wrote post.md' },
    BLANK,
    { kind: 'comment', text: '# open it in your editor and make changes' },
    { kind: 'cmd', text: '$EDITOR post.md' },
    BLANK,
    { kind: 'comment', text: '# --write-back refreshes updated_at in the file' },
    { kind: 'cmd', text: 'pawpress posts push post.md --write-back' },
    { kind: 'out', text: 'Wrote post.md' },
    { kind: 'out', text: 'id: 6f1c…' },
    { kind: 'out', text: 'title: My post' },
    { kind: 'out', text: 'slug: my-post' },
    { kind: 'out', text: 'status: draft' },
    { kind: 'out', text: 'category: news' },
    { kind: 'out', text: 'updated_at: 2026-10-28T09:12:44.512+00:00' },
  ],
  schedule: [
    { kind: 'comment', text: '# any future ISO-8601 time with an offset' },
    { kind: 'cmd', text: 'pawpress posts push post.md --at 2027-01-15T09:00:00+08:00 --json' },
    { kind: 'comment', text: '# --json output abbreviated' },
    {
      kind: 'out',
      text: '{"id":"6f1c…","slug":"my-post","status":"scheduled","published_at":"2027-01-15T01:00:00+00:00", …}',
    },
    BLANK,
    { kind: 'comment', text: '# see everything waiting to go live' },
    { kind: 'cmd', text: 'pawpress posts list --status scheduled' },
    { kind: 'out', text: 'id     status                               updated_at                 slug     title' },
    { kind: 'out', text: '6f1c…  scheduled 2027-01-15T01:00:00+00:00  2026-10-28T09:12:44+00:00  my-post  My post' },
  ],
  agents: [
    { kind: 'cmd', text: 'pawpress auth status --json' },
    { kind: 'out', text: '{' },
    { kind: 'out', text: '  "user": { "email": "agent@example.com", "role": "admin" },' },
    {
      kind: 'out',
      text: '  "token": { "name": "hermes", "scopes": ["posts:read", "posts:write", "media:upload"], "expires_at": "2027-01-31T00:00:00Z" }',
    },
    { kind: 'out', text: '}' },
    BLANK,
    { kind: 'cmd', text: 'pawpress posts create --title "…" --category news --file draft.md --json' },
    { kind: 'comment', text: '# --json output abbreviated' },
    { kind: 'out', text: '{"id":"9a2f…","slug":"…","status":"draft", …}' },
    BLANK,
    { kind: 'comment', text: '# exit code 5 = conflict or locked · 3 = auth' },
  ],
};

const lineClass = (kind: TabLine['kind']) =>
  kind === 'cmd' ? 'text-[#f3ecdf]' : kind === 'comment' ? 'text-[#b5aa97]' : 'text-[#f3ecdf]/80';

export default function CliTerminal() {
  const [activeTab, setActiveTab] = useState<TabId>('edit');
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number;
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = TABS[nextIndex];
    setActiveTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-panel border border-[#3b3429] bg-[#221e17]">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[#3b3429] px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff6a4a]" aria-hidden="true" />
        <span className="size-3 rounded-full bg-butter" aria-hidden="true" />
        <span className="size-3 rounded-full bg-sage" aria-hidden="true" />
        <span className="ml-3 font-mono text-xs text-[#b5aa97]">~/blog</span>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="CLI examples" className="flex gap-1 border-b border-[#3b3429] px-2">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`cli-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`cli-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleKeyDown}
              className={`flex min-h-11 items-center border-b-2 px-3 font-mono text-xs uppercase tracking-[0.08em] transition-colors sm:text-sm ${
                selected
                  ? 'border-[#ff6a4a] text-[#f3ecdf]'
                  : 'border-transparent text-[#b5aa97] hover:text-[#f3ecdf]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`cli-panel-${tab.id}`}
          aria-labelledby={`cli-tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== activeTab}
        >
          <pre className="min-h-[300px] overflow-x-auto p-4 font-mono text-xs leading-relaxed sm:p-5 sm:text-sm">
            <code>
              {TAB_CONTENT[tab.id].map((line, index) => (
                <span key={index} className={`block ${lineClass(line.kind)}`}>
                  {line.kind === 'cmd' && (
                    <span className="mr-2 text-[#ff6a4a]" aria-hidden="true">
                      $
                    </span>
                  )}
                  {line.text}
                </span>
              ))}
            </code>
          </pre>
        </div>
      ))}
    </div>
  );
}
