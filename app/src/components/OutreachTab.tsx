import React, { useState } from 'react';
import { Bot, Check, Loader2, Send, Smartphone, Volume2 } from 'lucide-react';
import type { FollowUpItem, PatientRecord, TabId } from '../types.ts';
import type { DerivedPatientChart } from '../utils/patientChart.ts';

interface OutreachTabProps {
  activePatient: PatientRecord;
  chart: DerivedPatientChart;
  onUpdateOutreachDraft: (draft: string) => void;
  onApproveAndSend: (patient: PatientRecord, draft: string) => Promise<void>;
  onNavigateTab: (tab: TabId) => void;
  matchingFollowUps: FollowUpItem[];
}

export const OutreachTab: React.FC<OutreachTabProps> = ({
  activePatient,
  chart,
  onUpdateOutreachDraft,
  onApproveAndSend,
  onNavigateTab,
  matchingFollowUps,
}) => {
  const [approving, setApproving] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const draft = activePatient.result.outreachDraft || '';
  const targetLang =
    activePatient.result.intake.language &&
    activePatient.result.intake.language.toLowerCase() !== 'unknown'
      ? activePatient.result.intake.language
      : 'English';

  const handlePlayAloud = async () => {
    if (!draft.trim()) return;
    setPlayingAudio(true);
    setAudioError(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draft,
          language: targetLang,
        }),
      });
      const data = (await res.json()) as { audioDataUrl?: string; error?: string };
      if (!res.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Could not generate spoken audio.');
      }
      const audio = new Audio(data.audioDataUrl);
      audio.onended = () => setPlayingAudio(false);
      audio.onerror = () => {
        setPlayingAudio(false);
        setAudioError('Audio playback failed in browser.');
      };
      await audio.play();
    } catch (err) {
      setPlayingAudio(false);
      setAudioError(err instanceof Error ? err.message : 'TTS failed.');
    }
  };

  const handleApproveClick = async () => {
    if (!draft.trim()) return;
    setApproving(true);
    setApproveError(null);
    try {
      await onApproveAndSend(activePatient, draft);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Could not launch follow-up agent.');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-12 items-start">
      {/* Left 7 cols: Outreach Draft Composer */}
      <section className="lg:col-span-7 ehr-panel overflow-hidden">
        <div className="ehr-section-header">
          <span>Patient Outreach Message ({targetLang})</span>
          <span className="font-mono text-[11px] font-normal text-slate-600 tabular-nums">
            {draft.length} chars | Draft only, human approval required
          </span>
        </div>

        <div className="p-3 space-y-3">
          {chart.askQuestions.length > 0 ? (
            <div className="rounded-[2px] border border-slate-300 bg-slate-50 px-2.5 py-2 text-[12px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span>
                {chart.askQuestions.length} screening question(s) available from SDOH tab to confirm missing or unclear items.
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('sdoh')}
                className="ehr-btn-secondary"
              >
                Pick from SDOH tab
              </button>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="ehr-outreach-draft"
              className="block text-[11.5px] font-bold uppercase text-slate-600 mb-1"
            >
              Editable SMS / Check-in Draft (To: {chart.phone})
            </label>
            <textarea
              id="ehr-outreach-draft"
              rows={7}
              value={draft}
              onChange={(e) => onUpdateOutreachDraft(e.target.value)}
              placeholder="Outreach message draft appears here..."
              className="w-full rounded-[3px] border border-slate-300 bg-white px-2.5 py-2 text-[13px] text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
            />
          </div>

          {audioError ? <p className="text-[12px] text-red-700">{audioError}</p> : null}
          {approveError ? <p className="text-[12px] text-red-700">{approveError}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handlePlayAloud()}
              disabled={playingAudio || !draft.trim()}
              className="ehr-btn-secondary"
            >
              {playingAudio ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Playing aloud...
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5" />
                  Play aloud ({targetLang})
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {activePatient.outreachApproved || matchingFollowUps.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigateTab('followups')}
                  className="ehr-btn-secondary"
                >
                  <Bot className="h-3.5 w-3.5 text-[#2B6CB0]" />
                  View Follow-up Agent ({matchingFollowUps.length})
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void handleApproveClick()}
                disabled={approving || !draft.trim()}
                className="ehr-btn-primary"
              >
                {approving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Approving & starting agent...
                  </>
                ) : activePatient.outreachApproved ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Approved (Re-run Follow-up Agent)
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Approve and send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Right 5 cols: Patient SMS Preview & Follow-up Queue */}
      <section className="lg:col-span-5 ehr-panel overflow-hidden">
        <div className="ehr-section-header">
          <span className="flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Patient SMS Preview</span>
          </span>
          <span className="rounded-[2px] bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-900 border border-amber-300">
            {activePatient.outreachApproved ? 'Approved' : 'Draft only, never sent'}
          </span>
        </div>

        <div className="p-3 bg-slate-100 space-y-3">
          <div className="rounded-[4px] border border-slate-300 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[11px] text-slate-600">
              <span className="font-bold text-[#1F3A5F]">NYC Community Health CHW</span>
              <span className="font-mono">{chart.phone}</span>
            </div>
            <div className="rounded-[4px] bg-[#2B6CB0] px-3 py-2 text-[12.5px] leading-relaxed text-white whitespace-pre-wrap">
              {draft || 'No outreach message drafted for this encounter.'}
            </div>
          </div>

          <div className="text-[11.5px] text-slate-600">
            Clicking &ldquo;Approve and send&rdquo; logs human approval and starts the Follow-up agent (Gemini Managed Agent) in the background to verify hours and draft check-ins.
          </div>
        </div>
      </section>
    </div>
  );
};
