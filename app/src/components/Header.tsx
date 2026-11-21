import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Clock, MapPin, Plus, Search, User } from 'lucide-react';
import type { PatientRecord, TabId } from '../types.ts';
import { formatSyntheticMrn } from '../utils/patientChart.ts';

interface SystemBarProps {
  patients: PatientRecord[];
  demoMode: boolean;
  onDemoModeChange: (enabled: boolean) => void;
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
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 6);
    return patients.filter((p, idx) => {
      const mrn = (p.mrn || formatSyntheticMrn(p.id, idx)).toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(q);
      const zipMatch = (p.result.intake.zip || '').toLowerCase().includes(q);
      const boroughMatch = (p.borough || p.result.intake.borough || '').toLowerCase().includes(q);
      return nameMatch || zipMatch || boroughMatch || mrn.includes(q);
    });
  }, [patients, query]);

  const handleChoose = (patient: PatientRecord) => {
    onSelectPatient(patient);
    setQuery('');
    setDropdownOpen(false);
  };

  return (
    <header className="bg-[#1F3A5F] text-white border-b border-[#152944]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 min-h-[42px]">
        {/* Left: System identity, user, location, clock */}
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-1.5 font-bold tracking-tight text-white hover:text-blue-100 whitespace-nowrap focus:outline-none"
          >
            <Activity className="h-4 w-4 text-sky-300" />
            <span className="text-[14px]">Care Agents</span>
          </button>

          <span className="h-3.5 w-px bg-white/25 hidden sm:inline-block" aria-hidden="true" />

          <span className="inline-flex items-center gap-1 text-white/95 font-medium whitespace-nowrap">
            <User className="h-3.5 w-3.5 text-sky-200" />
            R. Joseph, CHW
          </span>

          <span className="h-3.5 w-px bg-white/25 hidden md:inline-block" aria-hidden="true" />

          <span className="hidden md:inline-flex items-center gap-1 text-sky-100 whitespace-nowrap">
            <MapPin className="h-3.5 w-3.5 text-sky-300" />
            NYC Community Health
          </span>

          <span className="h-3.5 w-px bg-white/25 hidden lg:inline-block" aria-hidden="true" />

          <span className="hidden lg:inline-flex items-center gap-1 font-mono text-[12px] text-sky-100 tabular-nums whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 text-sky-300" />
            {clockText}
          </span>
        </div>

        {/* Right: Patient search, Demo mode switch, New intake button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-52 sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => window.setTimeout(() => setDropdownOpen(false), 160)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length > 0) {
                  e.preventDefault();
                  handleChoose(matches[0]);
                }
              }}
              placeholder="Find patient (name, MRN, ZIP)..."
              aria-label="Find patient by name, MRN, or ZIP"
              className="w-full rounded-[3px] border border-[#345480] bg-[#152944] py-1 pl-7 pr-2 text-[12px] text-white placeholder:text-slate-300 focus:border-sky-400 focus:bg-[#0F1E33] focus:outline-none"
            />

            {dropdownOpen && (query.trim().length > 0 || matches.length > 0) ? (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-[3px] border border-slate-300 bg-white py-1 shadow-lg z-50 text-slate-900">
                {matches.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-[12px] text-slate-500">
                    No matching patients for &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  matches.map((p, idx) => {
                    const mrn = p.mrn || formatSyntheticMrn(p.id, idx);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => handleChoose(p)}
                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] hover:bg-slate-100 border-b border-slate-100 last:border-b-0"
                      >
                        <span className="font-semibold text-slate-900">
                          {p.name}{' '}
                          <span className="font-mono text-[11px] font-normal text-slate-500">
                            ({mrn})
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                          {p.result.intake.zip || 'No ZIP'} | {p.result.intake.language || 'English'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[12px] text-sky-100 whitespace-nowrap">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => onDemoModeChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded-[2px] border-white/40 accent-[#2B6CB0]"
            />
            <span>Demo mode</span>
          </label>

          <button
            type="button"
            onClick={onNewIntake}
            className="inline-flex items-center gap-1 rounded-[3px] bg-[#2B6CB0] border border-[#4287CE] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#235891] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
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
  referralCount: number;
  unclearOrMissingCount: number;
  evalRunningText?: string | null;
}

const ACTIVITY_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'chart_review', label: 'Chart Review' },
  { id: 'sdoh', label: 'SDOH' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'resources', label: 'Resources' },
  { id: 'eval', label: 'Eval' },
];

export const ActivityTabStrip: React.FC<ActivityTabStripProps> = ({
  activeTab,
  onTabChange,
  followUpCount,
  referralCount,
  unclearOrMissingCount,
  evalRunningText,
}) => {
  return (
    <nav
      aria-label="EHR activity tabs"
      className="flex items-end gap-0.5 overflow-x-auto bg-[#DCE3EC] border-b border-slate-300 px-2 pt-1.5"
    >
      {ACTIVITY_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        let badge: string | null = null;
        if (tab.id === 'sdoh' && unclearOrMissingCount > 0) {
          badge = String(unclearOrMissingCount);
        } else if (tab.id === 'referrals' && referralCount > 0) {
          badge = String(referralCount);
        } else if (tab.id === 'followups' && followUpCount > 0) {
          badge = String(followUpCount);
        } else if (tab.id === 'eval' && evalRunningText) {
          badge = evalRunningText;
        }

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] whitespace-nowrap border-t-2 border-x rounded-t-[3px] transition-colors ${
              isActive
                ? 'bg-white border-t-[#2B6CB0] border-x-slate-300 text-[#1F3A5F] font-bold -mb-px pb-[7px]'
                : 'bg-[#E9EEF4] border-t-transparent border-x-transparent text-slate-700 hover:bg-[#F3F6FA] font-medium'
            }`}
          >
            <span>{tab.label}</span>
            {badge ? (
              <span
                className={`px-1.5 py-0.2 rounded-[2px] font-mono text-[10.5px] tabular-nums font-bold ${
                  tab.id === 'sdoh'
                    ? 'bg-amber-600 text-white'
                    : tab.id === 'eval'
                      ? 'bg-[#2B6CB0] text-white'
                      : 'bg-[#1F3A5F] text-white'
                }`}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
      {activeTab === 'intake' ? (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] whitespace-nowrap border-t-2 border-t-[#2B6CB0] border-x border-x-slate-300 rounded-t-[3px] bg-white text-[#1F3A5F] font-bold -mb-px pb-[7px]">
          New Intake
        </span>
      ) : null}
    </nav>
  );
};
