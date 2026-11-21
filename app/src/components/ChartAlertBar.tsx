import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
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
  const unacknowledged = alerts.filter((a) => !acknowledgedIds.includes(a.id));
  if (unacknowledged.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Urgent and missing chart alerts"
      className="sticky top-0 z-20 border-b border-amber-400 bg-[#FEF3C7] px-3 py-2 text-[#78350F] shadow-xs"
    >
      <div className="space-y-1.5">
        {unacknowledged.map((alert) => (
          <div
            key={alert.id}
            className="flex flex-wrap items-center justify-between gap-2 text-[12px]"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  alert.severity === 'urgent' ? 'text-red-700' : 'text-amber-800'
                }`}
              />
              <div className="min-w-0">
                <span
                  className={`mr-1.5 inline-block rounded-[2px] px-1.5 py-0.5 text-[10.5px] font-bold text-white ${
                    alert.severity === 'urgent' ? 'bg-[#C53030]' : 'bg-[#B45309]'
                  }`}
                >
                  {alert.title}
                </span>
                <span className="font-medium text-amber-950">{alert.detail}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAcknowledge(alert.id)}
              className="inline-flex items-center gap-1 rounded-[3px] border border-amber-700/40 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-50 whitespace-nowrap shrink-0"
            >
              <Check className="h-3 w-3" />
              Acknowledge
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
