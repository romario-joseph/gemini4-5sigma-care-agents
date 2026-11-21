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
  demoMode?: boolean;
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
  demoMode = false,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleDetails = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCheckAgain = async (item: FollowUpItem) => {
    setErrors((prev) => ({ ...prev, [item.id]: '' }));

    if (demoMode) {
      const checkedAt = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      onUpdateFollowUp(item.id, {
        agentStatus: 'Done',
        status: 'Verified open',
        agentError: undefined,
        usedFallback: false,
        lastCheckedAt: checkedAt,
        agentSteps: [
          ...(item.agentSteps || []),
          {
            id: `demo-recheck-${Date.now()}`,
            type: 'result',
            label: 'Re-checked in Demo mode (same session)',
            detail: `Confirmed ${item.referralName} hours (${item.referralHours}) remain open.`,
          },
        ],
      });
      return;
    }

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
        throw new Error(data.error || 'Could not start Check again.');
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
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="calm-heading">Follow-up agent (Gemini Managed Agent)</h1>
          <p className="mt-1 text-[14px] text-slate-600">
            Re-checks referral pages for closures or hour changes and drafts patient check-ins.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onAddSampleFollowUp} className="ehr-btn-secondary">
            Run sample
          </button>
          <button type="button" onClick={onGoToIntake} className="ehr-btn-primary">
            New intake
          </button>
        </div>
      </div>

      {followUps.length === 0 ? (
        <section className="calm-card p-10 text-center space-y-3">
          <CalendarClock className="mx-auto h-7 w-7 text-slate-400" />
          <div className="text-[16px] font-semibold text-slate-900">No follow-ups queued</div>
          <p className="mx-auto max-w-md text-[14px] text-slate-600">
            Approve outreach in the Patient tab to start a background Follow-up agent, or run a sample now.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button type="button" onClick={onAddSampleFollowUp} className="ehr-btn-secondary">
              Run sample
            </button>
            <button type="button" onClick={onGoToIntake} className="ehr-btn-primary">
              Start intake
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-w-0">
          {followUps.map((item) => {
            const isBusy = item.agentStatus === 'Queued' || item.agentStatus === 'Running';
            const detailsOpen = Boolean(expandedIds[item.id]);
            const sourceLink = item.latestSourceUrl || item.referralUrl;
            const hasSafeUrl = isSafeHttpUrl(sourceLink);
            const steps = item.agentSteps || [];

            const statusColor =
              item.status === 'Verified open'
                ? 'text-[#15803D]'
                : item.status === 'Closed'
                  ? 'text-[#C53030]'
                  : item.status === 'Schedule change noted'
                    ? 'text-[#D97706]'
                    : 'text-slate-600';

            return (
              <section key={item.id} className="calm-card p-5 space-y-4 min-w-0 w-full overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                      <Bot className="h-4 w-4 text-[#2B6CB0] shrink-0" />
                      <h2 className="text-[16px] font-semibold text-slate-900 break-words">
                        {item.patientFirstName} · {item.referralName}
                      </h2>
                      <span className={`text-[13px] font-semibold shrink-0 ${statusColor}`}>
                        {item.status}
                      </span>
                      {item.agentStatus ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-slate-500 shrink-0">
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2B6CB0]" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-[#15803D]" />
                          )}
                          {item.agentStatus}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-slate-600 min-w-0">
                      <span
                        className="inline-block max-w-full sm:max-w-[360px] truncate"
                        title={item.referralAddress}
                      >
                        {item.referralAddress}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>{item.dueLabel}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>{item.language}</span>
                      {item.lastCheckedAt ? (
                        <>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span>Checked {item.lastCheckedAt}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleDetails(item.id)}
                      className="ehr-btn-secondary py-1.5 px-3 text-[13px]"
                    >
                      {detailsOpen ? 'Hide' : 'Details'}
                      {detailsOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCheckAgain(item)}
                      disabled={isBusy}
                      className="ehr-btn-primary py-1.5 px-3 text-[13px]"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                      Check again
                    </button>
                  </div>
                </div>

                {item.agentError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#D97706] shrink-0 mt-0.5" />
                    <span className="break-all">
                      Fallback used: {item.agentError}
                    </span>
                  </div>
                ) : null}

                {errors[item.id] ? (
                  <p className="text-[13px] text-[#C53030]">{errors[item.id]}</p>
                ) : null}

                {item.checkInMessage ? (
                  <div className="soft-surface p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-700">
                        Check-in draft ({item.language})
                      </span>
                      {item.checkInApproved ? (
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#15803D]">
                          <Check className="h-4 w-4" />
                          Approved
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpdateFollowUp(item.id, { checkInApproved: true })}
                          className="ehr-btn-primary py-1 px-3 text-[13px]"
                        >
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
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
                    />
                  </div>
                ) : null}

                {detailsOpen ? (
                  <div className="border-t border-slate-100 pt-4 space-y-3 text-[13.5px]">
                    {item.agentSummary ? (
                      <p className="text-slate-700 whitespace-pre-line">{item.agentSummary}</p>
                    ) : null}

                    {item.evidenceQuote ? (
                      <div className="soft-surface px-3.5 py-2.5 text-slate-700">
                        <span className="font-semibold text-slate-900">Evidence quote: </span>
                        &ldquo;{item.evidenceQuote}&rdquo;
                      </div>
                    ) : null}

                    {steps.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                          Agent steps ({steps.length})
                          {item.interactionId ? ` · Session ${item.interactionId.slice(0, 12)}` : ''}
                        </div>
                        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                          {steps.map((step) => (
                            <li key={step.id} className="px-3.5 py-2 text-[13px]">
                              <div className="font-semibold text-slate-900">{step.label}</div>
                              {step.detail ? (
                                <p className="text-slate-600 break-words">{step.detail}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {hasSafeUrl ? (
                      <a
                        href={sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#2B6CB0] hover:underline"
                      >
                        Open source page
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
