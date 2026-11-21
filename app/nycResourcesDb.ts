import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  IntakeExtraction,
  IntakeNeed,
  NeedDomain,
  NycDatasetSummary,
  NycResourceRecord,
  ReferralItem,
  StressErrorType,
} from './src/types.ts';

const SNAPSHOT_FILE = path.resolve(process.cwd(), 'data', 'nyc_resources.json');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 5000;
const FETCH_TIMEOUT_MS = 25_000;

interface SnapshotPayload {
  schemaVersion: number;
  fetchedAtIso: string;
  snapshotDate: string;
  datasets: NycDatasetSummary[];
  records: NycResourceRecord[];
}

interface ZipCenter {
  lat: number;
  lng: number;
  count: number;
}

const FACSUBGRP_TO_DOMAIN: Record<string, { domain: NeedDomain; subtypeOverride?: string }> = {
  'SOUP KITCHENS AND FOOD PANTRIES': { domain: 'food' },
  'CHILD NUTRITION': { domain: 'food', subtypeOverride: 'Child meal site' },
  'HOSPITALS AND CLINICS': { domain: 'clinic' },
  'OTHER HEALTH CARE': { domain: 'clinic' },
  'MENTAL HEALTH': { domain: 'clinic', subtypeOverride: 'Behavioral health' },
  'SUBSTANCE USE DISORDER TREATMENT PROGRAMS': {
    domain: 'clinic',
    subtypeOverride: 'Behavioral health',
  },
  'NON-RESIDENTIAL HOUSING AND HOMELESS SERVICES': { domain: 'housing' },
  'FINANCIAL ASSISTANCE AND SOCIAL SERVICES': { domain: 'benefits' },
  'IMMIGRANT SERVICES': { domain: 'benefits' },
  'LEGAL AND INTERVENTION SERVICES': { domain: 'benefits' },
  'SENIOR SERVICES': { domain: 'other' },
  'PROGRAMS FOR PEOPLE WITH DISABILITIES': { domain: 'other' },
  'COMMUNITY CENTERS AND COMMUNITY PROGRAMS': { domain: 'other' },
  'WORKFORCE DEVELOPMENT': { domain: 'other' },
  'ADULT AND IMMIGRANT LITERACY': { domain: 'other' },
};

const DATASET_DEFS = [
  {
    id: 'ji82-xba5',
    name: 'Facilities Database',
    sourceUrl: 'https://data.cityofnewyork.us/d/ji82-xba5',
  },
  {
    id: 'tc6u-8rnp',
    name: 'Directory of SNAP Centers',
    sourceUrl: 'https://data.cityofnewyork.us/d/tc6u-8rnp',
  },
  {
    id: '9d9t-bmk7',
    name: 'Directory of Benefits Access Centers',
    sourceUrl: 'https://data.cityofnewyork.us/d/9d9t-bmk7',
  },
  {
    id: 'ntcm-2w4k',
    name: 'Directory of Homebase Locations',
    sourceUrl: 'https://data.cityofnewyork.us/d/ntcm-2w4k',
  },
  {
    id: 'gfej-by6h',
    name: 'Health Insurance Enrollment',
    sourceUrl: 'https://data.cityofnewyork.us/d/gfej-by6h',
  },
] as const;

let cachedRecords: NycResourceRecord[] = [];
let cachedDatasets: NycDatasetSummary[] = [];
let cachedSnapshotDate = '';
let cachedFetchedAtIso = '';
let cachedZipCenters = new Map<string, ZipCenter>();
let cachedBoroughCenters = new Map<string, ZipCenter>();
let cachedDomainCounts: Record<NeedDomain, number> = {
  food: 0,
  housing: 0,
  utilities: 0,
  clinic: 0,
  transport: 0,
  benefits: 0,
  other: 0,
};
let loadPromise: Promise<void> | null = null;
let refreshInProgress = false;

function cleanText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const UPPERCASE_ACRONYMS = new Set([
  'NYC',
  'NY',
  'USA',
  'US',
  'HRA',
  'DHS',
  'DOHMH',
  'DOH',
  'DSS',
  'SNAP',
  'WIC',
  'FQHC',
  'SDA',
  'YMCA',
  'YWCA',
  'JCC',
  'CUNY',
  'SUNY',
  'HIV',
  'AIDS',
  'LGBTQ',
  'LGBT',
  'VA',
  'ID',
  'LLC',
  'PC',
  'MD',
  'RN',
  'DO',
  'PS',
  'IS',
  'MS',
  'HS',
  'II',
  'III',
  'IV',
  'VI',
  'NE',
  'NW',
  'SE',
  'SW',
  'CHN',
  'UHP',
  'HHC',
  'HEAP',
  'SSI',
  'SSD',
  'EBT',
  'GED',
  'ESL',
  'OBGYN',
  'AME',
  'COGIC',
  'BVM',
  'CCBQ',
  'CAMBA',
  'RISE',
  'CBO',
  'OMH',
  'OASAS',
  'PATHHSEO',
]);

const LOWERCASE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'de',
  'del',
  'el',
  'en',
  'for',
  'in',
  'la',
  'las',
  'los',
  'of',
  'on',
  'or',
  'the',
  'to',
  'y',
]);

const CHURCH_PANTRY_RE =
  /\b(church|parish|ministry|ministries|tabernacle|cathedral|chapel|baptist|methodist|lutheran|episcopal|presbyterian|pentecostal|adventist|sda|iglesia|templo|temple|mosque|synagogue|congregation|gospel|fellowship|assembly of god)\b/i;

const ALREADY_FOOD_LABEL_RE =
  /\b(food pantry|pantry|soup kitchen|food bank|food program|community kitchen)\b/i;

function isMostlyUppercase(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g);
  if (!letters || letters.length < 3) return false;
  const upperCount = letters.filter((ch) => ch >= 'A' && ch <= 'Z').length;
  return upperCount / letters.length >= 0.72;
}

function titleCaseToken(token: string, isBoundary: boolean): string {
  if (!token) return token;

  // Handle slash or hyphen compound tokens recursively
  if (token.includes('/') && token.length > 1) {
    return token
      .split('/')
      .map((part) => titleCaseToken(part, true))
      .join('/');
  }
  if (token.includes('-') && token.length > 1) {
    return token
      .split('-')
      .map((part, idx) => titleCaseToken(part, idx === 0))
      .join('-');
  }

  const m = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9'.&]+)([^A-Za-z0-9]*)$/);
  if (!m) return token;
  const [, lead, core, trail] = m;

  // Ordinals like 1ST, 2ND, 3RD, 163RD
  const ordMatch = core.match(/^(\d+)(ST|ND|RD|TH)$/i);
  if (ordMatch) {
    return `${lead}${ordMatch[1]}${ordMatch[2].toLowerCase()}${trail}`;
  }

  const strippedAlpha = core.replace(/\./g, '').toUpperCase();
  if (strippedAlpha === 'SVCS') {
    return `${lead}Services${trail}`;
  }
  if (strippedAlpha === 'SVC') {
    return `${lead}Service${trail}`;
  }
  if (strippedAlpha === 'CTR') {
    return `${lead}Center${trail}`;
  }
  if (UPPERCASE_ACRONYMS.has(strippedAlpha)) {
    return `${lead}${core.toUpperCase()}${trail}`;
  }

  const lower = core.toLowerCase();
  if (!isBoundary && LOWERCASE_SMALL_WORDS.has(lower)) {
    return `${lead}${lower}${trail}`;
  }

  // Handle apostrophes (e.g. ST. MARY'S, CHILDREN'S, O'CONNOR)
  if (lower.includes("'")) {
    const parts = lower.split("'");
    const formatted = parts
      .map((p, idx) => {
        if (!p) return '';
        if (idx > 0 && p.length <= 2) return p; // 's, 't, 're
        return p[0].toUpperCase() + p.slice(1);
      })
      .join("'");
    return `${lead}${formatted}${trail}`;
  }

  // Handle Mc prefix (e.g. MCDONALD -> McDonald)
  if (/^mc[a-z]{2,}/.test(lower)) {
    return `${lead}Mc${lower[2].toUpperCase()}${lower.slice(3)}${trail}`;
  }

  return `${lead}${lower[0].toUpperCase()}${lower.slice(1)}${trail}`;
}

export function toSmartTitleCase(raw: string, preserveMiddleInitials: boolean = false): string {
  const cleaned = cleanText(raw);
  if (!cleaned) return '';
  if (!isMostlyUppercase(cleaned)) return cleaned;

  const words = cleaned.split(' ');
  return words
    .map((word, idx) => {
      const prev = idx > 0 ? words[idx - 1] : '';
      const isBoundary =
        idx === 0 ||
        idx === words.length - 1 ||
        /[:\-/(]$/.test(prev) ||
        /^[(]/.test(word) ||
        (preserveMiddleInitials && /^[A-Z]\.?$/.test(word));
      return titleCaseToken(word, isBoundary);
    })
    .join(' ');
}

function dedupeRepeatedNameSegments(raw: string): string {
  const cleaned = cleanText(raw);
  if (!cleaned) return '';

  const normSeg = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();

  // Deduplicate colon or pipe separated segments like "FOO : FOO"
  if (cleaned.includes(':') || cleaned.includes('|')) {
    const parts = cleaned
      .split(/\s*[:|]\s*/)
      .map((p) => cleanText(p))
      .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const part of parts) {
      const key = normSeg(part);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(part);
    }
    if (unique.length > 0) {
      return unique.join(': ');
    }
  }

  // Deduplicate exact "A - A" or "A / A" repetitions
  const dashParts = cleaned.split(/\s+-\s+/).map((p) => cleanText(p)).filter(Boolean);
  if (dashParts.length === 2 && normSeg(dashParts[0]) === normSeg(dashParts[1])) {
    return dashParts[0];
  }

  return cleaned;
}

export function formatNycResourceName(
  rawName: string,
  domain: NeedDomain,
  subtype?: string
): string {
  const deduped = dedupeRepeatedNameSegments(rawName);
  if (!deduped) return '';
  const titled = toSmartTitleCase(deduped);

  const isFoodPantrySite =
    domain === 'food' && !/snap center|child meal/i.test(subtype || '');

  if (
    isFoodPantrySite &&
    CHURCH_PANTRY_RE.test(titled) &&
    !ALREADY_FOOD_LABEL_RE.test(titled)
  ) {
    return `Food pantry at ${titled}`;
  }

  return titled;
}

function cleanZip(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  return '';
}

function normalizeBorough(raw: unknown, zip?: string): string {
  const b = cleanText(raw).toUpperCase();
  if (b === 'MN' || b === 'MANHATTAN' || b === 'NEW YORK') return 'Manhattan';
  if (b === 'BX' || b === 'BRONX' || b === 'THE BRONX') return 'Bronx';
  if (b === 'BK' || b === 'BROOKLYN' || b === 'KINGS') return 'Brooklyn';
  if (b === 'QN' || b === 'QUEENS') return 'Queens';
  if (b === 'SI' || b === 'STATEN ISLAND' || b === 'STATEN IS' || b === 'RICHMOND') {
    return 'Staten Island';
  }
  const z = zip || '';
  if (z.startsWith('104')) return 'Bronx';
  if (z.startsWith('112')) return 'Brooklyn';
  if (z.startsWith('103')) return 'Staten Island';
  if (z.startsWith('100') || z.startsWith('101') || z.startsWith('102')) return 'Manhattan';
  if (/^11[01346]/.test(z)) return 'Queens';
  return b ? b[0] + b.slice(1).toLowerCase() : 'NYC';
}

function parseCoords(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 40.4 || lat > 41.0 || lng < -74.35 || lng > -73.6) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function normalizePhone(raw: unknown): string {
  const text = cleanText(raw);
  if (!text || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'none') return '';
  return text.slice(0, 120);
}

function normalizeWebsite(raw: unknown): string | undefined {
  const text = cleanText(raw);
  if (!text || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'none') return undefined;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function parseLanguages(raw: unknown): string[] {
  const text = cleanText(raw);
  if (!text || /english only|none|n\/a/i.test(text)) return [];
  return text
    .split(/[,;/]+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length > 1 && s.toLowerCase() !== 'other');
}

function parseServiceAreaZips(raw: unknown): string[] {
  const matches = String(raw ?? '').match(/\b\d{5}\b/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function dedupKey(name: string, address: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(name)}|${norm(address)}`;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CareAgents-NYC-CHW/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDatasetUpdatedDate(datasetId: string): Promise<string> {
  try {
    const meta = await fetchJsonWithTimeout<{ rowsUpdatedAt?: number; viewLastModified?: number }>(
      `https://data.cityofnewyork.us/api/views/${datasetId}.json`
    );
    const ts = meta.rowsUpdatedAt || meta.viewLastModified;
    if (ts && Number.isFinite(ts)) {
      return new Date(ts * 1000).toISOString().slice(0, 10);
    }
  } catch {
    // Fallback to current date if metadata endpoint unavailable
  }
  return new Date().toISOString().slice(0, 10);
}

async function fetchPagedSocrataRows(
  datasetId: string,
  extraParams: string = ''
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (true) {
    const query = `?$limit=${PAGE_LIMIT}&$offset=${offset}${extraParams ? `&${extraParams}` : ''}`;
    const url = `https://data.cityofnewyork.us/resource/${datasetId}.json${query}`;
    const batch = await fetchJsonWithTimeout<Array<Record<string, unknown>>>(url);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return all;
}

function buildIndices(records: NycResourceRecord[], datasets: NycDatasetSummary[], fetchedAtIso: string, snapshotDate: string) {
  const zipAcc = new Map<string, { latSum: number; lngSum: number; count: number }>();
  const boroAcc = new Map<string, { latSum: number; lngSum: number; count: number }>();
  const domainCounts: Record<NeedDomain, number> = {
    food: 0,
    housing: 0,
    utilities: 0,
    clinic: 0,
    transport: 0,
    benefits: 0,
    other: 0,
  };

  for (const r of records) {
    r.name = formatNycResourceName(r.name, r.domain, r.subtype);
    if (r.address) {
      r.address = toSmartTitleCase(r.address, true);
    }
    if (r.subtype) {
      r.subtype = toSmartTitleCase(r.subtype);
    }
    if (
      r.source_dataset_id === '9d9t-bmk7' &&
      r.website_url === 'https://www.nyc.gov/site/hra/locations/benefits-access-centers.page'
    ) {
      r.website_url = 'https://www.nyc.gov/site/hra/locations/job-locations-and-service-centers.page';
    }
    domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
    if (r.zip) {
      const prev = zipAcc.get(r.zip) || { latSum: 0, lngSum: 0, count: 0 };
      prev.latSum += r.lat;
      prev.lngSum += r.lng;
      prev.count += 1;
      zipAcc.set(r.zip, prev);
    }
    if (r.borough && r.borough !== 'NYC') {
      const key = r.borough.toLowerCase();
      const prev = boroAcc.get(key) || { latSum: 0, lngSum: 0, count: 0 };
      prev.latSum += r.lat;
      prev.lngSum += r.lng;
      prev.count += 1;
      boroAcc.set(key, prev);
    }
  }

  const zipCenters = new Map<string, ZipCenter>();
  for (const [zip, acc] of zipAcc.entries()) {
    zipCenters.set(zip, {
      lat: acc.latSum / acc.count,
      lng: acc.lngSum / acc.count,
      count: acc.count,
    });
  }

  const boroCenters = new Map<string, ZipCenter>();
  for (const [b, acc] of boroAcc.entries()) {
    boroCenters.set(b, {
      lat: acc.latSum / acc.count,
      lng: acc.lngSum / acc.count,
      count: acc.count,
    });
  }

  cachedRecords = records;
  cachedDatasets = datasets;
  cachedFetchedAtIso = fetchedAtIso;
  cachedSnapshotDate = snapshotDate;
  cachedZipCenters = zipCenters;
  cachedBoroughCenters = boroCenters;
  cachedDomainCounts = domainCounts;
}

async function fetchAndBuildFromNycOpenData(): Promise<SnapshotPayload> {
  const groups = Object.keys(FACSUBGRP_TO_DOMAIN);
  const inClause = groups.map((g) => `'${g}'`).join(',');
  const facWhere = `$where=${encodeURIComponent(`facsubgrp in(${inClause})`)}`;

  const [
    metaDates,
    facRows,
    snapRows,
    benefitsRows,
    homebaseRows,
    insuranceRows,
  ] = await Promise.all([
    Promise.all(DATASET_DEFS.map((d) => fetchDatasetUpdatedDate(d.id))),
    fetchPagedSocrataRows('ji82-xba5', facWhere),
    fetchPagedSocrataRows('tc6u-8rnp'),
    fetchPagedSocrataRows('9d9t-bmk7'),
    fetchPagedSocrataRows('ntcm-2w4k'),
    fetchPagedSocrataRows('gfej-by6h'),
  ]);

  const updatedByDataset = new Map<string, string>();
  DATASET_DEFS.forEach((d, idx) => updatedByDataset.set(d.id, metaDates[idx]));

  const dedupMap = new Map<string, NycResourceRecord>();
  const rawCountsByDataset: Record<string, number> = {
    'ji82-xba5': 0,
    'tc6u-8rnp': 0,
    '9d9t-bmk7': 0,
    'ntcm-2w4k': 0,
    'gfej-by6h': 0,
  };

  const upsertRecord = (rec: NycResourceRecord) => {
    const key = dedupKey(rec.name, rec.address);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, rec);
      rawCountsByDataset[rec.source_dataset_id] =
        (rawCountsByDataset[rec.source_dataset_id] || 0) + 1;
      return;
    }

    // Merge richer attributes & secondary domains without creating duplicate rows
    const mergedDomains = Array.from(new Set([...existing.domains, ...rec.domains]));
    existing.domains = mergedDomains;
    if (!existing.phone && rec.phone) existing.phone = rec.phone;
    if (!existing.hours && rec.hours) existing.hours = rec.hours;
    if (existing.languages.length === 0 && rec.languages.length > 0) {
      existing.languages = rec.languages;
    }
    if (!existing.website_url && rec.website_url) existing.website_url = rec.website_url;
    if (rec.service_area_zips?.length) {
      existing.service_area_zips = Array.from(
        new Set([...(existing.service_area_zips || []), ...rec.service_area_zips])
      );
    }
  };

  // 1. Facilities Database ji82-xba5
  const facUpdated = updatedByDataset.get('ji82-xba5') || new Date().toISOString().slice(0, 10);
  for (const row of facRows) {
    const facsubgrp = cleanText(row.facsubgrp).toUpperCase();
    const mapping = FACSUBGRP_TO_DOMAIN[facsubgrp];
    if (!mapping) continue;

    const name = cleanText(row.facname);
    const address = cleanText(row.address);
    const coords = parseCoords(row.latitude, row.longitude);
    if (!name || !address || !coords) continue;

    const zip = cleanZip(row.zipcode);
    const borough = normalizeBorough(row.boro || row.city, zip);
    const factype = cleanText(row.factype);
    const subtype = toSmartTitleCase(
      mapping.subtypeOverride
        ? factype && !mapping.subtypeOverride.toLowerCase().includes(factype.toLowerCase())
          ? `${mapping.subtypeOverride} (${factype})`
          : mapping.subtypeOverride
        : factype || facsubgrp
    );

    upsertRecord({
      id: `ji82-${cleanText(row.uid) || dedupMap.size + 1}`,
      name: formatNycResourceName(name, mapping.domain, subtype),
      domain: mapping.domain,
      domains: [mapping.domain],
      subtype,
      address: toSmartTitleCase(address, true),
      zip,
      borough,
      lat: coords.lat,
      lng: coords.lng,
      phone: '',
      hours: '',
      languages: [],
      operator: cleanText(row.opname),
      agency: cleanText(row.overagency),
      source_dataset_id: 'ji82-xba5',
      source_dataset_name: 'Facilities Database',
      source_url: 'https://data.cityofnewyork.us/d/ji82-xba5',
      dataset_updated: facUpdated,
    });
  }

  // 2. Directory of SNAP Centers tc6u-8rnp -> food and benefits
  const snapUpdated = updatedByDataset.get('tc6u-8rnp') || new Date().toISOString().slice(0, 10);
  snapRows.forEach((row, idx) => {
    const name = cleanText(row.facility_name);
    const address = cleanText(row.street_address);
    const coords = parseCoords(row.latitude, row.longitude);
    if (!name || !address || !coords) return;

    const zip = cleanZip(row.zip_code);
    const borough = normalizeBorough(row.borough, zip);
    upsertRecord({
      id: `tc6u-${idx + 1}`,
      name,
      domain: 'food',
      domains: ['food', 'benefits'],
      subtype: 'SNAP Center',
      address,
      zip,
      borough,
      lat: coords.lat,
      lng: coords.lng,
      phone: '718-557-1399',
      hours: cleanText(row.comments),
      languages: [],
      operator: 'NYC Human Resources Administration',
      agency: 'HRA / DSS',
      source_dataset_id: 'tc6u-8rnp',
      source_dataset_name: 'Directory of SNAP Centers',
      source_url: 'https://data.cityofnewyork.us/d/tc6u-8rnp',
      website_url: 'https://www.nyc.gov/site/hra/locations/snap-locations.page',
      dataset_updated: snapUpdated,
    });
  });

  // 3. Directory of Benefits Access Centers 9d9t-bmk7 -> benefits
  const bacUpdated = updatedByDataset.get('9d9t-bmk7') || new Date().toISOString().slice(0, 10);
  benefitsRows.forEach((row, idx) => {
    const name = cleanText(row.facility_name);
    const address = cleanText(row.street_address);
    const coords = parseCoords(row.latitude, row.longitude);
    if (!name || !address || !coords) return;

    const zip = cleanZip(row.zip_code);
    const borough = normalizeBorough(row.borough, zip);
    upsertRecord({
      id: `9d9t-${idx + 1}`,
      name,
      domain: 'benefits',
      domains: ['benefits'],
      subtype: 'Benefits Access Center',
      address,
      zip,
      borough,
      lat: coords.lat,
      lng: coords.lng,
      phone: normalizePhone(row.phone_number_s),
      hours: cleanText(row.comments),
      languages: [],
      operator: 'NYC Human Resources Administration',
      agency: 'HRA / DSS',
      source_dataset_id: '9d9t-bmk7',
      source_dataset_name: 'Directory of Benefits Access Centers',
      source_url: 'https://data.cityofnewyork.us/d/9d9t-bmk7',
      website_url: 'https://www.nyc.gov/site/hra/locations/job-locations-and-service-centers.page',
      dataset_updated: bacUpdated,
    });
  });

  // 4. Directory of Homebase Locations ntcm-2w4k -> housing
  const hbUpdated = updatedByDataset.get('ntcm-2w4k') || new Date().toISOString().slice(0, 10);
  homebaseRows.forEach((row, idx) => {
    const name = cleanText(row.homebase_office);
    const address = cleanText(row.address);
    const coords = parseCoords(row.latitude, row.longitude);
    if (!name || !address || !coords) return;

    const zip = cleanZip(row.postcode);
    const borough = normalizeBorough(row.borough, zip);
    const displayName = name.toLowerCase().includes('homebase')
      ? name
      : `Homebase - ${name}`;

    upsertRecord({
      id: `ntcm-${idx + 1}`,
      name: displayName,
      domain: 'housing',
      domains: ['housing'],
      subtype: 'Homebase Homelessness Prevention',
      address,
      zip,
      borough,
      lat: coords.lat,
      lng: coords.lng,
      phone: normalizePhone(row.phone_number),
      hours: '',
      languages: [],
      operator: name,
      agency: 'NYC Department of Social Services / DHS',
      source_dataset_id: 'ntcm-2w4k',
      source_dataset_name: 'Directory of Homebase Locations',
      source_url: 'https://data.cityofnewyork.us/d/ntcm-2w4k',
      website_url: 'https://www.nyc.gov/site/hra/help/homebase.page',
      dataset_updated: hbUpdated,
      service_area_zips: parseServiceAreaZips(row.service_area_zip_code),
    });
  });

  // 5. Health Insurance Enrollment gfej-by6h -> benefits and clinic
  const insUpdated = updatedByDataset.get('gfej-by6h') || new Date().toISOString().slice(0, 10);
  insuranceRows.forEach((row, idx) => {
    const name = cleanText(row.health_center);
    const address = cleanText(row.street_address);
    const coords = parseCoords(row.latitude, row.longitude);
    if (!name || !address || !coords) return;

    const zip = cleanZip(row.zip_code);
    const borough = normalizeBorough(row.borough, zip);
    const days = cleanText(row.days_of_operation);
    const hrs = cleanText(row.hours_of_operation);
    const combinedHours = [days, hrs].filter(Boolean).join(' ');

    upsertRecord({
      id: `gfej-${idx + 1}`,
      name,
      domain: 'benefits',
      domains: ['benefits', 'clinic'],
      subtype: 'Health Insurance Enrollment',
      address,
      zip,
      borough,
      lat: coords.lat,
      lng: coords.lng,
      phone: normalizePhone(row.telephone_number),
      hours: combinedHours,
      languages: parseLanguages(row.languages_other_than_english),
      operator: name,
      agency: 'NYC DOHMH Equitable Health Systems',
      source_dataset_id: 'gfej-by6h',
      source_dataset_name: 'Health Insurance Enrollment',
      source_url: 'https://data.cityofnewyork.us/d/gfej-by6h',
      website_url: normalizeWebsite(row.website),
      dataset_updated: insUpdated,
    });
  });

  const records = Array.from(dedupMap.values());
  const countsAfterDedup: Record<string, number> = {};
  for (const r of records) {
    countsAfterDedup[r.source_dataset_id] = (countsAfterDedup[r.source_dataset_id] || 0) + 1;
  }

  const datasets: NycDatasetSummary[] = DATASET_DEFS.map((d) => ({
    dataset_id: d.id,
    dataset_name: d.name,
    source_url: d.sourceUrl,
    dataset_updated: updatedByDataset.get(d.id) || new Date().toISOString().slice(0, 10),
    record_count: countsAfterDedup[d.id] || 0,
  }));

  const nowIso = new Date().toISOString();
  return {
    schemaVersion: 1,
    fetchedAtIso: nowIso,
    snapshotDate: nowIso.slice(0, 10),
    datasets,
    records,
  };
}

async function readSnapshotFromDisk(): Promise<SnapshotPayload | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotPayload;
    if (
      parsed &&
      parsed.schemaVersion === 1 &&
      Array.isArray(parsed.records) &&
      parsed.records.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeSnapshotToDisk(snapshot: SnapshotPayload): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
    const tmpPath = `${SNAPSHOT_FILE}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(snapshot), 'utf8');
    await fs.rename(tmpPath, SNAPSHOT_FILE);
  } catch (err) {
    console.warn('Could not save data/nyc_resources.json snapshot:', err);
  }
}

async function triggerDailyRefreshIfStale(): Promise<void> {
  if (refreshInProgress) return;
  const lastFetchedMs = cachedFetchedAtIso ? new Date(cachedFetchedAtIso).getTime() : 0;
  if (cachedRecords.length > 0 && Date.now() - lastFetchedMs < ONE_DAY_MS) {
    return;
  }

  refreshInProgress = true;
  try {
    const fresh = await fetchAndBuildFromNycOpenData();
    if (fresh.records.length >= 5000) {
      buildIndices(fresh.records, fresh.datasets, fresh.fetchedAtIso, fresh.snapshotDate);
      await writeSnapshotToDisk(fresh);
      console.log(
        `NYC Open Data DB refreshed: ${fresh.records.length} deduplicated listings from ${fresh.datasets.length} datasets.`
      );
    }
  } catch (err) {
    console.warn(
      'NYC Open Data refresh failed; continuing with cached snapshot if available:',
      err instanceof Error ? err.message : err
    );
  } finally {
    refreshInProgress = false;
  }
}

export async function ensureNycResourcesLoaded(): Promise<void> {
  if (cachedRecords.length > 0) {
    const lastFetchedMs = cachedFetchedAtIso ? new Date(cachedFetchedAtIso).getTime() : 0;
    if (Date.now() - lastFetchedMs >= ONE_DAY_MS && !refreshInProgress) {
      void triggerDailyRefreshIfStale();
    }
    return;
  }

  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    const diskSnapshot = await readSnapshotFromDisk();
    if (diskSnapshot) {
      buildIndices(
        diskSnapshot.records,
        diskSnapshot.datasets,
        diskSnapshot.fetchedAtIso,
        diskSnapshot.snapshotDate
      );
      console.log(
        `Loaded ${diskSnapshot.records.length} NYC resources from snapshot (${diskSnapshot.snapshotDate}).`
      );
      const ageMs = Date.now() - new Date(diskSnapshot.fetchedAtIso).getTime();
      if (ageMs >= ONE_DAY_MS) {
        void triggerDailyRefreshIfStale();
      }
      return;
    }

    await triggerDailyRefreshIfStale();
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolvePatientCenter(intake: IntakeExtraction): { lat: number; lng: number } | null {
  const zip = cleanZip(intake.zip);
  if (zip && cachedZipCenters.has(zip)) {
    const c = cachedZipCenters.get(zip)!;
    return { lat: c.lat, lng: c.lng };
  }

  // Fallback to 3-digit ZIP prefix average if exact ZIP missing from index
  if (zip) {
    const prefix = zip.slice(0, 3);
    let latSum = 0;
    let lngSum = 0;
    let count = 0;
    for (const [k, v] of cachedZipCenters.entries()) {
      if (k.startsWith(prefix)) {
        latSum += v.lat * v.count;
        lngSum += v.lng * v.count;
        count += v.count;
      }
    }
    if (count > 0) return { lat: latSum / count, lng: lngSum / count };
  }

  const boroughKey = cleanText(intake.borough).toLowerCase();
  if (boroughKey && cachedBoroughCenters.has(boroughKey)) {
    const b = cachedBoroughCenters.get(boroughKey)!;
    return { lat: b.lat, lng: b.lng };
  }

  return null;
}

export interface RankedNycCandidate {
  record: NycResourceRecord;
  distanceKm: number | null;
  languageMatched: boolean;
  hasPhoneAndHours: boolean;
}

const MAX_MATCH_RADIUS_KM = 3.22; // 2 miles

const MENTAL_HEALTH_NEED_RE =
  /\b(mental|therap|depress|anxiet|counsel|psych|substance|addict|behavioral|behavioural|crisis|suicid|rehab|detox|trauma|grief)\b/i;

const SCHOOL_MEAL_NEED_RE =
  /\b(school meal|school lunch|free lunch|summer meal|summer food|school breakfast)\b/i;

const CLINIC_EXCLUDE_RE =
  /\b(behavioral health|mental health|substance|omh|oasas|adolescent|youth|skills center|career development|afterschool|after school|beacon|cornerstone|summer camp|church|ministry|ministries|temple|mosque|synagogue|parish|cathedral|tabernacle|chapel|school based|school-based|high school|middle school|elementary school|intermediate school|charter school|academy|pre-k|head start|day care|daycare|child care|childcare|dialysis|mobile|medical van|nursing home|adult day|home care|hospice|senior life|managed long term)\b|\b(p\.?s\.?|i\.?s\.?|m\.?s\.?|h\.?s\.?)\s*\/?\s*\d+/i;

const CLINIC_PRIMARY_TIER3_RE =
  /\b(fqhc|family health|pediatric|primary care|community health|community healthcare|urban health plan|la casa de salud|morris heights|union community|gotham health|nyc health \+ hospitals|health \+ hospitals|montefiore|bronxcare|lincoln medical|bellevue|elmhurst hospital|kings county|harlem hospital|jacobi|woodhull|metropolitan hospital|south bronx health|diagnostic and treatment center|hospital extension clinic|general hospital)\b/i;

const CLINIC_PRIMARY_TIER2_RE =
  /\b(health center|medical center|medical practice|clinic|hospital|care center|health collective)\b/i;

const FOOD_CHILD_OR_SCHOOL_RE =
  /\b(child meal|summer only|feeding site|summer camp|nyc parks|usda community eligibility|school|p\.?s\.?\s*\d+|i\.?s\.?\s*\d+|m\.?s\.?\s*\d+|high school|academy)\b/i;

const FOOD_PANTRY_PRIORITY_RE =
  /\b(food pantry|soup kitchen|snap center|food bank|common pantry|community kitchen)\b/i;

export function rankNycResourcesForNeed(
  need: IntakeNeed,
  intake: IntakeExtraction,
  topN: number = 8
): RankedNycCandidate[] {
  if (cachedRecords.length === 0) return [];

  const domain = need.domain;
  const patientZip = cleanZip(intake.zip);
  const patientLang = cleanText(intake.language).toLowerCase();
  const center = resolvePatientCenter(intake);
  const needText = `${need.summary || ''} ${need.evidence_quote || ''}`;
  const wantsMentalHealth = domain === 'clinic' && MENTAL_HEALTH_NEED_RE.test(needText);
  const wantsSchoolMeals = domain === 'food' && SCHOOL_MEAL_NEED_RE.test(needText);

  const filtered = cachedRecords.filter((r) => {
    if (r.domain !== domain && !r.domains.includes(domain)) return false;

    const combinedMeta = `${r.name} ${r.subtype} ${r.operator} ${r.agency}`;

    if (domain === 'clinic') {
      const isBehavioral = /behavioral health|mental health|substance|omh|oasas/i.test(
        `${r.subtype} ${r.agency}`
      );
      if (wantsMentalHealth) {
        if (!isBehavioral && !/psych|mental|counsel|behavioral/i.test(r.name)) return false;
      } else {
        if (isBehavioral) return false;
        if (CLINIC_EXCLUDE_RE.test(combinedMeta)) return false;
      }
    }

    if (domain === 'food' && !wantsSchoolMeals) {
      const isChildOrSchool = FOOD_CHILD_OR_SCHOOL_RE.test(`${r.subtype} ${r.name}`);
      const isRealPantry = FOOD_PANTRY_PRIORITY_RE.test(`${r.subtype} ${r.name}`);
      if (isChildOrSchool && !isRealPantry) return false;
    }

    return true;
  });

  if (filtered.length === 0) return [];

  const scored = filtered
    .map((r) => {
      const distKm = center ? haversineKm(center.lat, center.lng, r.lat, r.lng) : null;
      const serviceAreaHit = Boolean(
        patientZip && r.service_area_zips && r.service_area_zips.includes(patientZip)
      );

      // Enforce 2-mile radius cap when patient location is known
      if (distKm !== null && distKm > MAX_MATCH_RADIUS_KM && !serviceAreaHit) {
        return null;
      }

      const languageMatched = Boolean(
        patientLang &&
          patientLang !== 'english' &&
          patientLang !== 'unknown' &&
          r.languages.some((l) => l.toLowerCase().includes(patientLang))
      );
      const hasPhone = Boolean(r.phone);
      const hasHours = Boolean(r.hours);
      const hasPhoneAndHours = hasPhone && hasHours;

      const combinedMeta = `${r.name} ${r.subtype} ${r.operator}`;
      let qualityTier = 1;
      if (domain === 'clinic' && !wantsMentalHealth) {
        if (CLINIC_PRIMARY_TIER3_RE.test(combinedMeta)) {
          qualityTier = 3;
        } else if (CLINIC_PRIMARY_TIER2_RE.test(combinedMeta)) {
          qualityTier = 2;
        } else {
          qualityTier = 0;
        }
      } else if (domain === 'food' && !wantsSchoolMeals) {
        qualityTier = FOOD_PANTRY_PRIORITY_RE.test(`${r.subtype} ${r.name}`) ? 3 : 1;
      }

      const effectiveDist =
        distKm === null
          ? 999
          : serviceAreaHit
            ? Math.max(0, distKm - 0.4)
            : distKm;

      // Quantize distance to 0.4 km so higher clinical/pantry quality wins within the same neighborhood
      const distBucket = Math.round(effectiveDist / 0.4) * 0.4;

      return {
        record: r,
        distanceKm: distKm !== null ? Number(distKm.toFixed(2)) : null,
        languageMatched,
        hasPhoneAndHours,
        sortKey: {
          qualityTier,
          distBucket,
          exactDist: effectiveDist,
          langScore: languageMatched ? 1 : 0,
          contactScore: hasPhoneAndHours ? 2 : hasPhone || hasHours ? 1 : 0,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    if (a.sortKey.qualityTier !== b.sortKey.qualityTier) {
      return b.sortKey.qualityTier - a.sortKey.qualityTier;
    }
    if (a.sortKey.distBucket !== b.sortKey.distBucket) {
      return a.sortKey.distBucket - b.sortKey.distBucket;
    }
    if (a.sortKey.langScore !== b.sortKey.langScore) {
      return b.sortKey.langScore - a.sortKey.langScore;
    }
    if (a.sortKey.contactScore !== b.sortKey.contactScore) {
      return b.sortKey.contactScore - a.sortKey.contactScore;
    }
    return a.sortKey.exactDist - b.sortKey.exactDist;
  });

  return scored.slice(0, topN).map(({ record, distanceKm, languageMatched, hasPhoneAndHours }) => ({
    record,
    distanceKm,
    languageMatched,
    hasPhoneAndHours,
  }));
}

export function queryNycResources(params: {
  search?: string;
  domain?: string;
  borough?: string;
  dataset?: string;
  page?: number;
  pageSize?: number;
}) {
  const search = cleanText(params.search).toLowerCase();
  const domain = cleanText(params.domain).toLowerCase();
  const borough = cleanText(params.borough).toLowerCase();
  const dataset = cleanText(params.dataset).toLowerCase();
  const pageSize = Math.min(200, Math.max(10, Number(params.pageSize) || 50));

  const filtered = cachedRecords.filter((r) => {
    if (domain && domain !== 'all') {
      const target = domain as NeedDomain;
      if (r.domain !== target && !r.domains.includes(target)) return false;
    }
    if (borough && borough !== 'all') {
      if (r.borough.toLowerCase() !== borough) return false;
    }
    if (dataset && dataset !== 'all') {
      if (r.source_dataset_id.toLowerCase() !== dataset) return false;
    }
    if (search) {
      const hay = `${r.name} ${r.subtype} ${r.address} ${r.zip} ${r.borough} ${r.operator} ${r.agency} ${r.source_dataset_name}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(params.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    totalFiltered,
    totalRecords: cachedRecords.length,
    page,
    pageSize,
    totalPages,
    snapshotDate: cachedSnapshotDate || new Date().toISOString().slice(0, 10),
    snapshotUpdatedAtIso: cachedFetchedAtIso || new Date().toISOString(),
    datasetCount: cachedDatasets.length,
    datasets: cachedDatasets,
    domainCounts: cachedDomainCounts,
  };
}

const NAME_STOP_WORDS = new Set([
  'the',
  'of',
  'and',
  'for',
  'at',
  'in',
  'on',
  'to',
  'a',
  'an',
  'inc',
  'llc',
  'corp',
  'nyc',
  'new',
  'york',
  'city',
  'center',
  'clinic',
  'hospital',
  'program',
  'services',
  'service',
  'office',
  'community',
  'health',
  'food',
  'pantry',
]);

function normalizeNameText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNameTokens(raw: string): string[] {
  const tokens = normalizeNameText(raw)
    .split(' ')
    .filter((t) => t.length >= 2);
  const significant = tokens.filter((t) => !NAME_STOP_WORDS.has(t));
  return significant.length > 0 ? significant : tokens;
}

const STREET_ABBREV_MAP: Record<string, string> = {
  st: 'street',
  str: 'street',
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  rd: 'road',
  pl: 'place',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  pkwy: 'parkway',
  ter: 'terrace',
  sq: 'square',
  hwy: 'highway',
  expwy: 'expressway',
  e: 'east',
  w: 'west',
  n: 'north',
  s: 'south',
  ft: 'fort',
  mt: 'mount',
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
};

function normalizeAddressCore(raw: string): {
  fullNorm: string;
  streetNum: string;
  streetTokens: string[];
} {
  // Strip borough, state, zip, floor/suite annotations to isolate street line
  const cleaned = raw
    .toLowerCase()
    .replace(/,?\s*\b(bronx|brooklyn|manhattan|queens|staten island|new york|bx|bk|ny|lic|jamaica|flushing|astoria|rockaway)\b[\s\S]*$/i, '')
    .replace(/\b(\d+(?:st|nd|rd|th)?\s*(?:fl|flr|floor)|lower level|b-level|basement|suite|ste|apt|rm|room)\b.*$/i, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = cleaned.split(' ').filter(Boolean);
  const normTokens = rawTokens.map((tok) => {
    const ordMatch = tok.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (ordMatch) return ordMatch[1];
    return STREET_ABBREV_MAP[tok] || tok;
  });

  const streetNum = normTokens[0] && /^\d+(?:-\d+)?$/.test(normTokens[0]) ? normTokens[0] : '';
  const streetTokens = (streetNum ? normTokens.slice(1) : normTokens).filter(
    (t) => t.length >= 1 && t !== 'fl' && t !== 'flr' && t !== 'floor'
  );

  return {
    fullNorm: normTokens.join(' '),
    streetNum,
    streetTokens,
  };
}

function addressPairMatches(aRaw: string, bRaw: string): boolean {
  const a = normalizeAddressCore(aRaw);
  const b = normalizeAddressCore(bRaw);
  if (!a.streetNum || !b.streetNum) return false;

  // Handle hyphenated ranges like 2541-2549 matching 2541
  const aBaseNum = a.streetNum.split('-')[0];
  const bBaseNum = b.streetNum.split('-')[0];
  const sameNum = a.streetNum === b.streetNum || aBaseNum === bBaseNum;
  if (!sameNum) return false;

  if (a.fullNorm === b.fullNorm) return true;
  if (a.streetTokens.length === 0 || b.streetTokens.length === 0) return false;

  const setB = new Set(b.streetTokens);
  let overlap = 0;
  for (const t of a.streetTokens) {
    if (setB.has(t)) overlap += 1;
  }
  const minLen = Math.min(a.streetTokens.length, b.streetTokens.length);
  return overlap >= Math.max(1, Math.ceil(minLen * 0.65));
}

export interface OfficialDbLookupResult {
  found: boolean;
  addressMatches: boolean;
  matchedName?: string;
  matchedAddress?: string;
  datasetName?: string;
}

export function lookupOfficialNycResource(
  name: string,
  address: string
): OfficialDbLookupResult {
  if (cachedRecords.length === 0) {
    return { found: false, addressMatches: false };
  }
  const normQueryName = normalizeNameText(name);
  const queryTokens = extractNameTokens(name);
  if (!normQueryName || queryTokens.length === 0) {
    return { found: false, addressMatches: false };
  }

  let bestScore = 0;
  let bestRecord: NycResourceRecord | null = null;
  let bestAddrMatch = false;

  for (const rec of cachedRecords) {
    const recNameNorm = normalizeNameText(rec.name);
    const addrMatches = Boolean(address && addressPairMatches(address, rec.address));

    let nameScore = 0;
    if (recNameNorm === normQueryName) {
      nameScore = 1.0;
    } else if (
      recNameNorm.length >= 6 &&
      normQueryName.length >= 6 &&
      (recNameNorm.includes(normQueryName) || normQueryName.includes(recNameNorm))
    ) {
      nameScore = 0.88;
    } else {
      const recTokens = extractNameTokens(rec.name);
      if (recTokens.length > 0) {
        const recSet = new Set(recTokens);
        let hits = 0;
        for (const qt of queryTokens) {
          if (recSet.has(qt)) hits += 1;
        }
        if (hits > 0) {
          const precision = hits / queryTokens.length;
          const recall = hits / recTokens.length;
          const f1 = (2 * precision * recall) / (precision + recall);
          nameScore = f1;
        }
      }
    }

    const combinedScore = nameScore + (addrMatches ? 0.35 : 0);
    const isMatch =
      nameScore >= 0.62 || (addrMatches && nameScore >= 0.32);

    if (isMatch && combinedScore > bestScore) {
      bestScore = combinedScore;
      bestRecord = rec;
      bestAddrMatch = addrMatches;
    }
  }

  if (!bestRecord) {
    return { found: false, addressMatches: false };
  }

  const fullOfficialAddr = [
    bestRecord.address,
    bestRecord.borough && bestRecord.borough !== 'NYC' ? bestRecord.borough : '',
    bestRecord.zip ? `NY ${bestRecord.zip}` : 'NY',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    found: true,
    addressMatches: bestAddrMatch,
    matchedName: bestRecord.name,
    matchedAddress: fullOfficialAddr,
    datasetName: bestRecord.source_dataset_name,
  };
}

export interface StressTestSeed {
  id: string;
  referral: ReferralItem;
  intake: IntakeExtraction;
  errorType: StressErrorType;
  plantedError: string;
}

export function buildStressTestSeeds(): StressTestSeed[] {
  const byId = new Map<string, NycResourceRecord>();
  for (const r of cachedRecords) {
    byId.set(r.id, r);
  }

  const getRec = (id: string): NycResourceRecord | undefined => byId.get(id);

  const formatAddr = (rec: NycResourceRecord) =>
    [rec.address, rec.borough && rec.borough !== 'NYC' ? rec.borough : '', rec.zip ? `NY ${rec.zip}` : 'NY']
      .filter(Boolean)
      .join(', ');

  const makeSeed = (
    seedId: string,
    recordId: string,
    errorType: StressErrorType,
    plantedError: string,
    overrides: { address?: string; hours?: string; constraints?: string[] }
  ): StressTestSeed | null => {
    const rec = getRec(recordId);
    if (!rec) return null;

    const cleanRealHours = 'Monday - Friday 8:30am to 5:00pm';
    const claimedAddress = overrides.address ?? formatAddr(rec);
    const claimedHours = overrides.hours ?? cleanRealHours;
    const sourceUrl =
      rec.website_url ||
      (rec.source_dataset_id === 'tc6u-8rnp'
        ? 'https://www.nyc.gov/site/hra/locations/snap-locations.page'
        : 'https://www.nyc.gov/site/hra/locations/job-locations-and-service-centers.page');

    const referral: ReferralItem = {
      id: seedId,
      need_id: `stress-need-${seedId}`,
      domain: rec.domain,
      name: rec.name,
      address: claimedAddress,
      phone: rec.phone || '718-557-1399',
      hours: claimedHours,
      eligibility: 'NYC residents applying for SNAP or benefits assistance.',
      source_url: sourceUrl,
      source_title: `Official NYC listing (${rec.source_dataset_name})`,
      official_listing: true,
      dataset_id: rec.source_dataset_id,
      dataset_name: rec.source_dataset_name,
      dataset_updated: rec.dataset_updated,
      dataset_url: rec.source_url,
      why_matches: `Seeded from ${rec.source_dataset_name} (${rec.id}) for self-check stress test.`,
      verified: false,
      verification_note: '',
    };

    const intake: IntakeExtraction = {
      patient_first_name: 'StressTest',
      language: 'English',
      zip: rec.zip || '10457',
      borough: rec.borough || 'Bronx',
      multiple_patients: false,
      prompt_injection_detected: false,
      prompt_injection_reason: '',
      medical_advice_requested: false,
      needs: [
        {
          id: `stress-need-${seedId}`,
          domain: rec.domain,
          urgency: 2,
          summary: `Need ${rec.domain} assistance near ${rec.zip || rec.borough}`,
          evidence_quote: 'Needs assistance',
        },
      ],
      constraints: overrides.constraints || [],
      unclear: [],
    };

    return {
      id: seedId,
      referral,
      intake,
      errorType,
      plantedError,
    };
  };

  const specs: Array<{
    id: string;
    recordId: string;
    errorType: StressErrorType;
    plantedError: string;
    overrides: { address?: string; hours?: string; constraints?: string[] };
  }> = [
    // 5 Wrong hours
    {
      id: 'ST01',
      recordId: 'tc6u-1',
      errorType: 'wrong_hours',
      plantedError: 'Wrong hours: claims 6:00 AM to 9:00 PM (source: Mon-Fri 8:30am to 5:00pm)',
      overrides: { hours: 'Monday - Friday 6:00 AM to 9:00 PM' },
    },
    {
      id: 'ST02',
      recordId: 'tc6u-2',
      errorType: 'wrong_hours',
      plantedError: 'Wrong hours: claims 10:00 AM to 7:00 PM (source: Mon-Fri 8:30am to 5:00pm)',
      overrides: { hours: 'Monday - Friday 10:00 AM to 7:00 PM' },
    },
    {
      id: 'ST03',
      recordId: 'tc6u-3',
      errorType: 'wrong_hours',
      plantedError: 'Wrong hours: claims 11:00 AM to 8:00 PM (source: Mon-Fri 8:30am to 5:00pm)',
      overrides: { hours: 'Monday - Friday 11:00 AM to 8:00 PM' },
    },
    {
      id: 'ST04',
      recordId: '9d9t-2',
      errorType: 'wrong_hours',
      plantedError: 'Wrong hours: claims 7:00 AM to 2:00 PM (source: Mon-Fri 8:30am to 5:00pm)',
      overrides: { hours: 'Monday - Friday 7:00 AM to 2:00 PM' },
    },
    {
      id: 'ST05',
      recordId: '9d9t-7',
      errorType: 'wrong_hours',
      plantedError: 'Wrong hours: claims 12:00 PM to 9:00 PM (source: Mon-Fri 8:30am to 5:00pm)',
      overrides: { hours: 'Monday - Friday 12:00 PM to 9:00 PM' },
    },

    // 5 Wrong street address
    {
      id: 'ST06',
      recordId: 'tc6u-4',
      errorType: 'wrong_address',
      plantedError: 'Wrong address: 888 Flatbush Ave (source: 2400 Fulton Street)',
      overrides: { address: '888 Flatbush Avenue, Brooklyn, NY 11226' },
    },
    {
      id: 'ST07',
      recordId: 'tc6u-5',
      errorType: 'wrong_address',
      plantedError: 'Wrong address: 450 Bedford Ave (source: 2 George Street)',
      overrides: { address: '450 Bedford Avenue, Brooklyn, NY 11249' },
    },
    {
      id: 'ST08',
      recordId: 'tc6u-6',
      errorType: 'wrong_address',
      plantedError: 'Wrong address: 1450 Lexington Ave (source: 2322 Third Avenue)',
      overrides: { address: '1450 Lexington Avenue, Manhattan, NY 10128' },
    },
    {
      id: 'ST09',
      recordId: '9d9t-10',
      errorType: 'wrong_address',
      plantedError: 'Wrong address: 500 West 181st St (source: 4055 10th Avenue)',
      overrides: { address: '500 West 181st Street, Manhattan, NY 10033' },
    },
    {
      id: 'ST10',
      recordId: '9d9t-14',
      errorType: 'wrong_address',
      plantedError: 'Wrong address: 144-10 Hillside Ave (source: 165-08 88th Avenue)',
      overrides: { address: '144-10 Hillside Avenue, Queens, NY 11435' },
    },

    // 5 Marked open on a day the source says closed (source is Mon-Fri only)
    {
      id: 'ST11',
      recordId: 'tc6u-7',
      errorType: 'closed_day',
      plantedError: 'Marked open Saturdays 9am-4pm (source: Mon-Fri only, closed Saturdays)',
      overrides: {
        hours: 'Open Saturdays 9:00 AM to 4:00 PM',
        constraints: ['Works Mon to Fri; available Saturdays only'],
      },
    },
    {
      id: 'ST12',
      recordId: 'tc6u-10',
      errorType: 'closed_day',
      plantedError: 'Marked open Sundays 10am-3pm (source: Mon-Fri only, closed Sundays)',
      overrides: {
        hours: 'Open Sundays 10:00 AM to 3:00 PM',
        constraints: ['Works Mon to Fri; available weekends only'],
      },
    },
    {
      id: 'ST13',
      recordId: 'tc6u-12',
      errorType: 'closed_day',
      plantedError: 'Marked open Saturdays & Sundays 9am-5pm (source: Mon-Fri only)',
      overrides: {
        hours: 'Open Saturdays and Sundays 9:00 AM to 5:00 PM',
        constraints: ['Works weekdays until 5pm; available Saturdays only'],
      },
    },
    {
      id: 'ST14',
      recordId: '9d9t-11',
      errorType: 'closed_day',
      plantedError: 'Marked open Saturdays 8:30am-5pm (source: Mon-Fri only, closed Saturdays)',
      overrides: {
        hours: 'Open Saturdays 8:30 AM to 5:00 PM',
        constraints: ['Works Mon to Fri; available Saturdays only'],
      },
    },
    {
      id: 'ST15',
      recordId: '9d9t-15',
      errorType: 'closed_day',
      plantedError: 'Marked open Sundays 9am-2pm (source: Mon-Fri only, closed Sundays)',
      overrides: {
        hours: 'Open Sundays 9:00 AM to 2:00 PM',
        constraints: ['Works weekdays full time; available weekends only'],
      },
    },

    // 5 Untouched control referrals
    {
      id: 'ST16',
      recordId: 'tc6u-11',
      errorType: 'control',
      plantedError: 'None (untouched official NYC record)',
      overrides: {},
    },
    {
      id: 'ST17',
      recordId: 'tc6u-13',
      errorType: 'control',
      plantedError: 'None (untouched official NYC record)',
      overrides: {},
    },
    {
      id: 'ST18',
      recordId: '9d9t-8',
      errorType: 'control',
      plantedError: 'None (untouched official NYC record)',
      overrides: {},
    },
    {
      id: 'ST19',
      recordId: '9d9t-16',
      errorType: 'control',
      plantedError: 'None (untouched official NYC record)',
      overrides: {},
    },
    {
      id: 'ST20',
      recordId: '9d9t-17',
      errorType: 'control',
      plantedError: 'None (untouched official NYC record)',
      overrides: {},
    },
  ];

  return specs
    .map((s) => makeSeed(s.id, s.recordId, s.errorType, s.plantedError, s.overrides))
    .filter((s): s is StressTestSeed => s !== null);
}
