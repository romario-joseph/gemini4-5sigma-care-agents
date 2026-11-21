import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FollowUpItem, PatientRecord, TabId } from '../types.ts';
import type { DerivedPatientChart } from '../utils/patientChart.ts';

interface ChartReviewTabProps {
  activePatient: PatientRecord;
  chart: DerivedPatientChart;
  followUps: FollowUpItem[];
  onNavigateTab: (tab: TabId) => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  food: 'Food',
  housing: 'Housing',
  utilities: 'Utilities',
  clinic: 'Clinic',
  transport: 'Transport',
  benefits: 'Benefits',
  other: 'Other',
};

export const ChartReviewTab: React.FC<ChartReviewTabProps> = ({
  activePatient,
  chart,
  followUps,
  onNavigateTab,
}) => {
  const [needsOpen, setNeedsOpen] = useState(true);
  const [unclearOpen, setUnclearOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);

  const { intake, verifiedReferrals, rejectedReferrals, durationSeconds } = activePatient.result;

  const verifiedCount = verifiedReferrals.filter(
    (r) =>
      !r.checking_live &&
      (r.verification_outcome === 'verified' ||
        (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm'))
  ).length;
  const callCount = verifiedReferrals.filter(
    (r) => !r.checking_live && (r.verification_outcome === 'call_to_confirm' || r.not_verified_live)
  ).length;

  const matchingFollowUps = useMemo(() => {
    const cleanName = activePatient.name.toLowerCase().trim();
    return followUps.filter((f) => {
      const fName = f.patientFirstName.toLowerCase().trim();
      return fName === cleanName || cleanName.startsWith(fName) || fName.startsWith(cleanName);
    });
  }, [followUps, activePatient.name]);

  const combinedTimeline = useMemo(() => {
    const events = [...activePatient.timeline];
    for (const fu of matchingFollowUps) {
      const fuTime = fu.lastCheckedAt || fu.dueLabel;
      events.push({
        id: `tl-fu-${fu.id}`,
        type: 'followup_agent',
        title: `Follow-up agent (${fu.agentStatus || 'Scheduled'}): ${fu.referralName}`,
        detail: fu.agentSummary
          ? `Status ${fu.status} (${fuTime}). ${fu.agentSummary.slice(0, 140)}`
          : `Due ${fu.dueLabel}. Status: ${fu.status}.`,
        timestampIso: fu.dueDateIso,
      });
    }
    return events;
  }, [activePatient.timeline, matchingFollowUps]);

  const lastIntakeFormatted = new Date(activePatient.lastIntakeIso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="space-y-3">
      {/* Encounter Header Strip */}
      <section className="ehr-panel p-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[14px] font-bold text-[#1F3A5F]">
            Chart Review | Encounter Summary
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-600">
            Last intake: {lastIntakeFormatted} | Mode: {activePatient.inputMode} | Pipeline: {durationSeconds}s | SDOH: {chart.completenessSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onNavigateTab('sdoh')}
            className="ehr-btn-secondary"
          >
            SDOH Grid ({chart.completeCount}/{chart.totalCount})
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('referrals')}
            className="ehr-btn-primary"
          >
            Referrals ({verifiedCount} Verified, {callCount} Call, {rejectedReferrals.length} Rejected)
          </button>
        </div>
      </section>

      {/* Extracted Needs Table */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setNeedsOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {needsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Extracted Intake Needs ({intake.needs.length})</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Urgency 3 = Immediate, 2 = This week, 1 = Routine
          </span>
        </button>

        {needsOpen ? (
          <div className="overflow-x-auto">
            {intake.needs.length === 0 ? (
              <div className="p-3 text-[12.5px] text-slate-600">
                No actionable referral needs extracted for this encounter.
              </div>
            ) : (
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Urgency</th>
                    <th>Summary</th>
                    <th>Evidence quote from intake</th>
                  </tr>
                </thead>
                <tbody>
                  {intake.needs.map((need) => (
                    <tr key={need.id}>
                      <td className="font-semibold text-slate-900 whitespace-nowrap">
                        {DOMAIN_LABELS[need.domain] || need.domain}
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={`inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-bold text-white ${
                            need.urgency === 3
                              ? 'bg-[#C53030]'
                              : need.urgency === 2
                                ? 'bg-[#D97706]'
                                : 'bg-[#64748B]'
                          }`}
                        >
                          {need.urgency === 3
                            ? '3 - Urgent'
                            : need.urgency === 2
                              ? '2 - This week'
                              : '1 - Routine'}
                        </span>
                      </td>
                      <td className="text-slate-900">{need.summary}</td>
                      <td className="text-slate-700">&ldquo;{need.evidence_quote}&rdquo;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>

      {/* Unclear & Safety Checks */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setUnclearOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {unclearOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Unclear Items & Clinical Safety Checks</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Crossed-out or ambiguous entries remain Unclear until confirmed
          </span>
        </button>

        {unclearOpen ? (
          <div className="overflow-x-auto">
            <table className="ehr-table">
              <thead>
                <tr>
                  <th>Check / Item</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold text-slate-900 whitespace-nowrap">
                    Prompt injection guard
                  </td>
                  <td className="whitespace-nowrap">
                    <span
                      className={`inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-bold text-white ${
                        intake.prompt_injection_detected ? 'bg-[#C53030]' : 'bg-[#15803D]'
                      }`}
                    >
                      {intake.prompt_injection_detected ? 'Blocked' : 'Clear'}
                    </span>
                  </td>
                  <td className="text-slate-700">
                    {intake.prompt_injection_detected
                      ? intake.prompt_injection_reason || 'Unsafe instruction override detected.'
                      : 'No instruction override detected in intake.'}
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold text-slate-900 whitespace-nowrap">
                    Medical advice / dosing guard
                  </td>
                  <td className="whitespace-nowrap">
                    <span
                      className={`inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-bold text-white ${
                        intake.medical_advice_requested ? 'bg-[#D97706]' : 'bg-[#15803D]'
                      }`}
                    >
                      {intake.medical_advice_requested ? 'Escalated' : 'Clear'}
                    </span>
                  </td>
                  <td className="text-slate-700">
                    {intake.medical_advice_requested
                      ? 'Medication or clinical advice requested; excluded from outreach draft and flagged for clinician.'
                      : 'No dosing or medical advice requested.'}
                  </td>
                </tr>
                {intake.unclear.length === 0 ? (
                  <tr>
                    <td className="font-semibold text-slate-900 whitespace-nowrap">
                      Unclear intake items
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-block rounded-[2px] bg-[#15803D] px-2 py-0.5 text-[11px] font-bold text-white">
                        None
                      </span>
                    </td>
                    <td className="text-slate-600">No crossed-out or smudged fields detected.</td>
                  </tr>
                ) : (
                  intake.unclear.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-900 whitespace-nowrap">
                        Unclear note #{idx + 1}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="inline-block rounded-[2px] bg-[#D97706] px-2 py-0.5 text-[11px] font-bold text-white">
                          Unclear
                        </span>
                      </td>
                      <td className="text-slate-800">{item}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Encounter Timeline */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setTimelineOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {timelineOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Encounter & Agent Timeline ({combinedTimeline.length})</span>
          </span>
        </button>

        {timelineOpen ? (
          <div className="overflow-x-auto">
            <table className="ehr-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {combinedTimeline.map((ev) => (
                  <tr key={ev.id}>
                    <td className="font-mono text-[12px] text-slate-600 whitespace-nowrap tabular-nums">
                      {new Date(ev.timestampIso).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="font-semibold text-slate-900 whitespace-nowrap">{ev.title}</td>
                    <td className="text-slate-700">{ev.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
};
