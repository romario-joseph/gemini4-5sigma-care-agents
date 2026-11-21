import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  IntakeExtraction,
  IntakeNeed,
  NeedDomain,
  NycDatasetSummary,
  NycResourceRecord,
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
    const subtype = mapping.subtypeOverride
      ? factype && !mapping.subtypeOverride.toLowerCase().includes(factype.toLowerCase())
        ? `${mapping.subtypeOverride} (${factype})`
        : mapping.subtypeOverride
      : factype || facsubgrp;

    upsertRecord({
      id: `ji82-${cleanText(row.uid) || dedupMap.size + 1}`,
      name,
      domain: mapping.domain,
      domains: [mapping.domain],
      subtype,
      address,
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
      website_url: 'https://www.nyc.gov/site/hra/locations/benefits-access-centers.page',
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

  const filtered = cachedRecords.filter(
    (r) => r.domain === domain || r.domains.includes(domain)
  );
  if (filtered.length === 0) return [];

  const scored = filtered.map((r) => {
    const distKm = center ? haversineKm(center.lat, center.lng, r.lat, r.lng) : null;
    const serviceAreaHit = Boolean(
      patientZip && r.service_area_zips && r.service_area_zips.includes(patientZip)
    );
    const languageMatched = Boolean(
      patientLang &&
        patientLang !== 'english' &&
        patientLang !== 'unknown' &&
        r.languages.some((l) => l.toLowerCase().includes(patientLang))
    );
    const hasPhone = Boolean(r.phone);
    const hasHours = Boolean(r.hours);
    const hasPhoneAndHours = hasPhone && hasHours;

    // Slight boost if Homebase explicitly serves the patient's ZIP
    const effectiveDist =
      distKm === null
        ? 999
        : serviceAreaHit
          ? Math.max(0, distKm - 0.5)
          : distKm;

    // Quantize distance to 0.1 km (~100m NYC block) so language & contact info break nearby ties cleanly
    const distBucket = Math.round(effectiveDist * 10) / 10;

    return {
      record: r,
      distanceKm: distKm !== null ? Number(distKm.toFixed(2)) : null,
      languageMatched,
      hasPhoneAndHours,
      sortKey: {
        distBucket,
        exactDist: effectiveDist,
        langScore: languageMatched ? 1 : 0,
        contactScore: (hasPhoneAndHours ? 2 : hasPhone || hasHours ? 1 : 0),
        // Slight preference for adult/household food pantries over school-only Child meal site unless child/family noted
        pantryBonus:
          domain === 'food' &&
          r.subtype.toLowerCase().includes('child meal')
            ? 0
            : 1,
      },
    };
  });

  scored.sort((a, b) => {
    if (a.sortKey.distBucket !== b.sortKey.distBucket) {
      return a.sortKey.distBucket - b.sortKey.distBucket;
    }
    if (a.sortKey.langScore !== b.sortKey.langScore) {
      return b.sortKey.langScore - a.sortKey.langScore;
    }
    if (a.sortKey.contactScore !== b.sortKey.contactScore) {
      return b.sortKey.contactScore - a.sortKey.contactScore;
    }
    if (a.sortKey.pantryBonus !== b.sortKey.pantryBonus) {
      return b.sortKey.pantryBonus - a.sortKey.pantryBonus;
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
