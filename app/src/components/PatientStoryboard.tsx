import React from 'react';
import { Globe, MapPin, Phone, Plus, ShieldCheck } from 'lucide-react';
import type { PatientRecord } from '../types.ts';
import { formatSyntheticMrn, type DerivedPatientChart } from '../utils/patientChart.ts';

interface PatientStoryboardProps {
  allPatients: PatientRecord[];
  activePatient: PatientRecord;
  chart: DerivedPatientChart;
  onSelectPatientId: (id: string) => void;
  onStartNewIntake: () => void;
}

export const PatientStoryboard: React.FC<PatientStoryboardProps> = ({
  allPatients,
  activePatient,
  chart,
  onSelectPatientId,
  onStartNewIntake,
}) => {
  const zip = activePatient.result.intake.zip;
  const flagItems: Array<{ label: string; dotColor: string; textColor: string }> = [];
  if (chart.urgency3Needs.length > 0) {
    flagItems.push({
      label: `${chart.urgency3Needs.length} urgent`,
      dotColor: 'bg-[#C53030]',
      textColor: 'text-[#C53030]',
    });
  }
  if (chart.safetyConcern) {
    flagItems.push({
      label: 'Safety review',
      dotColor: 'bg-[#C53030]',
      textColor: 'text-[#C53030]',
    });
  }
  if (chart.interpreterNeeded) {
    flagItems.push({
      label: `Interpreter (${chart.preferredLanguageDisplay})`,
      dotColor: 'bg-[#2B6CB0]',
      textColor: 'text-[#1F3A5F]',
    });
  }
  if (chart.unclearCount > 0 || !zip) {
    flagItems.push({
      label: 'Missing info',
      dotColor: 'bg-[#D97706]',
      textColor: 'text-[#D97706]',
    });
  }

  return (
    <aside className="w-full lg:w-[264px] lg:shrink-0 space-y-4">
      <div className="calm-card p-4 space-y-4">
        {/* Patient Switcher */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Patient
          </span>
          <button
            type="button"
            onClick={onStartNewIntake}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#2B6CB0] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <select
          aria-label="Select patient"
          value={activePatient.id}
          onChange={(e) => onSelectPatientId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] font-medium text-slate-900 focus:border-[#2B6CB0] focus:bg-white focus:outline-none"
        >
          {allPatients.map((p, idx) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.mrn || formatSyntheticMrn(p.id, idx)})
            </option>
          ))}
        </select>

        {/* Identity Headline */}
        <div className="border-t border-slate-100 pt-3">
          <div className="text-[18px] font-semibold text-slate-900 leading-snug">
            {activePatient.name}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500 font-mono tabular-nums">
            {chart.mrn} · {chart.age} · {chart.sex}
          </div>
        </div>

        {/* Key Clinical Facts */}
        <dl className="space-y-2.5 border-t border-slate-100 pt-3 text-[13.5px]">
          <div className="flex items-center gap-2.5 text-slate-700">
            <Globe className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="font-medium text-slate-900">{chart.preferredLanguageDisplay}</span>
          </div>

          <div className="flex items-center gap-2.5 text-slate-700">
            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="tabular-nums">
              {zip ? `${zip} · ${chart.borough}` : `${chart.borough} · No ZIP`}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-slate-700">
            <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="truncate">
              {chart.insurance}
              {chart.insuranceUnconfirmed ? ' (Unconfirmed)' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-slate-700">
            <Phone className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="font-mono text-[13px] tabular-nums">{chart.phone}</span>
          </div>
        </dl>

        {/* Status Indicators */}
        {flagItems.length > 0 ? (
          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            {flagItems.map((flag) => (
              <div
                key={flag.label}
                className={`flex items-center gap-2 text-[13px] font-semibold ${flag.textColor}`}
              >
                <span className={`h-2 w-2 rounded-full ${flag.dotColor}`} />
                <span>{flag.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
};
