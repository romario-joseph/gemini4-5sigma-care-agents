export type TabId =
  | 'overview'
  | 'patient'
  | 'resources'
  | 'followups'
  | 'eval';

export type PatientStep = 1 | 2 | 3 | 4;

export type InputMode = 'photo' | 'voice' | 'text';

export type NeedDomain =
  | 'food'
  | 'housing'
  | 'utilities'
  | 'clinic'
  | 'transport'
  | 'benefits'
  | 'other';

export interface IntakeNeed {
  id: string;
  domain: NeedDomain;
  urgency: 1 | 2 | 3;
  summary: string;
  evidence_quote: string;
  updatedByCarbon?: boolean;
}

export interface IntakeExtraction {
  patient_first_name: string;
  language: string;
  zip: string;
  borough?: string;
  multiple_patients: boolean;
  prompt_injection_detected: boolean;
  prompt_injection_reason: string;
  medical_advice_requested: boolean;
  needs: IntakeNeed[];
  constraints: string[];
  unclear: string[];
}

export interface ReferralChecks {
  name?: boolean;
  hours: boolean;
  address: boolean;
  eligibility: boolean;
  open_on_available_days: boolean;
}

export type VerificationOutcome = 'verified' | 'call_to_confirm' | 'rejected';

export interface ReferralItem {
  id: string;
  need_id: string;
  domain: NeedDomain;
  name: string;
  address: string;
  phone: string;
  hours: string;
  eligibility: string;
  source_url: string;
  source_title?: string;
  why_matches: string;
  verified: boolean;
  verification_outcome?: VerificationOutcome;
  hours_corrected?: boolean;
  citywide_no_zip?: boolean;
  is_urgent_fallback?: boolean;
  checking_live?: boolean;
  not_verified_live?: boolean;
  from_cache?: boolean;
  official_listing?: boolean;
  dataset_id?: string;
  dataset_name?: string;
  dataset_updated?: string;
  dataset_url?: string;
  subtype?: string;
  verification_note: string;
  evidence_quote?: string;
  rejection_reason?: string;
  checks?: ReferralChecks;
  foundInOfficialDb?: boolean;
  officialAddressMatches?: boolean;
  officialMatchedName?: string;
  officialMatchedAddress?: string;
}

export interface ModelTraceEntry {
  id: string;
  step: string;
  model: string;
  tools: string[];
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  escalated?: boolean;
  note?: string;
}

export interface TimelineStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'warning';
}

export type WorkflowStage = 'idle' | 'read' | 'verify' | 'check' | 'done' | 'error';

export interface PipelineResult {
  intake: IntakeExtraction;
  verifiedReferrals: ReferralItem[];
  rejectedReferrals: ReferralItem[];
  outreachDraft: string;
  durationSeconds: number;
  modelTrace?: ModelTraceEntry[];
  escalatedToCarbon?: boolean;
  escalationReason?: string;
  carbonJobId?: string;
  carbonPending?: boolean;
}

export interface SingleCallReferral {
  name: string;
  domain: NeedDomain;
  address: string;
  phone: string;
  hours: string;
  eligibility: string;
  source_url: string;
  issues: string[];
  rejected: boolean;
  evidence_quote?: string;
  foundInOfficialDb?: boolean;
  officialAddressMatches?: boolean;
  officialMatchedName?: string;
  officialMatchedAddress?: string;
}

export interface SingleCallResult {
  referrals: SingleCallReferral[];
  durationSeconds: number;
  note?: string;
  intake?: IntakeExtraction;
}

export interface EvalMetricRow {
  key: string;
  label: string;
  singleCall: string;
  careAgents: string;
}

export type ExpectedFormat = 'text' | 'photo' | 'voice';

export interface ExpectedNeedSpec {
  domain: NeedDomain;
  urgency: 1 | 2 | 3;
}

export interface TestCase {
  id: string;
  title: string;
  description: string;
  expectedFormat: ExpectedFormat;
  expectedLanguage?: string;
  expectedZip?: string;
  expectedNeeds?: ExpectedNeedSpec[];
  safetyCheck?: string;
  text: string;
}

export interface LoadedMediaFile {
  fileName: string;
  mode: 'photo' | 'voice';
  dataUrl: string;
  mimeType: string;
}

export interface EvalCheckResult {
  name: string;
  passed: boolean;
  reason: string;
}

export interface EvalSideSummary {
  needsF1: number | null;
  urgencyCorrect: number | null;
  languageCorrect: boolean | null;
  zipCorrect: boolean | null;
  safetyPassed: boolean | null;
  referralsTotal: number;
  referralsVerified: number;
  referralsCallToConfirm: number;
  referralsWithSource: number;
  referralsUnsupported: number;
  referralsRejected: number;
  officialDbFoundCount?: number;
  officialAddressMatchCount?: number;
  escalatedToCarbon?: boolean;
  durationSeconds: number;
  predictedDomains: NeedDomain[];
  checks: EvalCheckResult[];
  error?: string;
}

export interface EvalCaseResult {
  caseId: string;
  inputUsed: 'file' | 'text';
  inputFormat: ExpectedFormat;
  inputLabel: string;
  singleCall: EvalSideSummary;
  careAgents: EvalSideSummary;
  consistentDomains?: boolean;
}

export type StressErrorType = 'wrong_hours' | 'wrong_address' | 'closed_day' | 'control';

export interface StressTestCaseResult {
  id: string;
  referralName: string;
  domain: NeedDomain;
  claimedAddress: string;
  claimedHours: string;
  sourceUrl: string;
  datasetName?: string;
  errorType: StressErrorType;
  plantedError: string;
  outcome: 'Rejected' | 'Hours corrected from source' | 'Call to confirm' | 'Verified';
  caught: boolean;
  controlKept: boolean;
  evidenceQuote: string;
  verificationNote: string;
}

export interface StressTestRunResponse {
  cases: StressTestCaseResult[];
  caughtCount: number;
  plantedTotal: number;
  controlsKeptCount: number;
  controlsTotal: number;
  durationSeconds: number;
  ranAtIso: string;
}

export interface EvalRunHistoryEntry {
  id: string;
  runNumber: number;
  timestampIso: string;
  label: string;
  avgSeconds: number;
  verificationSuccessRate: number;
  verifiedCount: number;
  callToConfirmCount: number;
  rejectedCount: number;
  totalReferrals: number;
  casesCompleted: number;
}

export interface FailureFixEntry {
  id: string;
  whatFailed: string;
  whatChanged: string;
  beforeScore: string;
  afterScore: string;
  createdAt: string;
}

export interface BuiltInResource {
  name: string;
  domain: NeedDomain;
  address: string;
  borough: string;
  zip: string;
  phone: string;
  hours: string;
  eligibility: string;
  source_url: string;
  languages: string[];
  openSaturday: boolean;
  open247: boolean;
}

export interface AgentStepItem {
  id: string;
  type: string;
  label: string;
  detail?: string;
}

export type ManagedAgentRunStatus = 'Queued' | 'Running' | 'Done';

export interface FollowUpItem {
  id: string;
  patientFirstName: string;
  referralName: string;
  referralAddress: string;
  referralHours: string;
  referralUrl: string;
  referrals?: Array<{
    name: string;
    address: string;
    hours: string;
    source_url: string;
  }>;
  constraints?: string[];
  language: string;
  dueDateIso: string;
  dueLabel: string;
  status: 'Scheduled' | 'Verified open' | 'Schedule change noted' | 'Closed';
  agentJobId?: string;
  agentStatus?: ManagedAgentRunStatus;
  agentSteps?: AgentStepItem[];
  agentError?: string;
  usedFallback?: boolean;
  structuredByHydrogen?: boolean;
  agentSummary?: string;
  interactionId?: string;
  environmentId?: string;
  evidenceQuote?: string;
  checkInMessage?: string;
  checkInApproved?: boolean;
  lastCheckedAt?: string;
  verificationDetails?: string;
  latestSourceUrl?: string;
}

export interface PatientTimelineEvent {
  id: string;
  type: 'intake' | 'self_check' | 'outreach_drafted' | 'outreach_approved' | 'followup_agent';
  title: string;
  detail: string;
  timestampIso: string;
}

export interface PatientRecord {
  id: string;
  mrn?: string;
  name: string;
  age?: string;
  sex?: string;
  phone?: string;
  borough?: string;
  insurance?: string;
  pcp?: string;
  isSample?: boolean;
  inputMode: InputMode;
  lastIntakeIso: string;
  acknowledgedAlertIds?: string[];
  outreachApproved?: boolean;
  result: PipelineResult;
  timeline: PatientTimelineEvent[];
}

export interface NycResourceRecord {
  id: string;
  name: string;
  domain: NeedDomain;
  domains: NeedDomain[];
  subtype: string;
  address: string;
  zip: string;
  borough: string;
  lat: number;
  lng: number;
  phone: string;
  hours: string;
  languages: string[];
  operator: string;
  agency: string;
  source_dataset_id: string;
  source_dataset_name: string;
  source_url: string;
  website_url?: string;
  dataset_updated: string;
  service_area_zips?: string[];
}

export interface NycDatasetSummary {
  dataset_id: string;
  dataset_name: string;
  source_url: string;
  dataset_updated: string;
  record_count: number;
}

export interface NycResourcesApiResponse {
  items: NycResourceRecord[];
  totalFiltered: number;
  totalRecords: number;
  page: number;
  pageSize: number;
  totalPages: number;
  snapshotDate: string;
  snapshotUpdatedAtIso: string;
  datasetCount: number;
  datasets: NycDatasetSummary[];
  domainCounts: Record<NeedDomain, number>;
}


