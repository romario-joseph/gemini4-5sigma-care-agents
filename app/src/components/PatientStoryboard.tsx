import React from 'react';
import { Globe, Plus } from 'lucide-react';
import type { PatientRecord } from '../types.ts';
import type { DerivedPatientChart } from '../utils/patientChart.ts';

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
  const { intake } = activePatient.result;

  return (
    <aside
      aria-label="Patient storyboard"
      className="w-full lg:w-[240px] shrink-0 bg-[#E8EEF5] border-b lg:border-b-0 lg:border-r border-slate-300 text-[#1E293B]"
    >
      <div className="p-3 space-y-3 text-[12.5px]">
        {/* Patient switcher if more than one record */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-300/80 pb-2">
          <label htmlFor="storyboard-patient-select" className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Patient
          </label>
          <div className="flex items-center gap-1">
            {allPatients.length > 1 ? (
              <select
                id="storyboard-patient-select"
                value={activePatient.id}
                onChange={(e) => onSelectPatientId(e.target.value)}
                className="max-w-[140px] rounded-[3px] border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
              >
                {allPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.result.intake.zip || 'No ZIP'})
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-[11px] text-slate-600">
                {activePatient.isSample ? 'SAMPLE' : 'LIVE'}
              </span>
            )}
            <button
              type="button"
              onClick={onStartNewIntake}
              title="New intake"
              className="rounded-[3px] border border-slate-300 bg-white p-0.5 text-[#1F3A5F] hover:bg-slate-100"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Large patient name, age & sex, synthetic MRN */}
        <div>
          <h2 className="text-[18px] font-bold leading-tight text-[#1F3A5F] break-words">
            {activePatient.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-700">
            <span>{chart.age}</span>
            <span aria-hidden="true">|</span>
            <span>{chart.sex}</span>
          </div>
          <div className="mt-1 font-mono text-[11.5px] font-semibold text-slate-700 tabular-nums">
            MRN: {chart.mrn}
          </div>
        </div>

        {/* Colored Flag Chips */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {chart.urgency3Needs.length > 0 ? (
            <span className="inline-block rounded-[2px] bg-[#C53030] px-1.5 py-0.5 text-[11px] font-bold text-white">
              Urgent need
            </span>
          ) : null}
          {chart.safetyConcern ? (
            <span className="inline-block rounded-[2px] bg-[#DD6B20] px-1.5 py-0.5 text-[11px] font-bold text-white">
              Safety concern
            </span>
          ) : null}
          {chart.interpreterNeeded ? (
            <span className="inline-block rounded-[2px] bg-[#6B46C1] px-1.5 py-0.5 text-[11px] font-bold text-white">
              Interpreter needed
            </span>
          ) : null}
          {chart.missingInfo ? (
            <span className="inline-block rounded-[2px] bg-[#D69E2E] px-1.5 py-0.5 text-[11px] font-bold text-slate-950">
              Missing info
            </span>
          ) : null}
        </div>

        {/* Demographics & Clinical Metadata Grid */}
        <dl className="divide-y divide-slate-300/70 border-t border-b border-slate-300/80 text-[12px]">
          <div className="py-1.5">
            <dt className="text-[11px] font-bold uppercase text-slate-600">Preferred Language</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
              <span>{intake.language || 'Unknown'}</span>
              {chart.interpreterNeeded ? (
                <span className="inline-flex items-center gap-1 rounded-[2px] bg-[#6B46C1] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                  <Globe className="h-3 w-3" />
                  Interpreter flag
                </span>
              ) : null}
            </dd>
          </div>

          <div className="py-1.5">
            <dt className="text-[11px] font-bold uppercase text-slate-600">ZIP & Borough</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
              {intake.zip || 'Missing'} | {chart.borough}
            </dd>
          </div>

          <div className="py-1.5">
            <dt className="text-[11px] font-bold uppercase text-slate-600">Insurance</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-900">{chart.insurance}</span>
              {chart.insuranceUnconfirmed ? (
                <span className="rounded-[2px] bg-[#D97706] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                  Unconfirmed
                </span>
              ) : null}
            </dd>
          </div>

          <div className="py-1.5">
            <dt className="text-[11px] font-bold uppercase text-slate-600">Phone</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
              {chart.phone}
            </dd>
          </div>

          <div className="py-1.5">
            <dt className="text-[11px] font-bold uppercase text-slate-600">PCP</dt>
            <dd className="mt-0.5 font-semibold text-slate-700">
              {chart.pcp}
            </dd>
          </div>
        </dl>

        {/* Active Constraints Summary */}
        {intake.constraints.length > 0 ? (
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-600 mb-1">
              Scheduling & Context
            </div>
            <ul className="space-y-1 text-[11.5px] text-slate-800">
              {intake.constraints.map((c, idx) => (
                <li
                  key={idx}
                  className="rounded-[2px] border border-slate-300 bg-white/80 px-2 py-1 leading-snug"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-300/70">
          Synthetic chart only. Mode: {activePatient.inputMode}
        </div>
      </div>
    </aside>
  );
};
