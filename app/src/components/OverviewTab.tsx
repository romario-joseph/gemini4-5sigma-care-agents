import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Mic,
  Plus,
} from 'lucide-react';
import type { FollowUpItem, InputMode, PatientRecord, TabId } from '../types.ts';
import {
  createSampleFollowUpTasks,
  createSamplePatients,
  formatSyntheticMrn,
  inferBoroughFromZip,
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

const DOMAIN_LABELS: Record<string, string> = {
  food: 'Food',
  housing: 'Housing',
  utilities: 'Utilities',
  clinic: 'Clinic',
  transport: 'Transport',
  benefits: 'Benefits',
  other: 'Other',
};

function isTodayIso(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getDueBucket(iso: string): 'Overdue' | 'Today' | 'Tomorrow' {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const dayAfterStart = todayStart + 2 * 24 * 60 * 60 * 1000;
  const target = d.getTime();
  if (target < todayStart) return 'Overdue';
  if (target < tomorrowStart) return 'Today';
  if (target < dayAfterStart) return 'Tomorrow';
  return 'Tomorrow';
}

function summarizeReferrals(p: PatientRecord): {
  label: string;
  tone: 'verified' | 'call' | 'empty';
} {
  const refs = p.result.verifiedReferrals;
  const rejCount = p.result.rejectedReferrals.length;
  if (refs.length === 0 && rejCount === 0) {
    return { label: '0 referrals', tone: 'empty' };
  }
  const verified = refs.filter(
    (r) =>
      !r.checking_live &&
      (r.verification_outcome === 'verified' ||
        (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm'))
  ).length;
  const callCount = refs.filter(
    (r) => !r.checking_live && (r.verification_outcome === 'call_to_confirm' || r.not_verified_live)
  ).length;

  const parts: string[] = [];
  if (verified > 0) parts.push(`${verified} Verified`);
  if (callCount > 0) parts.push(`${callCount} Call`);
  if (rejCount > 0) parts.push(`${rejCount} Rej`);
  return {
    label: parts.join(' | ') || '0 referrals',
    tone: verified > 0 && callCount === 0 ? 'verified' : callCount > 0 ? 'call' : 'empty',
  };
}

interface DonutSegment {
  key: 'verified' | 'call_to_confirm' | 'rejected';
  label: string;
  count: number;
  color: string;
}

const ReferralStatusDonut: React.FC<{
  segments: DonutSegment[];
  isSample: boolean;
}> = ({ segments, isSample }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const total = useMemo(() => segments.reduce((acc, s) => acc + s.count, 0), [segments]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !open) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const size = 140;
    const radius = size / 2;
    const innerRadius = 38;
    const outerRadius = 60;

    svg.attr('viewBox', `0 0 ${size} ${size}`).attr('width', size).attr('height', size);

    const g = svg.append('g').attr('transform', `translate(${radius},${radius})`);

    if (total === 0) {
      g.append('circle')
        .attr('r', (innerRadius + outerRadius) / 2)
        .attr('fill', 'none')
        .attr('stroke', '#E2E8F0')
        .attr('stroke-width', outerRadius - innerRadius);
      return;
    }

    const pie = d3
      .pie<DonutSegment>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(0.03);

    const arc = d3
      .arc<d3.PieArcDatum<DonutSegment>>()
      .innerRadius(innerRadius)
      .outerRadius((d) => (d.data.key === hoveredKey ? outerRadius + 3 : outerRadius))
      .cornerRadius(2);

    const activeSegments = segments.filter((s) => s.count > 0);
    g.selectAll('path')
      .data(pie(activeSegments))
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color)
      .style('cursor', 'pointer')
      .attr('opacity', (d) => (!hoveredKey || hoveredKey === d.data.key ? 1 : 0.45))
      .on('mouseenter', (_, d) => setHoveredKey(d.data.key))
      .on('mouseleave', () => setHoveredKey(null));
  }, [segments, total, hoveredKey, open]);

  const activeSeg = segments.find((s) => s.key === hoveredKey) || null;

  return (
    <section className="ehr-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ehr-section-header w-full text-left"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>Referral Verification Breakdown</span>
        </span>
        {isSample ? (
          <span className="rounded-[2px] bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            SAMPLE
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="p-3 flex items-center gap-4">
          <div className="relative shrink-0">
            <svg ref={svgRef} className="block" aria-label="Referral verification breakdown donut" />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-[18px] font-bold text-[#1F3A5F] tabular-nums leading-none">
                {activeSeg ? activeSeg.count : total}
              </span>
              <span className="mt-0.5 text-[10.5px] font-semibold text-slate-500">
                {activeSeg ? activeSeg.label : 'Total'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            {segments.map((seg) => {
              const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
              return (
                <div
                  key={seg.key}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className="flex items-center justify-between gap-2 rounded-[2px] px-1.5 py-1 text-[12px] hover:bg-slate-100"
                >
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <span
                      className="h-2.5 w-2.5 shrink-0 inline-block"
                      style={{ backgroundColor: seg.color }}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{seg.label}</span>
                  </div>
                  <div className="font-mono tabular-nums font-bold text-slate-900">
                    {seg.count}{' '}
                    <span className="text-[11px] font-normal text-slate-500">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  sessionPatients,
  followUps,
  onSelectPatient,
  onStartIntake,
  onNavigateTab,
  onRunAgentForTask,
}) => {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [worklistOpen, setWorklistOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);

  const hasSessionData = sessionPatients.length > 0;
  const samplePatients = useMemo(() => createSamplePatients(), []);
  const displayPatients = hasSessionData ? sessionPatients : samplePatients;

  const kpis = useMemo(() => {
    const intakesToday = sessionPatients.filter((p) => isTodayIso(p.lastIntakeIso)).length;
    const urgentNeeds = sessionPatients.reduce(
      (acc, p) => acc + p.result.intake.needs.filter((n) => n.urgency === 3).length,
      0
    );
    const verifiedReferrals = sessionPatients.reduce(
      (acc, p) =>
        acc +
        p.result.verifiedReferrals.filter(
          (r) =>
            !r.checking_live &&
            (r.verification_outcome === 'verified' ||
              (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm'))
        ).length,
      0
    );
    const callToConfirm = sessionPatients.reduce(
      (acc, p) =>
        acc +
        p.result.verifiedReferrals.filter(
          (r) => !r.checking_live && (r.verification_outcome === 'call_to_confirm' || r.not_verified_live)
        ).length,
      0
    );
    const followUpsDue = followUps.filter((f) => !f.checkInApproved).length;

    return {
      intakesToday,
      urgentNeeds,
      verifiedReferrals,
      callToConfirm,
      followUpsDue,
    };
  }, [sessionPatients, followUps]);

  const donutSegments = useMemo<DonutSegment[]>(() => {
    const src = displayPatients;
    const verified = src.reduce(
      (acc, p) =>
        acc +
        p.result.verifiedReferrals.filter(
          (r) =>
            !r.checking_live &&
            (r.verification_outcome === 'verified' ||
              (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm'))
        ).length,
      0
    );
    const call = src.reduce(
      (acc, p) =>
        acc +
        p.result.verifiedReferrals.filter(
          (r) => !r.checking_live && (r.verification_outcome === 'call_to_confirm' || r.not_verified_live)
        ).length,
      0
    );
    const rejected = src.reduce((acc, p) => acc + p.result.rejectedReferrals.length, 0);

    return [
      { key: 'verified', label: 'Verified', count: verified, color: '#15803D' },
      { key: 'call_to_confirm', label: 'Call to confirm', count: call, color: '#D97706' },
      { key: 'rejected', label: 'Rejected', count: rejected, color: '#C53030' },
    ];
  }, [displayPatients]);

  const sampleTasks = useMemo(() => createSampleFollowUpTasks(), []);
  const hasRealFollowUps = followUps.length > 0;

  const groupedFollowUps = useMemo(() => {
    const groups: Record<
      'Overdue' | 'Today' | 'Tomorrow',
      Array<{
        id: string;
        followUpId?: string;
        isSample: boolean;
        patientFirstName: string;
        taskLabel: string;
        language: string;
        constraints: string[];
        referralName: string;
        referralAddress: string;
        referralHours: string;
        referralUrl: string;
        agentStatus?: FollowUpItem['agentStatus'];
      }>
    > = {
      Overdue: [],
      Today: [],
      Tomorrow: [],
    };

    if (hasRealFollowUps) {
      for (const f of followUps) {
        const bucket = getDueBucket(f.dueDateIso);
        groups[bucket].push({
          id: f.id,
          followUpId: f.id,
          isSample: false,
          patientFirstName: f.patientFirstName,
          taskLabel: f.referralName,
          language: f.language,
          constraints: f.constraints || [],
          referralName: f.referralName,
          referralAddress: f.referralAddress,
          referralHours: f.referralHours,
          referralUrl: f.referralUrl,
          agentStatus: f.agentStatus,
        });
      }
    } else {
      for (const s of sampleTasks) {
        groups[s.bucket].push({
          id: s.id,
          isSample: true,
          patientFirstName: s.patientFirstName,
          taskLabel: s.taskLabel,
          language: s.language,
          constraints: s.constraints,
          referralName: s.referralName,
          referralAddress: s.referralAddress,
          referralHours: s.referralHours,
          referralUrl: s.referralUrl,
        });
      }
    }

    return groups;
  }, [followUps, hasRealFollowUps, sampleTasks]);

  const previewPatient = displayPatients[0];

  const findFollowUpForPatient = (patient: PatientRecord) => {
    const cleanName = patient.name.toLowerCase().trim();
    return followUps.find((f) => {
      const fName = f.patientFirstName.toLowerCase().trim();
      return fName === cleanName || cleanName.startsWith(fName) || fName.startsWith(cleanName);
    });
  };

  const handleRunTaskAgent = async (item: {
    id: string;
    followUpId?: string;
    patientFirstName: string;
    language: string;
    constraints: string[];
    referralName: string;
    referralAddress: string;
    referralHours: string;
    referralUrl: string;
  }) => {
    setRunningTaskId(item.id);
    try {
      await onRunAgentForTask({
        followUpId: item.followUpId,
        patientFirstName: item.patientFirstName,
        language: item.language,
        constraints: item.constraints,
        referrals: [
          {
            name: item.referralName,
            address: item.referralAddress,
            hours: item.referralHours,
            source_url: item.referralUrl,
          },
        ],
      });
    } finally {
      setRunningTaskId(null);
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Workstation Clinic Banner & Quick Intake Actions */}
      <div className="ehr-panel px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[14.5px] font-bold text-[#1F3A5F]">
            CHW Clinic Worklist | Agents do the work. This view shows today&apos;s patient queue.
          </h1>
          <p className="text-[12px] text-slate-600">
            {hasSessionData
              ? 'Live session intakes and agent verifications. Click any patient row to open Chart Review.'
              : 'Live session counters start at 0. Synthetic sample chart (Maria R.) shown until your first intake.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStartIntake('photo')}
            className="ehr-btn-secondary"
          >
            <Camera className="h-3.5 w-3.5 text-[#2B6CB0]" />
            Form photo
          </button>
          <button
            type="button"
            onClick={() => onStartIntake('voice')}
            className="ehr-btn-secondary"
          >
            <Mic className="h-3.5 w-3.5 text-[#2B6CB0]" />
            Voice note
          </button>
          <button
            type="button"
            onClick={() => onStartIntake('text')}
            className="ehr-btn-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            New text intake
          </button>
        </div>
      </div>

      {/* Dense KPI Row */}
      <section aria-label="Clinic metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          {
            label: 'Intakes today',
            value: kpis.intakesToday,
            edge: 'border-l-[#1F3A5F]',
            text: 'text-[#1F3A5F]',
          },
          {
            label: 'Urgent needs',
            value: kpis.urgentNeeds,
            edge: 'border-l-[#C53030]',
            text: 'text-[#C53030]',
          },
          {
            label: 'Verified referrals',
            value: kpis.verifiedReferrals,
            edge: 'border-l-[#15803D]',
            text: 'text-[#15803D]',
          },
          {
            label: 'Call to confirm',
            value: kpis.callToConfirm,
            edge: 'border-l-[#D97706]',
            text: 'text-[#B45309]',
          },
          {
            label: 'Follow-ups due',
            value: kpis.followUpsDue,
            edge: 'border-l-[#2B6CB0]',
            text: 'text-[#2B6CB0]',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`ehr-panel border-l-[3px] ${kpi.edge} px-3 py-2 flex items-baseline justify-between gap-2`}
          >
            <span className="text-[12px] font-semibold text-slate-600">{kpi.label}</span>
            <span className={`font-mono text-[20px] font-bold tabular-nums ${kpi.text}`}>
              {kpi.value}
            </span>
          </div>
        ))}
      </section>

      {/* Main Worklist Grid */}
      <div className="grid gap-3 lg:grid-cols-12 items-start">
        <div className="lg:col-span-8 space-y-3">
          {/* Clinic Schedule / Worklist Table */}
          <section className="ehr-panel overflow-hidden">
            <button
              type="button"
              onClick={() => setWorklistOpen((v) => !v)}
              className="ehr-section-header w-full text-left"
            >
              <span className="flex items-center gap-1.5">
                {worklistOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span>Clinic Schedule & Intake Worklist ({displayPatients.length})</span>
              </span>
              <span className="text-[11px] font-normal text-slate-600">
                Click any row to open Chart Review
              </span>
            </button>

            {worklistOpen ? (
              <div className="overflow-x-auto">
                <table className="ehr-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient</th>
                      <th>Language</th>
                      <th>ZIP</th>
                      <th>Needs</th>
                      <th>Referrals</th>
                      <th>Follow-up</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPatients.map((patient, idx) => {
                      const refSummary = summarizeReferrals(patient);
                      const fu = findFollowUpForPatient(patient);
                      const mrn = patient.mrn || formatSyntheticMrn(patient.id, idx);
                      const timeStr = new Date(patient.lastIntakeIso).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      });

                      const needsUrgent = patient.result.intake.needs.some((n) => n.urgency === 3);
                      const chartStatus = patient.outreachApproved
                        ? 'Outreach approved'
                        : needsUrgent
                          ? 'Urgent review'
                          : 'Ready';

                      return (
                        <tr
                          key={patient.id}
                          onClick={() => onSelectPatient(patient)}
                          className="cursor-pointer"
                        >
                          <td className="font-mono text-[12px] text-slate-700 whitespace-nowrap tabular-nums">
                            {timeStr}
                          </td>
                          <td className="whitespace-nowrap">
                            <div className="font-bold text-[#1F3A5F] hover:underline">
                              {patient.name}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {mrn} {patient.isSample ? '| SAMPLE' : ''}
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-slate-800">
                            {patient.result.intake.language || 'English'}
                          </td>
                          <td className="font-mono text-[12px] text-slate-800 whitespace-nowrap tabular-nums">
                            {patient.result.intake.zip ||
                              inferBoroughFromZip('', patient.borough || patient.result.intake.borough)}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {patient.result.intake.needs.length === 0 ? (
                                <span className="text-[11.5px] text-slate-400">None</span>
                              ) : (
                                patient.result.intake.needs.map((need) => (
                                  <span
                                    key={need.id}
                                    className={`inline-block rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold text-white whitespace-nowrap ${
                                      need.urgency === 3
                                        ? 'bg-[#C53030]'
                                        : need.urgency === 2
                                          ? 'bg-[#D97706]'
                                          : 'bg-[#64748B]'
                                    }`}
                                  >
                                    {DOMAIN_LABELS[need.domain] || need.domain} ({need.urgency})
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <span
                              className={`inline-block rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold text-white ${
                                refSummary.tone === 'verified'
                                  ? 'bg-[#15803D]'
                                  : refSummary.tone === 'call'
                                    ? 'bg-[#D97706]'
                                    : 'bg-[#64748B]'
                              }`}
                            >
                              {refSummary.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-[12px] text-slate-700">
                            {fu ? fu.agentStatus || fu.status : patient.isSample ? 'Today (Sample)' : 'Not queued'}
                          </td>
                          <td className="whitespace-nowrap">
                            <span
                              className={`inline-block rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold text-white ${
                                chartStatus === 'Outreach approved'
                                  ? 'bg-[#15803D]'
                                  : chartStatus === 'Urgent review'
                                    ? 'bg-[#C53030]'
                                    : 'bg-[#2B6CB0]'
                              }`}
                            >
                              {chartStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {/* Follow-up Tasks Worklist */}
          <section className="ehr-panel overflow-hidden">
            <div className="ehr-section-header">
              <button
                type="button"
                onClick={() => setTasksOpen((v) => !v)}
                className="flex items-center gap-1.5 text-left"
              >
                {tasksOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span>Follow-up Agent Queue</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('followups')}
                className="text-[11.5px] font-semibold text-[#2B6CB0] hover:underline"
              >
                Open Follow-ups tab
              </button>
            </div>

            {tasksOpen ? (
              <div className="overflow-x-auto">
                <table className="ehr-table">
                  <thead>
                    <tr>
                      <th>Due</th>
                      <th>Patient</th>
                      <th>Task</th>
                      <th>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['Overdue', 'Today', 'Tomorrow'] as const).flatMap((bucket) =>
                      groupedFollowUps[bucket].map((item) => {
                        const isBusy =
                          runningTaskId === item.id ||
                          item.agentStatus === 'Queued' ||
                          item.agentStatus === 'Running';
                        return (
                          <tr key={item.id}>
                            <td className="whitespace-nowrap">
                              <span
                                className={`inline-block rounded-[2px] px-1.5 py-0.5 text-[11px] font-bold text-white ${
                                  bucket === 'Overdue'
                                    ? 'bg-[#C53030]'
                                    : bucket === 'Today'
                                      ? 'bg-[#2B6CB0]'
                                      : 'bg-[#64748B]'
                                }`}
                              >
                                {bucket}
                              </span>
                            </td>
                            <td className="font-semibold text-slate-900 whitespace-nowrap">
                              {item.patientFirstName}
                              {item.isSample ? (
                                <span className="ml-1 text-[10.5px] font-normal text-slate-500">
                                  (Sample)
                                </span>
                              ) : null}
                            </td>
                            <td className="text-slate-800">{item.taskLabel}</td>
                            <td className="whitespace-nowrap">
                              {item.agentStatus === 'Done' ? (
                                <span className="inline-flex items-center gap-1 rounded-[2px] bg-[#15803D] px-1.5 py-0.5 text-[11px] font-bold text-white">
                                  <Check className="h-3 w-3" />
                                  Done
                                </span>
                              ) : item.agentStatus ? (
                                <span className="inline-block rounded-[2px] bg-[#2B6CB0] px-1.5 py-0.5 text-[11px] font-bold text-white">
                                  {item.agentStatus}
                                </span>
                              ) : (
                                <span className="inline-block rounded-[2px] bg-[#64748B] px-1.5 py-0.5 text-[11px] font-bold text-white">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap text-right">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleRunTaskAgent(item)}
                                className="ehr-btn-primary"
                              >
                                {isBusy ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Running...
                                  </>
                                ) : (
                                  <>
                                    <Bot className="h-3 w-3" />
                                    Run agent
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>

        {/* Right 4 cols: Verification Donut + Active Outreach Draft Preview */}
        <div className="lg:col-span-4 space-y-3">
          <ReferralStatusDonut segments={donutSegments} isSample={!hasSessionData} />

          <section className="ehr-panel overflow-hidden">
            <div className="ehr-section-header">
              <span>Latest Outreach Draft ({previewPatient.name})</span>
              <span className="rounded-[2px] bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-900 border border-amber-300">
                Draft only
              </span>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-[11.5px] font-semibold text-slate-600">
                Language: {previewPatient.result.intake.language || 'English'}
              </div>
              <div className="rounded-[3px] border border-slate-300 bg-[#1F3A5F] p-2.5 text-[12px] leading-relaxed text-white">
                {previewPatient.result.outreachDraft ||
                  'No outreach draft generated for this patient.'}
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => onSelectPatient(previewPatient)}
                  className="ehr-btn-secondary"
                >
                  Open Chart Review
                </button>
                <button
                  type="button"
                  onClick={() => onStartIntake('text')}
                  className="ehr-btn-primary"
                >
                  <FileText className="h-3 w-3" />
                  Intake Console
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
