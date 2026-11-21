import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { FollowUpItem } from '../types.ts';

interface FollowUpsTabProps {
  followUps: FollowUpItem[];
  onUpdateFollowUp: (id: string, patch: Partial<FollowUpItem>) => void;
  onGoToIntake: () => void;
  onAddSampleFollowUp: () => void;
}

function isSafeHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const FollowUpsTab: React.FC<FollowUpsTabProps> = ({
  followUps,
  onUpdateFollowUp,
  onGoToIntake,
  onAddSampleFollowUp,
}) => {
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleSteps = (id: string) => {
    setExpandedStepIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCheckAgain = async (item: FollowUpItem) => {
    setErrors((prev) => ({ ...prev, [item.id]: '' }));

    const referralsPayload =
      item.referrals && item.referrals.length > 0
        ? item.referrals
        : [
            {
              name: item.referralName,
              address: item.referralAddress,
              hours: item.referralHours,
              source_url: item.referralUrl,
            },
          ];

    try {
      const res = await fetch('/api/followup/agent/check-again', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientFirstName: item.patientFirstName,
          language: item.language,
          constraints: item.constraints || [],
          referrals: referralsPayload,
          previousInteractionId: item.interactionId,
          environmentId: item.environmentId,
        }),
      });

      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || 'Could not start Check again agent run.');
      }

      onUpdateFollowUp(item.id, {
        agentJobId: data.jobId,
        agentStatus: 'Queued',
        agentError: undefined,
        usedFallback: false,
        structuredByHydrogen: false,
        checkInApproved: false,
        agentSteps: [
          {
            id: 'queued',
            type: 'status',
            label: item.interactionId
              ? 'Queued Check again in same Managed Agent session'
              : 'Queued Check again with Managed Agent',
          },
        ],
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : 'Check again failed.',
      }));
    }
  };

  return (
    <div className="p-3 space-y-3">
      <section className="ehr-panel px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[14.5px] font-bold text-[#1F3A5F]">
            Follow-up Agent Console (Gemini Managed Agent)
          </h1>
          <p className="text-[12px] text-slate-600">
            Background agent re-checks source URLs for schedule changes or closures and drafts check-in messages in the patient&apos;s language.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddSampleFollowUp}
            className="ehr-btn-secondary"
          >
            Run sample follow-up agent
          </button>
          <button
            type="button"
            onClick={onGoToIntake}
            className="ehr-btn-primary"
          >
            New intake
          </button>
        </div>
      </section>

      {followUps.length === 0 ? (
        <div className="ehr-panel p-6 text-center space-y-3">
          <CalendarClock className="mx-auto h-7 w-7 text-slate-400" />
          <div className="text-[14px] font-bold text-[#1F3A5F]">
            No follow-up agent runs queued yet
          </div>
          <p className="mx-auto max-w-md text-[12.5px] text-slate-600">
            Approve outreach in a patient chart or intake to launch a background Follow-up agent (Gemini Managed Agent), or launch a sample run now.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onGoToIntake}
              className="ehr-btn-primary"
            >
              Open Intake
            </button>
            <button
              type="button"
              onClick={onAddSampleFollowUp}
              className="ehr-btn-secondary"
            >
              Run sample follow-up agent
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {followUps.map((item) => {
            const isAgentBusy = item.agentStatus === 'Queued' || item.agentStatus === 'Running';
            const stepsOpen = Boolean(expandedStepIds[item.id]);
            const sourceLink = item.latestSourceUrl || item.referralUrl;
            const hasSafeUrl = isSafeHttpUrl(sourceLink);
            const steps = item.agentSteps || [];

            return (
              <section key={item.id} className="ehr-panel overflow-hidden">
                <div className="ehr-section-header flex-wrap">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-[#2B6CB0]" />
                    <span>
                      {item.patientFirstName}: {item.referralName}
                    </span>
                    <span className="text-[11px] font-normal text-slate-600">
                      | {item.dueLabel} | {item.language}
                      {item.lastCheckedAt ? ` | Checked ${item.lastCheckedAt}` : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.agentStatus ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 text-[11px] font-bold text-white ${
                          item.agentStatus === 'Done'
                            ? 'bg-[#15803D]'
                            : item.agentStatus === 'Running'
                              ? 'bg-[#2B6CB0]'
                              : 'bg-[#64748B]'
                        }`}
                      >
                        {isAgentBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {item.agentStatus}
                      </span>
                    ) : null}

                    <span
                      className={`inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-bold text-white ${
                        item.status === 'Verified open'
                          ? 'bg-[#15803D]'
                          : item.status === 'Closed'
                            ? 'bg-[#C53030]'
                            : item.status === 'Schedule change noted'
                              ? 'bg-[#D97706]'
                              : 'bg-[#64748B]'
                      }`}
                    >
                      {item.status}
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleCheckAgain(item)}
                      disabled={isAgentBusy}
                      className="ehr-btn-primary"
                    >
                      {isAgentBusy ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {item.agentStatus}...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          Check again
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 space-y-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-900">Referral details:</span>{' '}
                      {item.referralAddress} | {item.referralHours} |{' '}
                      <span className="text-[#2B6CB0] font-semibold">
                        {item.structuredByHydrogen
                          ? 'Gemini Managed Agent (structured by Hydrogen)'
                          : 'Follow-up agent (Gemini Managed Agent)'}
                      </span>
                    </div>
                    {hasSafeUrl ? (
                      <a
                        href={sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#2B6CB0] hover:underline"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>

                  {item.agentError ? (
                    <div className="rounded-[2px] border border-amber-400 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-950 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                          Managed Agent error (fallback to Gemini 4 Neon used)
                        </span>
                        {item.usedFallback ? (
                          <span className="rounded-[2px] bg-[#D97706] px-1.5 py-0.5 text-[10.5px] text-white">
                            Fallback: Gemini 4 Neon
                          </span>
                        ) : null}
                      </div>
                      <p className="font-mono text-[11.5px] text-amber-900 break-all">
                        {item.agentError}
                      </p>
                    </div>
                  ) : null}

                  {errors[item.id] ? (
                    <p className="text-[12px] text-red-700">{errors[item.id]}</p>
                  ) : null}

                  {steps.length > 0 ? (
                    <div className="rounded-[2px] border border-slate-300 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => toggleSteps(item.id)}
                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        <span className="flex items-center gap-1.5">
                          {stepsOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <span>Agent steps ({steps.length})</span>
                          {item.interactionId ? (
                            <span className="font-mono text-[11px] font-normal text-slate-500">
                              Session {item.interactionId.slice(0, 14)}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      {stepsOpen ? (
                        <div className="border-t border-slate-200 divide-y divide-slate-200 bg-white">
                          {steps.map((step) => (
                            <div key={step.id} className="px-2.5 py-1.5 text-[12px]">
                              <div className="font-semibold text-slate-900">{step.label}</div>
                              {step.detail ? (
                                <p className="mt-0.5 text-[11.5px] text-slate-600 break-words">
                                  {step.detail}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {item.agentSummary || item.verificationDetails || item.evidenceQuote || item.checkInMessage ? (
                    <div className="rounded-[2px] border border-slate-300 bg-[#F8FAFC] p-2.5 space-y-2">
                      <div>
                        <span className="font-bold text-slate-900">
                          {item.usedFallback ? 'Fallback check: ' : 'Verified status: '}
                        </span>
                        <span className="text-slate-800">
                          {item.agentSummary ? item.status : item.verificationDetails || item.status}
                        </span>
                      </div>

                      {item.agentSummary ? (
                        <div className="rounded-[2px] border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 whitespace-pre-line">
                          <span className="font-bold text-slate-900">Agent summary: </span>
                          {item.agentSummary}
                        </div>
                      ) : null}

                      {item.evidenceQuote ? (
                        <div className="rounded-[2px] border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700">
                          <span className="font-bold text-slate-900">Evidence quote: </span>
                          &ldquo;{item.evidenceQuote}&rdquo;
                        </div>
                      ) : null}

                      {item.checkInMessage !== undefined && item.checkInMessage !== '' ? (
                        <div className="border-t border-slate-200 pt-2 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11.5px] font-bold uppercase text-slate-600">
                              Check-in draft ({item.language})
                            </span>
                            {item.checkInApproved ? (
                              <span className="inline-flex items-center gap-1 rounded-[2px] bg-[#15803D] px-2 py-0.5 text-[11px] font-bold text-white">
                                <Check className="h-3 w-3" />
                                Approved for outreach
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateFollowUp(item.id, { checkInApproved: true })
                                }
                                className="ehr-btn-primary"
                              >
                                <Check className="h-3 w-3" />
                                Approve
                              </button>
                            )}
                          </div>
                          <textarea
                            rows={2}
                            value={item.checkInMessage}
                            onChange={(e) =>
                              onUpdateFollowUp(item.id, {
                                checkInMessage: e.target.value,
                                checkInApproved: false,
                              })
                            }
                            className="w-full rounded-[3px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
