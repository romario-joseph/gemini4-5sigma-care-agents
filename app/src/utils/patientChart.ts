import { DEMO_C01_RESULT } from '../data/resources.ts';
import type {
  FollowUpItem,
  InputMode,
  IntakeNeed,
  PatientRecord,
  PatientTimelineEvent,
  PipelineResult,
} from '../types.ts';

export type SdohStatus =
  | 'Positive'
  | 'Negative'
  | 'Unclear'
  | 'Not asked'
  | 'Attribute'
  | 'Documented';

export type SdohDomainKey =
  | 'Food'
  | 'Housing'
  | 'Utilities'
  | 'Transportation'
  | 'Interpersonal safety'
  | 'Benefits'
  | 'Insurance'
  | 'Language'
  | 'ZIP'
  | 'Contact';

export interface MissingQuestionPrompt {
  domain: SdohDomainKey;
  englishQuestion: string;
  translatedQuestion: string;
  targetLanguage: string;
}

export interface SdohDomainRow {
  domain: SdohDomainKey;
  categoryLabel: string;
  status: SdohStatus;
  answer: string;
  evidence: string;
  source: InputMode;
  lastUpdated: string;
  askPrompt?: MissingQuestionPrompt;
}

export interface ChartAlertItem {
  id: string;
  severity: 'urgent' | 'warning';
  title: string;
  detail: string;
}

export interface DerivedPatientChart {
  mrn: string;
  age: string;
  sex: string;
  phone: string;
  borough: string;
  insurance: string;
  insuranceUnconfirmed: boolean;
  pcp: string;
  preferredLanguageDisplay: string;
  interpreterNeeded: boolean;
  urgency3Needs: IntakeNeed[];
  safetyConcern: boolean;
  missingInfo: boolean;
  sdohRows: SdohDomainRow[];
  completeCount: number;
  unclearCount: number;
  notAskedCount: number;
  totalCount: number;
  completenessSummary: string;
  missingDomains: SdohDomainKey[];
  askQuestions: MissingQuestionPrompt[];
  alerts: ChartAlertItem[];
}

const ZIP_TO_BOROUGH_PREFIX: Array<{ prefix: string; borough: string }> = [
  { prefix: '104', borough: 'Bronx' },
  { prefix: '112', borough: 'Brooklyn' },
  { prefix: '100', borough: 'Manhattan' },
  { prefix: '101', borough: 'Manhattan' },
  { prefix: '102', borough: 'Manhattan' },
  { prefix: '103', borough: 'Staten Island' },
  { prefix: '111', borough: 'Queens' },
  { prefix: '113', borough: 'Queens' },
  { prefix: '114', borough: 'Queens' },
  { prefix: '116', borough: 'Queens' },
  { prefix: '110', borough: 'Queens' },
];

export function inferBoroughFromZip(zip: string, fallbackBorough?: string): string {
  if (fallbackBorough && fallbackBorough.trim()) return fallbackBorough.trim();
  const clean = (zip || '').trim();
  for (const row of ZIP_TO_BOROUGH_PREFIX) {
    if (clean.startsWith(row.prefix)) return row.borough;
  }
  return clean ? 'NYC' : 'Borough not stated';
}

export function formatSyntheticMrn(recordId: string, index: number = 0): string {
  if (recordId === 'sample-patient-c01') return 'SYN-0001';
  const digits = recordId.replace(/\D/g, '').slice(-4);
  if (digits.length === 4) return `SYN-${digits}`;
  return `SYN-${String(index + 1).padStart(4, '0')}`;
}

const ENGLISH_QUESTIONS: Record<SdohDomainKey, string> = {
  Food: 'In the last 12 months, did you worry that food would run out before you got money to buy more?',
  Housing: 'What is your housing situation today, and are you worried about losing housing or falling behind on rent?',
  Utilities: 'Has any utility company threatened to shut off your electricity, gas, water, or heat?',
  Transportation: 'Has lack of reliable transportation kept you from medical appointments or getting daily groceries?',
  'Interpersonal safety': 'Do you feel safe in your home and daily life, or has anyone hurt, threatened, or pressured you?',
  Benefits: 'Would you like help checking eligibility or applying for SNAP, cash assistance, or WIC?',
  Insurance: 'Do you currently have active health insurance, and would you like help confirming your Medicaid or plan status?',
  Language: 'Which language do you prefer to read and speak during appointments and follow-up calls?',
  ZIP: 'What 5-digit NYC ZIP code do you live in so we can match nearby services?',
  Contact: 'What is the best phone number or safe way to reach you with referral updates?',
};

const TRANSLATED_QUESTIONS: Record<string, Record<SdohDomainKey, string>> = {
  spanish: {
    Food: 'En los ultimos 12 meses, le preocupo quedarse sin comida antes de tener dinero para comprar mas?',
    Housing: 'Cual es su situacion de vivienda hoy y le preocupa perder su hogar o atrasarse con la renta?',
    Utilities: 'Alguna compania de luz, gas o agua le ha enviado aviso de corte?',
    Transportation: 'La falta de transporte le ha impedido ir a citas medicas o conseguir alimentos?',
    'Interpersonal safety': 'Se siente seguro en su casa o alguien le ha lastimado o amenazado?',
    Benefits: 'Necesita ayuda para solicitar o revisar beneficios como SNAP, WIC o asistencia de emergencia?',
    Insurance: 'Tiene seguro medico activo actualmente o necesita confirmar su cobertura de Medicaid?',
    Language: 'Que idioma prefiere para sus citas y mensajes de seguimiento?',
    ZIP: 'Cual es su codigo postal de 5 digitos en Nueva York para buscar servicios cercanos?',
    Contact: 'Cual es el mejor numero de telefono para enviarle las referencias verificadas?',
  },
  french: {
    Food: 'Au cours des 12 derniers mois, avez-vous craint de manquer de nourriture avant de pouvoir en acheter?',
    Housing: 'Quelle est votre situation de logement actuelle et craignez-vous une expulsion ou un retard de loyer?',
    Utilities: 'Un fournisseur d electricite, de gaz ou d eau vous a-t-il menace de coupure?',
    Transportation: 'Le manque de transport vous a-t-il empeche d aller a vos rendez-vous medicaux?',
    'Interpersonal safety': 'Vous sentez-vous en securite chez vous, sans violence ni menace?',
    Benefits: 'Souhaitez-vous de l aide pour verifier votre admissibilite a SNAP ou aux aides financieres?',
    Insurance: 'Avez-vous une assurance sante active ou souhaitez-vous verifier votre couverture Medicaid?',
    Language: 'Quelle langue preferez-vous parler et lire pour vos soins et suivis?',
    ZIP: 'Quel est votre code postal a 5 chiffres a New York pour trouver des services proches?',
    Contact: 'Quel est le meilleur numero de telephone pour vous joindre?',
  },
  'haitian creole': {
    Food: 'Nan 12 denye mwa yo, eske ou te pe manje ap fini anvan ou gen lajan pou achte anko?',
    Housing: 'Ki jan sitiyasyon lojman ou ye jodi a, epi eske ou gen difikilte ak lwaye?',
    Utilities: 'Eske konpayi limye, gaz, oswa dlo voye avi pou koupe sevis ou?',
    Transportation: 'Eske mank transpo anpeche ou ale nan randevou dokte oswa fe komisyon manje?',
    'Interpersonal safety': 'Eske ou santi ou an sekirite lakay ou, san pesonn pa fe ou mal oswa menase ou?',
    Benefits: 'Eske ou bezwen ed pou aplike pou SNAP oswa lot ed nan men leta?',
    Insurance: 'Eske ou gen asirans sante aktif kounye a oswa ou bezwen verifye Medicaid ou?',
    Language: 'Ki lang ou pito pale ak li pou randevou ak mesaj yo?',
    ZIP: 'Ki kod postal 5 chif ou nan New York pou nou jwenn sevis ki pre ou?',
    Contact: 'Ki pi bon nimewo telefon pou nou kontakte ou ak enfomasyon sevis yo?',
  },
  russian: {
    Food: 'Беспокоились ли вы в последние 12 месяцев, что еда закончится раньше, чем появятся деньги?',
    Housing: 'Какова ваша жилищная ситуация сейчас и есть ли риск выселения или долга за аренду?',
    Utilities: 'Получали ли вы уведомление об отключении электричества, газа, воды или отопления?',
    Transportation: 'Мешало ли отсутствие транспорта посещать врача или добираться за продуктами?',
    'Interpersonal safety': 'Чувствуете ли вы себя в безопасности дома и в повседневной жизни?',
    Benefits: 'Нужна ли вам помощь с оформлением SNAP или других социальных пособий?',
    Insurance: 'Есть ли у вас действующая медицинская страховка или нужно подтвердить Medicaid?',
    Language: 'Какой язык вы предпочитаете для общения с врачом и получения сообщений?',
    ZIP: 'Какой у вас пятизначный почтовый индекс в Нью-Йорке для подбора ближайших служб?',
    Contact: 'Какой номер телефона лучше использовать для связи с вами?',
  },
  chinese: {
    Food: '过去12个月内，您是否担心过在有钱购买之前家里的食物会吃完？',
    Housing: '您目前的住房情况如何，是否担心房租拖欠或失去住房？',
    Utilities: '水、电、煤气或暖气公司是否发出过停供通知？',
    Transportation: '交通不便是否曾导致您无法按时就医或购买日常食物？',
    'Interpersonal safety': '您在家中及日常生活中是否感到安全，是否受到过伤害或威胁？',
    Benefits: '您是否需要协助申请或核查 SNAP 粮食券或其他政府补助？',
    Insurance: '您目前是否有有效的医疗保险，或需要核实 Medicaid 参保状态？',
    Language: '您在就诊和后续联系中最希望使用哪种语言？',
    ZIP: '您居住在纽约的哪一个5位数邮政编码区域，以便我们匹配附近服务？',
    Contact: '联系您发送转介信息最方便的电话号码是多少？',
  },
};

function normalizeLangKey(language: string): string {
  const lower = (language || '').trim().toLowerCase();
  if (lower.includes('spanish') || lower.includes('espanol')) return 'spanish';
  if (lower.includes('french') || lower.includes('francais')) return 'french';
  if (lower.includes('haitian') || lower.includes('creole') || lower.includes('kreyol')) {
    return 'haitian creole';
  }
  if (lower.includes('russian')) return 'russian';
  if (lower.includes('chinese') || lower.includes('mandarin') || lower.includes('cantonese')) {
    return 'chinese';
  }
  return 'english';
}

export function buildAskPromptForDomain(
  domain: SdohDomainKey,
  language: string
): MissingQuestionPrompt {
  const langKey = normalizeLangKey(language);
  const langMap = TRANSLATED_QUESTIONS[langKey] || ENGLISH_QUESTIONS;
  const targetLangDisplay =
    language && language.toLowerCase() !== 'unknown' ? language : 'English';
  return {
    domain,
    englishQuestion: ENGLISH_QUESTIONS[domain],
    translatedQuestion: langMap[domain] || ENGLISH_QUESTIONS[domain],
    targetLanguage: targetLangDisplay,
  };
}

export function derivePatientChart(record: PatientRecord, recordIndex: number = 0): DerivedPatientChart {
  const { intake } = record.result;
  const constraintsLower = intake.constraints.map((c) => c.toLowerCase());
  const unclearLower = intake.unclear.map((u) => u.toLowerCase());
  const allQuotesLower = intake.needs.map((n) => `${n.summary} ${n.evidence_quote}`.toLowerCase());

  const findNeed = (domain: IntakeNeed['domain']) =>
    intake.needs.find((n) => n.domain === domain);

  const noNeedsExplicit = unclearLower.concat(constraintsLower).some((s) =>
    s.includes('no needs reported') || s.includes('doing well')
  );

  const insuranceConstraint = intake.constraints.find((c) =>
    /medicaid|medicare|insurance|uninsured|healthfirst|metroplus|fidelis|emblem|essential plan|managed care/i.test(c)
  );
  const insurance =
    record.insurance ||
    insuranceConstraint ||
    'Unconfirmed';
  const insuranceUnconfirmed =
    /unconfirmed|uninsured|not asked/i.test(insurance) || !insuranceConstraint;

  const phoneMatch =
    record.phone ||
    intake.constraints.join(' ').match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0] ||
    'Not listed';

  const borough = inferBoroughFromZip(intake.zip, record.borough || intake.borough);
  const age = record.age || 'Age not stated';
  const sex = record.sex || 'Sex not stated';
  const mrn = record.mrn || formatSyntheticMrn(record.id, recordIndex);
  const pcp = record.pcp || 'Not on file';

  const lastUpdatedStr = new Date(record.lastIntakeIso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const makeAsk = (domain: SdohDomainKey) => buildAskPromptForDomain(domain, intake.language);

  const sdohRows: SdohDomainRow[] = [];

  // 1. Food
  const foodNeed = findNeed('food');
  if (foodNeed) {
    sdohRows.push({
      domain: 'Food',
      categoryLabel: 'AHC HRSN',
      status: 'Positive',
      answer: foodNeed.summary,
      evidence: foodNeed.evidence_quote || foodNeed.summary,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (noNeedsExplicit) {
    sdohRows.push({
      domain: 'Food',
      categoryLabel: 'AHC HRSN',
      status: 'Negative',
      answer: 'No food insecurity reported',
      evidence: 'Intake states no needs reported today.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Food',
      categoryLabel: 'AHC HRSN',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Food'),
    });
  }

  // 2. Housing (STRICT: crossed-out or conflicting rent help MUST be Unclear, NEVER Negative)
  const housingNeed = findNeed('housing');
  const housingUnclearItem = intake.unclear.find((u) =>
    /(rent|housing|eviction|shelter|landlord|lease)/i.test(u)
  );
  const housingExplicitNegative = constraintsLower.some((c) =>
    /stable housing|no housing problem|housing ok confirmed/i.test(c)
  );

  if (housingNeed) {
    sdohRows.push({
      domain: 'Housing',
      categoryLabel: 'AHC HRSN',
      status: 'Positive',
      answer: housingNeed.summary,
      evidence: housingNeed.evidence_quote || housingNeed.summary,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (housingUnclearItem) {
    sdohRows.push({
      domain: 'Housing',
      categoryLabel: 'AHC HRSN',
      status: 'Unclear',
      answer: 'Crossed out or conflicting rent note; confirm with patient',
      evidence: housingUnclearItem,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Housing'),
    });
  } else if (noNeedsExplicit || housingExplicitNegative) {
    sdohRows.push({
      domain: 'Housing',
      categoryLabel: 'AHC HRSN',
      status: 'Negative',
      answer: 'No housing instability reported',
      evidence: 'Intake explicitly states no housing need.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Housing',
      categoryLabel: 'AHC HRSN',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Housing'),
    });
  }

  // 3. Utilities
  const utilNeed = findNeed('utilities');
  if (utilNeed) {
    sdohRows.push({
      domain: 'Utilities',
      categoryLabel: 'AHC HRSN',
      status: 'Positive',
      answer: utilNeed.summary,
      evidence: utilNeed.evidence_quote || utilNeed.summary,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (noNeedsExplicit) {
    sdohRows.push({
      domain: 'Utilities',
      categoryLabel: 'AHC HRSN',
      status: 'Negative',
      answer: 'No shutoff threat or utility gap',
      evidence: 'Intake states no needs reported today.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Utilities',
      categoryLabel: 'AHC HRSN',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Utilities'),
    });
  }

  // 4. Transportation
  const transportNeed = findNeed('transport');
  if (transportNeed) {
    sdohRows.push({
      domain: 'Transportation',
      categoryLabel: 'AHC HRSN',
      status: 'Positive',
      answer: transportNeed.summary,
      evidence: transportNeed.evidence_quote || transportNeed.summary,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (noNeedsExplicit) {
    sdohRows.push({
      domain: 'Transportation',
      categoryLabel: 'AHC HRSN',
      status: 'Negative',
      answer: 'No transportation barrier reported',
      evidence: 'Intake states no needs reported today.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Transportation',
      categoryLabel: 'AHC HRSN',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Transportation'),
    });
  }

  // 5. Interpersonal safety
  const safetyQuoteSource =
    allQuotesLower.find((q) => /unsafe|abuse|violence|hit|threat|afraid|safety|assault/i.test(q)) ||
    constraintsLower.find((c) => /unsafe|abuse|violence|safety/i.test(c));
  if (safetyQuoteSource) {
    sdohRows.push({
      domain: 'Interpersonal safety',
      categoryLabel: 'AHC HRSN',
      status: 'Positive',
      answer: 'Safety concern noted during intake',
      evidence: safetyQuoteSource,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (constraintsLower.some((c) => /safe at home|feels safe/i.test(c))) {
    sdohRows.push({
      domain: 'Interpersonal safety',
      categoryLabel: 'AHC HRSN',
      status: 'Negative',
      answer: 'Confirmed safe at home',
      evidence: 'Safe at home documented in intake.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Interpersonal safety',
      categoryLabel: 'AHC HRSN',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Interpersonal safety'),
    });
  }

  // 6. Benefits
  const benefitsNeed = findNeed('benefits');
  if (benefitsNeed) {
    sdohRows.push({
      domain: 'Benefits',
      categoryLabel: 'Income & Entitlements',
      status: 'Positive',
      answer: benefitsNeed.summary,
      evidence: benefitsNeed.evidence_quote || benefitsNeed.summary,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (noNeedsExplicit) {
    sdohRows.push({
      domain: 'Benefits',
      categoryLabel: 'Income & Entitlements',
      status: 'Negative',
      answer: 'No benefits enrollment gap',
      evidence: 'Intake states no needs reported today.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Benefits',
      categoryLabel: 'Income & Entitlements',
      status: 'Not asked',
      answer: 'Not screened',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Benefits'),
    });
  }

  // 7. Insurance
  if (insuranceConstraint) {
    const isNeedsVerify = /unconfirmed|uninsured|no insurance/i.test(insuranceConstraint);
    sdohRows.push({
      domain: 'Insurance',
      categoryLabel: 'Coverage',
      status: isNeedsVerify ? 'Unclear' : 'Negative',
      answer: isNeedsVerify ? insuranceConstraint : `Active: ${insuranceConstraint}`,
      evidence: insuranceConstraint,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: isNeedsVerify ? makeAsk('Insurance') : undefined,
    });
  } else if (record.insurance && !/not asked/i.test(record.insurance)) {
    const isNeedsVerify = /unconfirmed|uninsured|no insurance/i.test(record.insurance);
    sdohRows.push({
      domain: 'Insurance',
      categoryLabel: 'Coverage',
      status: isNeedsVerify ? 'Unclear' : 'Negative',
      answer: record.insurance,
      evidence: record.insurance,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: isNeedsVerify ? makeAsk('Insurance') : undefined,
    });
  } else {
    sdohRows.push({
      domain: 'Insurance',
      categoryLabel: 'Coverage',
      status: 'Not asked',
      answer: 'Insurance status not confirmed',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Insurance'),
    });
  }

  // 8. Language (Attribute ONLY, never Positive or Negative)
  const rawLang = (intake.language || '').trim();
  const hasKnownLang = Boolean(rawLang) && rawLang.toLowerCase() !== 'unknown';
  const interpreterNeeded = hasKnownLang && rawLang.toLowerCase() !== 'english';
  const preferredLanguageDisplay = hasKnownLang
    ? interpreterNeeded
      ? `${rawLang}, interpreter needed`
      : `${rawLang}, no interpreter needed`
    : 'Language not documented';

  if (hasKnownLang) {
    sdohRows.push({
      domain: 'Language',
      categoryLabel: 'Patient Attribute',
      status: 'Attribute',
      answer: preferredLanguageDisplay,
      evidence:
        intake.constraints.find((c) => /prefer|parle|lang|spanish|french|russian|chinese|creole/i.test(c)) ||
        `Intake documented language: ${rawLang}`,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Language',
      categoryLabel: 'Patient Attribute',
      status: 'Not asked',
      answer: 'Not documented',
      evidence: 'Preferred language unclear or absent.',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Language'),
    });
  }

  // 9. ZIP
  const zipUnclearItem = intake.unclear.find((u) => /zip|104\?|incomplete/i.test(u));
  if (/^\d{5}$/.test(intake.zip || '')) {
    sdohRows.push({
      domain: 'ZIP',
      categoryLabel: 'Intake Profile',
      status: 'Documented',
      answer: `${intake.zip}${borough !== 'NYC' ? ` (${borough})` : ''}`,
      evidence: `ZIP ${intake.zip} documented in intake`,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else if (zipUnclearItem) {
    sdohRows.push({
      domain: 'ZIP',
      categoryLabel: 'Intake Profile',
      status: 'Unclear',
      answer: 'Incomplete or smudged ZIP code',
      evidence: zipUnclearItem,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('ZIP'),
    });
  } else {
    sdohRows.push({
      domain: 'ZIP',
      categoryLabel: 'Intake Profile',
      status: 'Not asked',
      answer: '5-digit ZIP missing',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('ZIP'),
    });
  }

  // 10. Contact
  if (phoneMatch && phoneMatch !== 'Not listed') {
    sdohRows.push({
      domain: 'Contact',
      categoryLabel: 'Intake Profile',
      status: 'Documented',
      answer: phoneMatch,
      evidence: `Callback number recorded: ${phoneMatch}`,
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
    });
  } else {
    sdohRows.push({
      domain: 'Contact',
      categoryLabel: 'Intake Profile',
      status: 'Not asked',
      answer: 'Phone not documented',
      evidence: 'None documented',
      source: record.inputMode,
      lastUpdated: lastUpdatedStr,
      askPrompt: makeAsk('Contact'),
    });
  }

  const unclearCount = sdohRows.filter((r) => r.status === 'Unclear').length;
  const notAskedCount = sdohRows.filter((r) => r.status === 'Not asked').length;
  const completeCount = sdohRows.length - unclearCount - notAskedCount;
  const completenessSummary = `${completeCount} of ${sdohRows.length} complete, ${unclearCount} unclear, ${notAskedCount} not asked`;

  const missingDomains = sdohRows
    .filter((r) => r.status === 'Not asked' || r.status === 'Unclear')
    .map((r) => r.domain);

  const askQuestions: MissingQuestionPrompt[] = sdohRows
    .filter((r): r is SdohDomainRow & { askPrompt: MissingQuestionPrompt } => Boolean(r.askPrompt))
    .map((r) => r.askPrompt);

  const urgency3Needs = intake.needs.filter((n) => n.urgency === 3);
  const safetyConcern =
    Boolean(safetyQuoteSource) ||
    intake.medical_advice_requested ||
    intake.prompt_injection_detected ||
    intake.multiple_patients;
  const missingInfo = unclearCount > 0 || notAskedCount > 0 || insuranceUnconfirmed;

  const alerts: ChartAlertItem[] = [];
  if (urgency3Needs.length > 0) {
    alerts.push({
      id: 'alert-urgent-needs',
      severity: 'urgent',
      title: `URGENT NEED (${urgency3Needs.length})`,
      detail: urgency3Needs.map((n) => `${n.domain.toUpperCase()}: ${n.summary}`).join(' | '),
    });
  }
  if (unclearCount > 0) {
    const unclearRows = sdohRows.filter((r) => r.status === 'Unclear');
    alerts.push({
      id: 'alert-unclear-sdoh',
      severity: 'warning',
      title: 'UNCLEAR / CONFLICTING INTAKE',
      detail: unclearRows.map((r) => `${r.domain}: ${r.evidence}`).join(' | '),
    });
  }
  if (insuranceUnconfirmed) {
    alerts.push({
      id: 'alert-insurance',
      severity: 'warning',
      title: 'INSURANCE UNCONFIRMED',
      detail: `${insurance}. Verify eligibility or sliding-scale clinic acceptance before visit.`,
    });
  }
  if (notAskedCount > 0) {
    const notAskedList = sdohRows
      .filter((r) => r.status === 'Not asked')
      .map((r) => r.domain)
      .join(', ');
    alerts.push({
      id: 'alert-missing-sdoh',
      severity: 'warning',
      title: `INCOMPLETE SDOH (${notAskedCount} NOT ASKED)`,
      detail: `Missing screening: ${notAskedList}. Use "Ask patient" on the SDOH tab to include questions in Outreach.`,
    });
  }
  if (intake.medical_advice_requested) {
    alerts.push({
      id: 'alert-clinical-escalation',
      severity: 'urgent',
      title: 'CLINICAL ESCALATION',
      detail: 'Patient requested medication or dosing advice; do not advise. Route to licensed clinician.',
    });
  }

  return {
    mrn,
    age,
    sex,
    phone: phoneMatch,
    borough,
    insurance,
    insuranceUnconfirmed,
    pcp,
    preferredLanguageDisplay,
    interpreterNeeded,
    urgency3Needs,
    safetyConcern,
    missingInfo,
    sdohRows,
    completeCount,
    unclearCount,
    notAskedCount,
    totalCount: sdohRows.length,
    completenessSummary,
    missingDomains,
    askQuestions,
    alerts,
  };
}

export function buildTimelineForIntake(
  result: PipelineResult,
  mode: InputMode,
  timestampIso: string
): PatientTimelineEvent[] {
  const modeLabel = mode === 'photo' ? 'Handwritten form photo' : mode === 'voice' ? 'Voice note' : 'Text intake';
  const verifiedCount = result.verifiedReferrals.filter(
    (r) => r.verification_outcome === 'verified' || (r.verified && !r.not_verified_live && r.verification_outcome !== 'call_to_confirm')
  ).length;
  const callCount = result.verifiedReferrals.filter(
    (r) => r.verification_outcome === 'call_to_confirm' || r.not_verified_live
  ).length;

  const events: PatientTimelineEvent[] = [
    {
      id: `tl-intake-${Date.now()}`,
      type: 'intake',
      title: `${modeLabel} extracted by Gemini 4 Hydrogen`,
      detail: `Extracted ${result.intake.needs.length} need(s), language ${result.intake.language || 'English'}, ZIP ${result.intake.zip || 'Not stated'}.`,
      timestampIso,
    },
    {
      id: `tl-check-${Date.now()}`,
      type: 'self_check',
      title: 'Evidence-based referral verification',
      detail: `${verifiedCount} Verified, ${callCount} Call to confirm, ${result.rejectedReferrals.length} rejected by self-check.`,
      timestampIso,
    },
  ];

  if (result.outreachDraft) {
    events.push({
      id: `tl-outreach-${Date.now()}`,
      type: 'outreach_drafted',
      title: `Outreach drafted in ${result.intake.language || 'English'}`,
      detail: 'Waiting for CHW approval before sending.',
      timestampIso,
    });
  }

  return events;
}

export function createSamplePatients(): PatientRecord[] {
  const now = Date.now();
  const c01Time = new Date(now - 35 * 60 * 1000).toISOString();

  const mariaRecord: PatientRecord = {
    id: 'sample-patient-c01',
    mrn: 'SYN-0001',
    name: 'Maria R.',
    age: '34 y/o',
    sex: 'F',
    phone: '(347) 555-0142',
    borough: 'Bronx',
    insurance: 'Medicaid (unconfirmed)',
    pcp: 'Not on file',
    isSample: true,
    inputMode: 'text',
    lastIntakeIso: c01Time,
    acknowledgedAlertIds: [],
    result: DEMO_C01_RESULT,
    timeline: buildTimelineForIntake(DEMO_C01_RESULT, 'text', c01Time),
  };

  return [mariaRecord];
}

export function createSampleFollowUpTasks(): Array<{
  id: string;
  bucket: 'Overdue' | 'Today' | 'Tomorrow';
  patientFirstName: string;
  referralName: string;
  referralAddress: string;
  referralHours: string;
  referralUrl: string;
  language: string;
  constraints: string[];
  taskLabel: string;
}> {
  return [
    {
      id: 'sample-fu-1',
      bucket: 'Today',
      patientFirstName: 'Maria R.',
      referralName: 'New York Common Pantry, Choice Pantry (Bronx)',
      referralAddress: '1290 Hoe Ave, Bronx, NY 10459',
      referralHours: 'Thu to Sat, 10:00 AM to 2:00 PM',
      referralUrl: 'https://nycommonpantry.org/programs/nourish/',
      language: 'Spanish',
      constraints: ['Works weekdays until 4:00 PM; available Saturdays'],
      taskLabel: 'Confirm Saturday pantry hours & send Spanish check-in',
    },
    {
      id: 'sample-fu-2',
      bucket: 'Tomorrow',
      patientFirstName: 'Maria R.',
      referralName: 'Con Edison Payment & Bill Assistance',
      referralAddress: 'Online / Phone Support',
      referralHours: 'Mon to Fri 8:00 AM to 7:00 PM',
      referralUrl: 'https://www.coned.com/en/accounts-billing/payment-plans-assistance/help-paying-your-bill',
      language: 'Spanish',
      constraints: ['ConEd shutoff notice next week'],
      taskLabel: 'Confirm shutoff hold and payment agreement status',
    },
  ];
}
