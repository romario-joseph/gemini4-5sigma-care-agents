import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  Database,
  Home,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import type { PatientRecord, TabId } from '../types.ts';
import { formatSyntheticMrn } from '../utils/patientChart.ts';

interface SystemBarProps {
  patients: PatientRecord[];
  demoMode: boolean;
  onDemoModeChange: (val: boolean) => void;
  onNewIntake: () => void;
  onSelectPatient: (patient: PatientRecord) => void;
  onGoHome: () => void;
}

export const SystemBar: React.FC<SystemBarProps> = ({
  patients,
  demoMode,
  onDemoModeChange,
  onNewIntake,
  onSelectPatient,
  onGoHome,
}) => {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      );
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 6);
    return patients
      .filter((p, idx) => {
        const name = p.name.toLowerCase();
        const zip = (p.result.intake.zip || '').toLowerCase();
        const mrn = (p.mrn || formatSyntheticMrn(p.id, idx)).toLowerCase();
        return name.includes(q) || zip.includes(q) || mrn.includes(q);
      })
      .slice(0, 8);
  }, [patients, query]);

  return (
    <header className="bg-[#1F3A5F] text-white sticky top-0 z-40">
      <div className="mx-auto max-w-[1380px] flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-2.5">
        {/* Left: Wordmark and Context */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            className="text-[16px] font-semibold tracking-tight text-white hover:text-blue-100 whitespace-nowrap"
          >
            Care Agents
          </button>
          <span className="hidden md:inline text-[13px] text-slate-300 whitespace-nowrap">
            R. Joseph, CHW · NYC Community Health
          </span>
        </div>

        {/* Right: Search, Demo Toggle, Primary Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div ref={searchWrapRef} className="relative w-48 sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              type="search"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              placeholder="Search patient or ZIP"
              aria-label="Search patient or ZIP"
              className="w-full rounded-lg border border-white/20 bg-white/10 py-1.5 pl-9 pr-3 text-[13px] text-white placeholder:text-slate-300 focus:border-blue-300 focus:bg-[#162C49] focus:outline-none"
            />
            {dropdownOpen ? (
              <div className="absolute right-0 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg z-50 overflow-hidden">
                {matches.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] text-slate-500">
                    No matching patients.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {matches.map((p, idx) => {
                      const mrn = p.mrn || formatSyntheticMrn(p.id, idx);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPatient(p);
                              setDropdownOpen(false);
                              setQuery('');
                            }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                          >
                            <span className="font-semibold text-[13.5px] text-slate-900 truncate">
                              {p.name}
                            </span>
                            <span className="font-mono text-[12px] text-slate-500 tabular-nums shrink-0 ml-2">
                              {mrn} · {p.result.intake.zip || 'NYC'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <span className="hidden lg:inline font-mono text-[12.5px] text-slate-300 tabular-nums">
            {clockText}
          </span>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[13px] text-slate-200 whitespace-nowrap">
            <span>Demo</span>
            <button
              type="button"
              role="switch"
              aria-checked={demoMode}
              onClick={() => onDemoModeChange(!demoMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full ${
                demoMode ? 'bg-[#2B6CB0]' : 'bg-white/25'
              }`}
              title="Demo mode replays saved C01 offline"
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                  demoMode ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>

          <button
            type="button"
            onClick={onNewIntake}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2B6CB0] px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-[#235891] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            New intake
          </button>
        </div>
      </div>
    </header>
  );
};

interface ActivityTabStripProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  followUpCount: number;
  activePatientName?: string;
  evalRunningText: string | null;
}

const TOP_TABS: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'patient', label: 'Patient', icon: UserRound },
  { id: 'resources', label: 'Resources', icon: Database },
  { id: 'followups', label: 'Follow-ups', icon: CalendarClock },
  { id: 'eval', label: 'Eval', icon: BarChart3 },
];

export const ActivityTabStrip: React.FC<ActivityTabStripProps> = ({
  activeTab,
  onTabChange,
  followUpCount,
  activePatientName,
  evalRunningText,
}) => {
  return (
    <nav
      aria-label="Primary sections"
      className="bg-white border-b border-slate-200 sticky top-[52px] z-30"
    >
      <div className="mx-auto max-w-[1380px] flex items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {TOP_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          let countLabel: string | null = null;
          if (tab.id === 'followups' && followUpCount > 0) countLabel = String(followUpCount);
          if (tab.id === 'eval' && evalRunningText) countLabel = evalRunningText;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative inline-flex items-center gap-2 px-4 py-3 text-[14px] font-semibold whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-[#2B6CB0] text-[#1F3A5F]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-[#2B6CB0]' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.id === 'patient' && activePatientName ? (
                <span className="hidden sm:inline text-[12.5px] font-normal text-slate-500">
                  · {activePatientName}
                </span>
              ) : null}
              {countLabel ? (
                <span className="font-mono text-[12px] font-semibold text-[#2B6CB0] tabular-nums">
                  ({countLabel})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
