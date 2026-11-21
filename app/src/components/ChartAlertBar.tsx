import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { ChartAlertItem } from '../utils/patientChart.ts';

interface ChartAlertBarProps {
  alerts: ChartAlertItem[];
  acknowledgedIds: string[];
  onAcknowledge: (alertId: string) => void;
}

export const ChartAlertBar: React.FC<ChartAlertBarProps> = ({
  alerts,
  acknowledgedIds,
  onAcknowledge,
}) => {
  const [expanded, setExpanded] = useState(false);

  const visibleAlerts = alerts.filter((a) => !acknowledgedIds.includes(a.id));
  if (visibleAlerts.length === 0) return null;

  const urgentCount = visibleAlerts.filter((a) => a.severity === 'urgent').length;
  const warningCount = visibleAlerts.filter((a) => a.severity === 'warning').length;

  return (
    <div className="calm-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {urgentCount > 0 ? (
              <span className="h-2.5 w-2.5 rounded-full bg-[#C53030]" aria-hidden="true" />
            ) : null}
            {warningCount > 0 ? (
              <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" aria-hidden="true" />
            ) : null}
          </div>
          <span className="text-[14px] font-semibold text-slate-900">
            {visibleAlerts.length} {visibleAlerts.length === 1 ? 'alert' : 'alerts'}
          </span>
          <span className="hidden sm:inline truncate text-[13px] text-slate-500">
            {visibleAlerts[0].title}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2B6CB0] shrink-0">
          {expanded ? 'Hide' : 'Details'}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
          {visibleAlerts.map((alert) => {
            const dotColor = alert.severity === 'urgent' ? 'bg-[#C53030]' : 'bg-[#D97706]';

            return (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-slate-900">{alert.title}</div>
                    <div className="text-[13px] text-slate-600">{alert.detail}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAcknowledge(alert.id)}
                  className="ehr-btn-secondary py-1 px-2.5 text-[12.5px]"
                >
                  <Check className="h-3.5 w-3.5" />
                  Acknowledge
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
