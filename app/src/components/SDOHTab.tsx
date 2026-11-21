import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, MessageSquarePlus } from 'lucide-react';
import type { TabId } from '../types.ts';
import type { DerivedPatientChart, MissingQuestionPrompt, SdohStatus } from '../utils/patientChart.ts';

interface SDOHTabProps {
  chart: DerivedPatientChart;
  outreachDraft: string;
  onAddQuestionToOutreach: (prompt: MissingQuestionPrompt) => void;
  onNavigateTab: (tab: TabId) => void;
}

function StatusBadge({ status }: { status: SdohStatus }) {
  if (status === 'Positive') {
    return (
      <span className="inline-block rounded-[2px] bg-[#C53030] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
        Positive
      </span>
    );
  }
  if (status === 'Negative' || status === 'Documented') {
    return (
      <span className="inline-block rounded-[2px] bg-[#15803D] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
        {status}
      </span>
    );
  }
  if (status === 'Unclear') {
    return (
      <span className="inline-block rounded-[2px] bg-[#D97706] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
        Unclear
      </span>
    );
  }
  if (status === 'Attribute') {
    return (
      <span className="inline-block rounded-[2px] bg-[#6B46C1] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
        Attribute
      </span>
    );
  }
  return (
    <span className="inline-block rounded-[2px] bg-[#64748B] px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
      Not asked
    </span>
  );
}

export const SDOHTab: React.FC<SDOHTabProps> = ({
  chart,
  outreachDraft,
  onAddQuestionToOutreach,
  onNavigateTab,
}) => {
  const [tableOpen, setTableOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [addedDomains, setAddedDomains] = useState<Record<string, boolean>>({});

  const completePct = Math.round((chart.completeCount / chart.totalCount) * 100);
  const unclearPct = Math.round((chart.unclearCount / chart.totalCount) * 100);
  const notAskedPct = Math.max(0, 100 - completePct - unclearPct);

  const handleAskPatient = (prompt: MissingQuestionPrompt) => {
    onAddQuestionToOutreach(prompt);
    setAddedDomains((prev) => ({ ...prev, [prompt.domain]: true }));
  };

  const isAlreadyInDraft = (prompt: MissingQuestionPrompt) =>
    Boolean(addedDomains[prompt.domain]) ||
    outreachDraft.includes(prompt.englishQuestion.slice(0, 28)) ||
    outreachDraft.includes(prompt.translatedQuestion.slice(0, 28));

  return (
    <div className="space-y-3">
      {/* Completeness Meter Panel */}
      <section className="ehr-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[14px] font-bold text-[#1F3A5F]">
              Social Determinants of Health (SDOH) Screening Grid
            </h1>
            <p className="mt-0.5 text-[12.5px] font-semibold text-slate-800 tabular-nums">
              {chart.completenessSummary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-slate-700">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#2B6CB0] inline-block" aria-hidden="true" />
              Complete ({chart.completeCount})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#D97706] inline-block" aria-hidden="true" />
              Unclear ({chart.unclearCount})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#94A3B8] inline-block" aria-hidden="true" />
              Not asked ({chart.notAskedCount})
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('outreach')}
              className="ehr-btn-secondary"
            >
              Open Outreach draft
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-[2px] bg-slate-200 border border-slate-300">
          {completePct > 0 ? (
            <div className="bg-[#2B6CB0] h-full" style={{ width: `${completePct}%` }} />
          ) : null}
          {unclearPct > 0 ? (
            <div className="bg-[#D97706] h-full" style={{ width: `${unclearPct}%` }} />
          ) : null}
          {notAskedPct > 0 ? (
            <div className="bg-[#94A3B8] h-full" style={{ width: `${notAskedPct}%` }} />
          ) : null}
        </div>
      </section>

      {/* Main 7-column EHR SDOH Grid */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setTableOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {tableOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>AHC HRSN & Intake Screening Domains ({chart.sdohRows.length})</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Language is documented as an attribute, never Positive or Negative
          </span>
        </button>

        {tableOpen ? (
          <div className="overflow-x-auto">
            <table className="ehr-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Answer</th>
                  <th>Evidence from intake</th>
                  <th>Source</th>
                  <th>Last updated</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {chart.sdohRows.map((row) => {
                  const inDraft = row.askPrompt ? isAlreadyInDraft(row.askPrompt) : false;
                  return (
                    <tr key={row.domain}>
                      <td className="font-semibold text-slate-900 whitespace-nowrap">
                        <div>{row.domain}</div>
                        <div className="text-[11px] font-normal text-slate-500">
                          {row.categoryLabel}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="text-slate-900 max-w-[260px]">{row.answer}</td>
                      <td className="text-slate-700 max-w-[280px]">
                        {row.evidence === 'None documented' ? (
                          <span className="text-slate-400">None documented</span>
                        ) : (
                          <span>&ldquo;{row.evidence}&rdquo;</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap uppercase font-mono text-[11.5px] text-slate-600">
                        {row.source}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[12px] text-slate-600 tabular-nums">
                        {row.lastUpdated}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {row.askPrompt ? (
                          <button
                            type="button"
                            onClick={() => handleAskPatient(row.askPrompt!)}
                            className={inDraft ? 'ehr-btn-secondary' : 'ehr-btn-primary'}
                          >
                            {inDraft ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-700" />
                                Added to Outreach
                              </>
                            ) : (
                              <>
                                <MessageSquarePlus className="h-3 w-3" />
                                Ask patient
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-slate-400">Complete</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Bilingual Question Reference Strip */}
      {chart.askQuestions.length > 0 ? (
        <section className="ehr-panel overflow-hidden">
          <button
            type="button"
            onClick={() => setQuestionsOpen((v) => !v)}
            className="ehr-section-header w-full text-left"
          >
            <span className="flex items-center gap-1.5">
              {questionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>
                Bilingual Questions for Incomplete / Unclear Rows ({chart.askQuestions.length})
              </span>
            </span>
            <span className="text-[11px] font-normal text-slate-600">
              Click Ask patient above or below to drop into Outreach draft
            </span>
          </button>

          {questionsOpen ? (
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>English Question</th>
                    <th>{chart.askQuestions[0].targetLanguage} Question</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.askQuestions.map((q) => {
                    const inDraft = isAlreadyInDraft(q);
                    return (
                      <tr key={q.domain}>
                        <td className="font-semibold text-slate-900 whitespace-nowrap">{q.domain}</td>
                        <td className="text-slate-800">{q.englishQuestion}</td>
                        <td className="text-slate-800">{q.translatedQuestion}</td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleAskPatient(q)}
                            className={inDraft ? 'ehr-btn-secondary' : 'ehr-btn-primary'}
                          >
                            {inDraft ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-700" />
                                Added
                              </>
                            ) : (
                              <>
                                <MessageSquarePlus className="h-3 w-3" />
                                Ask patient
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
