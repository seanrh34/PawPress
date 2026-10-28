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

// Only real commands and flags from docs/cli.md.
const TAB_CONTENT: Record<TabId, TabLine[]> = {
  edit: [
    { kind: 'comment', text: '# pull the post as Markdown + YAML front matter' },
    { kind: 'cmd', text: 'pawpress posts pull my-post-slug -o post.md' },
    { kind: 'out', text: 'wrote post.md, locked for editing' },
    BLANK,
    { kind: 'comment', text: '# open it in your editor and make changes' },
    { kind: 'cmd', text: '$EDITOR post.md' },
    BLANK,
    { kind: 'comment', text: '# push updates the post; --write-back refreshes updated_at in the file' },
    { kind: 'cmd', text: 'pawpress posts push post.md --write-back' },
    { kind: 'out', text: 'updated "My post" (front matter refreshed)' },
  ],
  schedule: [
    { kind: 'comment', text: '# any future ISO-8601 time with an offset' },
    { kind: 'cmd', text: 'pawpress posts push post.md --at 2027-01-15T09:00:00+08:00 --json' },
    { kind: 'out', text: '{"status":"scheduled","publish_at":"2027-01-15T01:00:00.000+00:00"}' },
    BLANK,
    { kind: 'comment', text: '# see everything waiting to go live' },
    { kind: 'cmd', text: 'pawpress posts list --status scheduled' },
    { kind: 'out', text: '2 posts scheduled' },
  ],
  agents: [
    { kind: 'cmd', text: 'pawpress auth status --json' },
    { kind: 'out', text: '{' },
    { kind: 'out', text: '  "user": "agent@example.com",' },
    { kind: 'out', text: '  "scopes": ["posts:read", "posts:write", "media:upload"],' },
    { kind: 'out', text: '  "expires_at": "2027-01-31T00:00:00Z"' },
    { kind: 'out', text: '}' },
    BLANK,
    { kind: 'cmd', text: 'pawpress posts create --title "…" --category news --file draft.md --json' },
    { kind: 'out', text: '{ "id": "9a2f…", "status": "draft" }' },
    BLANK,
    { kind: 'comment', text: '# exit code 5 = conflict or locked · 3 = auth' },
  ],
};

const lineClass = (kind: TabLine['kind']) =>
  kind === 'cmd' ? 'text-slate-100' : kind === 'comment' ? 'text-slate-400' : 'text-slate-300';

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
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/80" aria-hidden="true" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" aria-hidden="true" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" aria-hidden="true" />
        <span className="ml-3 font-mono text-xs text-slate-400">~/blog</span>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="CLI examples" className="flex gap-1 border-b border-slate-800 px-2">
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
              className={`border-b-2 px-3 py-2 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400 ${
                selected
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
          className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400"
        >
          <pre className="min-h-[300px] overflow-x-auto p-4 font-mono text-xs leading-relaxed sm:text-sm">
            <code>
              {TAB_CONTENT[tab.id].map((line, index) => (
                <span key={index} className={`block ${lineClass(line.kind)}`}>
                  {line.kind === 'cmd' && (
                    <span className="mr-2 text-emerald-400" aria-hidden="true">
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
