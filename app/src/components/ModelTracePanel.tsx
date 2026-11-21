import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import type { FollowUpItem, ModelTraceEntry } from '../types.ts';

interface ModelTracePanelProps {
  modelTrace?: ModelTraceEntry[];
  escalatedToCarbon?: boolean;
  escalationReason?: string;
  followUps?: FollowUpItem[];
  defaultOpen?: boolean;
}

function modelBadgeClass(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('carbon')) return 'bg-[#6B46C1] text-white';
  if (lower.includes('neon')) return 'bg-[#2B6CB0] text-white';
  if (lower.includes('managed agent') || lower.includes('antigravity')) {
    return 'bg-[#15803D] text-white';
  }
  return 'bg-[#1F3A5F] text-white';
}

export const ModelTracePanel: React.FC<ModelTracePanelProps> = ({
  modelTrace = [],
  escalatedToCarbon,
  escalationReason,
  followUps = [],
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const combinedRows = useMemo<ModelTraceEntry[]>(() => {
    const rows = [...modelTrace];
    for (const fu of followUps) {
      if (fu.agentStatus === 'Done') {
        rows.push({
          id: `trace-agent-${fu.id}`,
          step: `Follow-up verification: ${fu.referralName}`,
          model: fu.usedFallback ? 'gemini-4-neon (fallback)' : 'Gemini Managed Agent',
          tools: fu.usedFallback
            ? ['Google Search']
            : ['Google Search', 'URL context', 'Managed session'],
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          note: fu.status,
        });
      }
    }
    return rows;
  }, [modelTrace, followUps]);

  const totals = useMemo(() => {
    return combinedRows.reduce(
      (acc, r) => ({
        durationMs: acc.durationMs + (r.durationMs || 0),
        inputTokens: acc.inputTokens + (r.inputTokens || 0),
        outputTokens: acc.outputTokens + (r.outputTokens || 0),
      }),
      { durationMs: 0, inputTokens: 0, outputTokens: 0 }
    );
  }, [combinedRows]);

  const carbonEntry = combinedRows.find((r) => r.escalated || r.model.includes('carbon'));
  const showEscalation = Boolean(escalatedToCarbon || carbonEntry);
  const displayReason = escalationReason || carbonEntry?.note || 'Unclear intake items required deeper extraction';

  return (
    <section className="ehr-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ehr-section-header w-full text-left"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Cpu className="h-3.5 w-3.5 text-[#2B6CB0]" />
          <span>Model trace ({combinedRows.length} steps)</span>
          {showEscalation ? (
            <span className="ml-1 inline-block rounded-[2px] bg-[#6B46C1] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
              Escalated to Gemini 4 Carbon
            </span>
          ) : null}
        </span>
        <span className="font-mono text-[11px] font-normal text-slate-600 tabular-nums">
          {totals.durationMs > 0 ? `${(totals.durationMs / 1000).toFixed(1)}s | ` : ''}
          {totals.inputTokens.toLocaleString()} in / {totals.outputTokens.toLocaleString()} out tokens
        </span>
      </button>

      {open ? (
        <div className="bg-white">
          {showEscalation ? (
            <div className="border-b border-purple-200 bg-purple-50 px-3 py-1.5 text-[12px] text-purple-950">
              <span className="font-bold">Escalated to Gemini 4 Carbon:</span> {displayReason}
            </div>
          ) : null}

          {combinedRows.length === 0 ? (
            <div className="px-3 py-3 text-[12.5px] text-slate-600">
              No model trace recorded for this encounter yet. Run an intake to inspect per-step model routing, tools, latency, and token usage.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Model</th>
                    <th>Tools used</th>
                    <th className="text-right">Time (ms)</th>
                    <th className="text-right">Input tokens</th>
                    <th className="text-right">Output tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedRows.map((row) => (
                    <tr key={row.id} className={row.escalated ? 'bg-purple-50/50' : ''}>
                      <td className="text-slate-900">
                        <div className="font-semibold">{row.step}</div>
                        {row.note && !row.step.includes(row.note) ? (
                          <div className="text-[11px] text-slate-500">{row.note}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={`inline-block rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] font-bold ${modelBadgeClass(row.model)}`}
                        >
                          {row.model}
                        </span>
                      </td>
                      <td className="text-[12px] text-slate-700">
                        {row.tools.length > 0 ? row.tools.join(', ') : 'None'}
                      </td>
                      <td className="text-right font-mono text-[12px] text-slate-800 tabular-nums whitespace-nowrap">
                        {row.durationMs > 0 ? row.durationMs.toLocaleString() : 'N/A'}
                      </td>
                      <td className="text-right font-mono text-[12px] text-slate-800 tabular-nums whitespace-nowrap">
                        {row.inputTokens > 0 ? row.inputTokens.toLocaleString() : 'N/A'}
                      </td>
                      <td className="text-right font-mono text-[12px] text-slate-800 tabular-nums whitespace-nowrap">
                        {row.outputTokens > 0 ? row.outputTokens.toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={3} className="text-[#1F3A5F]">
                      Total ({combinedRows.length} calls)
                    </td>
                    <td className="text-right font-mono text-[12px] text-[#1F3A5F] tabular-nums">
                      {totals.durationMs.toLocaleString()}
                    </td>
                    <td className="text-right font-mono text-[12px] text-[#1F3A5F] tabular-nums">
                      {totals.inputTokens.toLocaleString()}
                    </td>
                    <td className="text-right font-mono text-[12px] text-[#1F3A5F] tabular-nums">
                      {totals.outputTokens.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};
