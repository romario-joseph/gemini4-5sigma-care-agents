import React, { useMemo, useState } from 'react';
import {
  Bot,
  Camera,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Mic,
} from 'lucide-react';
import type { FollowUpItem, InputMode, PatientRecord, TabId } from '../types.ts';
import {
  createSamplePatients,
  derivePatientChart,
} from '../utils/patientChart.ts';

interface OverviewTabProps {
  sessionPatients: PatientRecord[];
  followUps: FollowUpItem[];
  onSelectPatient: (patient: PatientRecord) => void;
  onStartIntake: (mode: InputMode) => void;
  onNavigateTab: (tab: TabId) => void;
  onRunAgentForTask: (task: {
    followUpId?: string;
    patientFirstName: string;
    language: string;
    constraints: string[];
    referrals: Array<{
      name: string;
      address: string;
      hours: string;
      source_url: string;
    }>;
  }) => Promise<void>;
}

const DOMAIN_LABEL: Record<string, string> = {
  food: 'Food',
  housing: 'Housing',
  utilities: 'Utilities',
  clinic: 'Clinic',
  transport: 'Transport',
  benefits: 'Benefits',
  other: 'Other',
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, Romario';
  if (hour < 18) return 'Good afternoon, Romario';
  return 'Good evening, Romario';
}

function formatRelativeTime(iso: string): string {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  sessionPatients,
  followUps,
  onSelectPatient,
  onStartIntake,
  onNavigateTab,
  onRunAgentForTask,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const samplePatients = useMemo(() => createSamplePatients(), []);
  const displayedPatients = sessionPatients.length > 0 ? sessionPatients : samplePatients;

  const kpis = useMemo(() => {
    let urgentNeeds = 0;
    let verifiedReferrals = 0;
    let callToConfirm = 0;
    let rejectedReferrals = 0;

    for (const p of displayedPatients) {
      urgentNeeds += p.result.intake.needs.filter((n) => n.urgency === 3).length;
      for (const r of p.result.verifiedReferrals) {
        if (r.verification_outcome === 'verified' || (r.verified && !r.not_verified_live)) {
          verifiedReferrals += 1;
        } else {
          callToConfirm += 1;
        }
      }
      rejectedReferrals += p.result.rejectedReferrals.length;
    }

    const followUpsDue =
      followUps.length > 0
        ? followUps.filter((f) => f.status !== 'Verified open' || !f.checkInApproved).length
        : displayedPatients.filter((p) => p.result.verifiedReferrals.length > 0).length;

    return {
      intakesToday: displayedPatients.length,
      urgentNeeds,
      verifiedReferrals,
      callToConfirm,
      rejectedReferrals,
      followUpsDue,
    };
  }, [displayedPatients, followUps]);

  const handleRunSampleAgent = async (patient: PatientRecord) => {
    setRunningTaskId(patient.id);
    setTaskError(null);
    try {
      const refs = patient.result.verifiedReferrals.slice(0, 3).map((r) => ({
        name: r.name,
        address: r.address,
        hours: r.hours,
        source_url: r.source_url,
      }));
      if (refs.length === 0) return;
      await onRunAgentForTask({
        patientFirstName: patient.name,
        language:
          patient.result.intake.language && patient.result.intake.language !== 'unknown'
            ? patient.result.intake.language
            : 'English',
        constraints: patient.result.intake.constraints,
        referrals: refs,
      });
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Could not start agent.');
    } finally {
      setRunningTaskId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="calm-heading">{getGreeting()}</h1>
          <p className="mt-1 text-[14px] text-slate-600">
            Agents verify NYC services and draft outreach. You review and approve every step.
          </p>
        </div>
      </div>

      {/* 4 KPI Tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="calm-card p-4">
          <div className="text-[13px] font-medium text-slate-500">Intakes today</div>
          <div className="mt-1.5 text-[28px] font-semibold text-slate-900 tabular-nums leading-none">
            {kpis.intakesToday}
          </div>
        </div>

        <div className="calm-card p-4">
          <div className="text-[13px] font-medium text-slate-500">Urgent needs</div>
          <div className="mt-1.5 text-[28px] font-semibold text-[#C53030] tabular-nums leading-none">
            {kpis.urgentNeeds}
          </div>
        </div>

        <div className="calm-card p-4">
          <div className="text-[13px] font-medium text-slate-500">Verified referrals</div>
          <div className="mt-1.5 text-[28px] font-semibold text-[#15803D] tabular-nums leading-none">
            {kpis.verifiedReferrals}
          </div>
        </div>

        <div className="calm-card p-4">
          <div className="text-[13px] font-medium text-slate-500">Follow-ups due</div>
          <div className="mt-1.5 text-[28px] font-semibold text-[#2B6CB0] tabular-nums leading-none">
            {kpis.followUpsDue}
          </div>
        </div>
      </section>

      {/* Start Intake Card */}
      <section className="calm-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-900">Start intake</h2>
          <p className="mt-0.5 text-[14px] text-slate-600">
            Capture a handwritten form, voice note, or pasted clinical text.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onStartIntake('photo')}
            className="ehr-btn-secondary"
          >
            <Camera className="h-4 w-4 text-[#2B6CB0]" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => onStartIntake('voice')}
            className="ehr-btn-secondary"
          >
            <Mic className="h-4 w-4 text-[#2B6CB0]" />
            Voice
          </button>
          <button
            type="button"
            onClick={() => onStartIntake('text')}
            className="ehr-btn-primary"
          >
            <FileText className="h-4 w-4" />
            Text
          </button>
        </div>
      </section>

      {/* Patient Worklist */}
      <section className="calm-card overflow-hidden">
        <div className="ehr-section-header">
          <span>Patient worklist</span>
          <span className="text-[13px] font-normal text-slate-500 tabular-nums">
            {displayedPatients.length} {displayedPatients.length === 1 ? 'patient' : 'patients'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="ehr-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Language</th>
                <th>ZIP</th>
                <th>Needs</th>
                <th>Referrals</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {displayedPatients.map((patient, idx) => {
                const chart = derivePatientChart(patient, idx);
                const verifiedCount = patient.result.verifiedReferrals.filter(
                  (r) => r.verification_outcome === 'verified' || (r.verified && !r.not_verified_live)
                ).length;
                const callCount = patient.result.verifiedReferrals.length - verifiedCount;
                const topStatus =
                  verifiedCount > 0
                    ? { label: `${verifiedCount} verified`, cls: 'text-[#15803D]' }
                    : callCount > 0
                      ? { label: `${callCount} call to confirm`, cls: 'text-[#D97706]' }
                      : { label: 'Needs review', cls: 'text-slate-500' };

                return (
                  <tr
                    key={patient.id}
                    onClick={() => onSelectPatient(patient)}
                    className="cursor-pointer"
                  >
                    <td>
                      <div className="font-semibold text-slate-900">{patient.name}</div>
                      <div className="text-[12.5px] text-slate-500 font-mono tabular-nums">
                        {chart.mrn}
                      </div>
                    </td>
                    <td className="text-slate-700 whitespace-nowrap">
                      {chart.preferredLanguageDisplay}
                    </td>
                    <td className="font-mono text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                      {patient.result.intake.zip || 'Missing'}
                    </td>
                    <td>
                      {patient.result.intake.needs.length === 0 ? (
                        <span className="text-[13px] text-slate-500">None</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 text-[13px]">
                          {patient.result.intake.needs.map((need) => (
                            <span
                              key={need.id}
                              className="inline-flex items-center gap-1.5 font-medium text-slate-800"
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  need.urgency === 3
                                    ? 'bg-[#C53030]'
                                    : need.urgency === 2
                                      ? 'bg-[#D97706]'
                                      : 'bg-[#64748B]'
                                }`}
                              />
                              {DOMAIN_LABEL[need.domain] || need.domain}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={`font-semibold text-[13.5px] whitespace-nowrap ${topStatus.cls}`}>
                      {topStatus.label}
                    </td>
                    <td className="text-[13px] text-slate-500 whitespace-nowrap tabular-nums">
                      {formatRelativeTime(patient.lastIntakeIso)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Secondary Activity Behind Details Toggle */}
      <section className="calm-card overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
          aria-expanded={detailsOpen}
        >
          <span className="text-[14px] font-semibold text-slate-800">
            Follow-up queue and referral summary
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0]">
            {detailsOpen ? 'Hide' : 'Details'}
            {detailsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </button>

        {detailsOpen ? (
          <div className="border-t border-slate-200 p-4 grid gap-4 md:grid-cols-2">
            {/* Referral status breakdown */}
            <div className="soft-surface p-4 space-y-3">
              <div className="text-[14px] font-semibold text-slate-900">Referral status</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-white border border-slate-200 p-3">
                  <div className="text-[20px] font-semibold text-[#15803D] tabular-nums">
                    {kpis.verifiedReferrals}
                  </div>
                  <div className="text-[12px] text-slate-500">Verified</div>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 p-3">
                  <div className="text-[20px] font-semibold text-[#D97706] tabular-nums">
                    {kpis.callToConfirm}
                  </div>
                  <div className="text-[12px] text-slate-500">Call first</div>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 p-3">
                  <div className="text-[20px] font-semibold text-[#C53030] tabular-nums">
                    {kpis.rejectedReferrals}
                  </div>
                  <div className="text-[12px] text-slate-500">Rejected</div>
                </div>
              </div>
            </div>

            {/* Quick Follow-up launcher */}
            <div className="soft-surface p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-semibold text-slate-900">
                  Follow-up agent (Gemini Managed Agent)
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('followups')}
                  className="text-[13px] font-semibold text-[#2B6CB0] hover:underline"
                >
                  Open all
                </button>
              </div>
              {taskError ? <p className="text-[13px] text-[#C53030]">{taskError}</p> : null}
              <div className="space-y-2">
                {displayedPatients
                  .filter((p) => p.result.verifiedReferrals.length > 0)
                  .slice(0, 3)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-slate-900 truncate">
                          {p.name}
                        </div>
                        <div className="text-[12.5px] text-slate-500 truncate">
                          {p.result.verifiedReferrals[0].name}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={runningTaskId === p.id}
                        onClick={() => void handleRunSampleAgent(p)}
                        className="ehr-btn-secondary py-1 px-2.5 text-[12.5px] shrink-0"
                      >
                        {runningTaskId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-[#2B6CB0]" />
                        )}
                        Run agent
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
