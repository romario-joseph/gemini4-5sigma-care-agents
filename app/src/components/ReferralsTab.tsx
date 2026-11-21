import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, MapPin } from 'lucide-react';
import type { PatientRecord, ReferralItem } from '../types.ts';

interface ReferralsTabProps {
  activePatient: PatientRecord;
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

function isSafeHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPhysicalAddress(address: string): boolean {
  const lower = (address || '').toLowerCase().trim();
  if (!lower || lower === 'address not listed') return false;
  if (
    lower.startsWith('online') ||
    lower.startsWith('virtual') ||
    lower.startsWith('access hra') ||
    lower.startsWith('coned.com')
  ) {
    return false;
  }
  return /\d+/.test(address);
}

function buildGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function classifyOutcome(ref: ReferralItem): 'verified' | 'call_to_confirm' | 'rejected' {
  if (ref.verification_outcome) return ref.verification_outcome;
  if (ref.not_verified_live) return 'call_to_confirm';
  return ref.verified ? 'verified' : 'rejected';
}

export const ReferralsTab: React.FC<ReferralsTabProps> = ({ activePatient }) => {
  const [verifiedOpen, setVerifiedOpen] = useState(true);
  const [callOpen, setCallOpen] = useState(true);
  const [rejectedOpen, setRejectedOpen] = useState(true);

  const verifiedList = useMemo(
    () => activePatient.result.verifiedReferrals.filter((r) => classifyOutcome(r) === 'verified'),
    [activePatient]
  );
  const callList = useMemo(
    () =>
      activePatient.result.verifiedReferrals.filter((r) => classifyOutcome(r) === 'call_to_confirm'),
    [activePatient]
  );
  const rejectedList = activePatient.result.rejectedReferrals;

  const renderRow = (ref: ReferralItem, bucket: 'verified' | 'call_to_confirm' | 'rejected') => {
    const hasUrl = isSafeHttpUrl(ref.source_url);
    const hasMap = isPhysicalAddress(ref.address);

    return (
      <tr key={ref.id}>
        <td className="whitespace-nowrap font-semibold text-slate-900">
          {DOMAIN_LABELS[ref.domain] || ref.domain}
        </td>
        <td className="whitespace-nowrap">
          <div className="flex flex-col items-start gap-1">
            {bucket === 'verified' ? (
              <span className="inline-block rounded-[2px] bg-[#15803D] px-2 py-0.5 text-[11px] font-bold text-white">
                Verified
              </span>
            ) : bucket === 'call_to_confirm' ? (
              <span className="inline-block rounded-[2px] bg-[#D97706] px-2 py-0.5 text-[11px] font-bold text-white">
                Call to confirm
              </span>
            ) : (
              <span className="inline-block rounded-[2px] bg-[#C53030] px-2 py-0.5 text-[11px] font-bold text-white">
                Rejected
              </span>
            )}
            {ref.hours_corrected ? (
              <span className="inline-block rounded-[2px] bg-[#2B6CB0] px-1.5 py-0.5 text-[10px] font-bold text-white">
                Hours corrected from source
              </span>
            ) : null}
          </div>
        </td>
        <td className="font-semibold text-slate-900 max-w-[240px]">
          <div>{ref.name}</div>
          {ref.official_listing && ref.dataset_name ? (
            <div className="mt-0.5 text-[11px] font-semibold text-[#1F3A5F]">
              Official NYC listing ({ref.dataset_name}, updated {ref.dataset_updated || 'N/A'})
            </div>
          ) : null}
          {ref.subtype ? (
            <div className="mt-0.5 text-[11px] font-medium text-slate-600">
              {ref.subtype}
            </div>
          ) : null}
          {ref.eligibility ? (
            <div className="mt-0.5 text-[11.5px] font-normal text-slate-600">{ref.eligibility}</div>
          ) : null}
        </td>
        <td className="text-slate-800 max-w-[190px]">
          <div>{ref.address}</div>
          {hasMap ? (
            <a
              href={buildGoogleMapsUrl(ref.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2B6CB0] hover:underline"
            >
              <MapPin className="h-3 w-3" />
              Directions
            </a>
          ) : null}
        </td>
        <td className="font-mono text-[12px] text-slate-800 whitespace-nowrap tabular-nums">
          {ref.phone}
        </td>
        <td className="text-slate-800 max-w-[180px]">{ref.hours}</td>
        <td className="text-slate-700 max-w-[260px]">
          <div className="font-medium text-slate-900">
            {bucket === 'rejected'
              ? ref.rejection_reason || ref.verification_note
              : ref.verification_note}
          </div>
          {ref.evidence_quote ? (
            <div className="mt-1 rounded-[2px] border border-slate-200 bg-slate-50 px-2 py-1 text-[11.5px] text-slate-700">
              &ldquo;{ref.evidence_quote}&rdquo;
            </div>
          ) : null}
        </td>
        <td className="whitespace-nowrap text-right">
          <div className="flex flex-col items-end gap-1">
            {hasUrl ? (
              <a
                href={ref.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ehr-btn-secondary"
              >
                Source
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-[11.5px] text-slate-400">No URL</span>
            )}
            {ref.dataset_url && ref.dataset_url !== ref.source_url && isSafeHttpUrl(ref.dataset_url) ? (
              <a
                href={ref.dataset_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[#2B6CB0] hover:underline"
              >
                NYC Open Data
              </a>
            ) : null}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      {/* Top Verification Count Summary Strip */}
      <section className="ehr-panel p-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[14px] font-bold text-[#1F3A5F]">
            Self-Check Referral Verification Log
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-600">
            Verified requires a read source page confirming name, address, and hours. Unread pages remain Call to confirm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold tabular-nums">
          <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-[#15803D] px-2.5 py-1 text-white">
            Verified: {verifiedList.length}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-[#D97706] px-2.5 py-1 text-white">
            Call to confirm: {callList.length}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-[#C53030] px-2.5 py-1 text-white">
            Rejected: {rejectedList.length}
          </span>
        </div>
      </section>

      {/* Verified Referrals Table */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setVerifiedOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {verifiedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Verified Referrals ({verifiedList.length})</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Source page read and confirmed name, address, and hours
          </span>
        </button>

        {verifiedOpen ? (
          verifiedList.length === 0 ? (
            <div className="p-3 text-[12.5px] text-slate-600">
              No referrals had all three of name, address, and hours confirmed on a live read source page. Check Call to confirm options below.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Need</th>
                    <th>Status</th>
                    <th>Service</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Hours</th>
                    <th>Verification Evidence</th>
                    <th className="text-right">Source</th>
                  </tr>
                </thead>
                <tbody>{verifiedList.map((r) => renderRow(r, 'verified'))}</tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {/* Call to Confirm Table */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setCallOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {callOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Call to Confirm ({callList.length})</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Source page unread, blocked, or incomplete; call before sending
          </span>
        </button>

        {callOpen ? (
          callList.length === 0 ? (
            <div className="p-3 text-[12.5px] text-slate-600">
              No unconfirmed referrals pending phone verification.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Need</th>
                    <th>Status</th>
                    <th>Service</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Hours</th>
                    <th>Audit Note</th>
                    <th className="text-right">Source</th>
                  </tr>
                </thead>
                <tbody>{callList.map((r) => renderRow(r, 'call_to_confirm'))}</tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {/* Rejected Table */}
      <section className="ehr-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setRejectedOpen((v) => !v)}
          className="ehr-section-header w-full text-left"
        >
          <span className="flex items-center gap-1.5">
            {rejectedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Rejected by Self-Check ({rejectedList.length})</span>
          </span>
          <span className="text-[11px] font-normal text-slate-600">
            Contradicted source, closed site, or incompatible hours
          </span>
        </button>

        {rejectedOpen ? (
          rejectedList.length === 0 ? (
            <div className="p-3 text-[12.5px] text-slate-600">
              0 referrals rejected by self-check for this intake.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ehr-table">
                <thead>
                  <tr>
                    <th>Need</th>
                    <th>Status</th>
                    <th>Service</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Hours</th>
                    <th>Rejection Reason & Quote</th>
                    <th className="text-right">Source</th>
                  </tr>
                </thead>
                <tbody>{rejectedList.map((r) => renderRow(r, 'rejected'))}</tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
};
