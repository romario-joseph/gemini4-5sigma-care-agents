import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, ExternalLink, RefreshCw, Search } from 'lucide-react';
import type { NeedDomain, NycResourcesApiResponse } from '../types.ts';

const DOMAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All domains' },
  { value: 'food', label: 'Food' },
  { value: 'clinic', label: 'Clinic & Behavioral Health' },
  { value: 'housing', label: 'Housing' },
  { value: 'benefits', label: 'Benefits & Enrollment' },
  { value: 'other', label: 'Other Community Services' },
];

const BOROUGH_OPTIONS = ['all', 'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];

const DOMAIN_LABELS: Record<NeedDomain, string> = {
  food: 'Food',
  clinic: 'Clinic',
  housing: 'Housing',
  utilities: 'Utilities',
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

export const ResourcesTab: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [boroughFilter, setBoroughFilter] = useState('all');
  const [datasetFilter, setDatasetFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState<NycResourcesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 220);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchResources = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          search: debouncedSearch,
          domain: domainFilter,
          borough: boroughFilter,
          dataset: datasetFilter,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/resources?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await res.json()) as NycResourcesApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(payload.error || `Failed to load resources (${res.status})`);
        }
        setData(payload);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unable to fetch NYC resource directory.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void fetchResources();
    return () => controller.abort();
  }, [debouncedSearch, domainFilter, boroughFilter, datasetFilter, page, pageSize]);

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setDomainFilter('all');
    setBoroughFilter('all');
    setDatasetFilter('all');
    setPage(1);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Top Banner with Count, Dataset Count, and Snapshot Date */}
      <section className="ehr-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Database className="h-5 w-5 text-[#1F3A5F] mt-0.5 shrink-0" />
            <div>
              <h1 className="text-[15px] font-bold text-[#1F3A5F]">
                {data
                  ? `${data.totalRecords.toLocaleString()} official NYC resources from ${data.datasetCount} datasets`
                  : 'Loading official NYC Open Data resources...'}
              </h1>
              <p className="mt-0.5 text-[12px] text-slate-600">
                Snapshot date: <span className="font-mono font-semibold text-slate-800">{data?.snapshotDate || '...'}</span>
                {' '} | Cached locally in data/nyc_resources.json and refreshed daily from NYC Open Data (Socrata).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="ehr-btn-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset filters
          </button>
        </div>

        {/* Per-Dataset Breakdown Cards */}
        {data && data.datasets.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {data.datasets.map((ds) => {
              const selected = datasetFilter === ds.dataset_id;
              return (
                <button
                  key={ds.dataset_id}
                  type="button"
                  onClick={() => {
                    setDatasetFilter(selected ? 'all' : ds.dataset_id);
                    setPage(1);
                  }}
                  className={`text-left rounded-[3px] border px-2.5 py-2 transition-colors ${
                    selected
                      ? 'border-[#2B6CB0] bg-[#E8F1FB]'
                      : 'border-slate-300 bg-[#F8FAFC] hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[11px] font-bold text-[#2B6CB0]">
                      {ds.dataset_id}
                    </span>
                    <span className="font-mono text-[12.5px] font-bold text-slate-900 tabular-nums">
                      {ds.record_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] font-semibold text-slate-900 truncate">
                    {ds.dataset_name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                    Updated {ds.dataset_updated}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Per-Domain Count Strip */}
        {data ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span className="font-semibold text-slate-700 mr-1">Domains:</span>
            {(['food', 'clinic', 'housing', 'benefits', 'other'] as NeedDomain[]).map((d) => {
              const active = domainFilter === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDomainFilter(active ? 'all' : d);
                    setPage(1);
                  }}
                  className={`rounded-[2px] border px-2 py-0.5 font-medium tabular-nums ${
                    active
                      ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {DOMAIN_LABELS[d]}: {(data.domainCounts[d] || 0).toLocaleString()}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Filter Bar */}
      <section className="ehr-panel p-2.5 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by facility name, street, ZIP, subtype, or agency..."
            aria-label="Search official NYC resources"
            className="w-full rounded-[3px] border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-[12.5px] text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
          />
        </div>

        <select
          value={domainFilter}
          onChange={(e) => {
            setDomainFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by domain"
          className="rounded-[3px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          {DOMAIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={boroughFilter}
          onChange={(e) => {
            setBoroughFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by borough"
          className="rounded-[3px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          <option value="all">All boroughs</option>
          {BOROUGH_OPTIONS.filter((b) => b !== 'all').map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={datasetFilter}
          onChange={(e) => {
            setDatasetFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by NYC Open Data dataset"
          className="rounded-[3px] border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          <option value="all">All 5 datasets</option>
          {(data?.datasets || []).map((ds) => (
            <option key={ds.dataset_id} value={ds.dataset_id}>
              {ds.dataset_name} ({ds.record_count.toLocaleString()})
            </option>
          ))}
        </select>

        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          aria-label="Rows per page"
          className="rounded-[3px] border border-slate-300 bg-white px-2 py-1.5 text-[12.5px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </section>

      {error ? (
        <div className="ehr-panel border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800">
          {error}
        </div>
      ) : null}

      {/* Dense EHR Resource Table */}
      <section className="ehr-panel overflow-hidden">
        <div className="ehr-section-header">
          <span>
            Official NYC Open Data Directory{' '}
            {data ? `(${data.totalFiltered.toLocaleString()} matching listings)` : ''}
          </span>
          {data ? (
            <span className="font-mono text-[11.5px] font-normal text-slate-600 tabular-nums">
              Page {data.page} of {data.totalPages}
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="ehr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domain</th>
                <th>Subtype</th>
                <th>Address</th>
                <th>Borough</th>
                <th>ZIP</th>
                <th>Phone</th>
                <th>Hours</th>
                <th className="text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    Loading official NYC resource listings...
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    No official NYC resources match these filters.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => {
                  const linkUrl =
                    isSafeHttpUrl(item.website_url)
                      ? item.website_url!
                      : isSafeHttpUrl(item.source_url)
                        ? item.source_url
                        : '';
                  return (
                    <tr key={item.id}>
                      <td className="font-semibold text-slate-900 max-w-[230px]">
                        <div>{item.name}</div>
                        {item.languages.length > 0 ? (
                          <div className="mt-0.5 text-[11px] font-normal text-purple-800">
                            Languages: {item.languages.slice(0, 4).join(', ')}
                            {item.languages.length > 4 ? ` +${item.languages.length - 4}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="inline-block rounded-[2px] bg-[#E8EEF5] border border-slate-300 px-1.5 py-0.5 text-[11px] font-bold text-[#1F3A5F]">
                          {DOMAIN_LABELS[item.domain] || item.domain}
                        </span>
                      </td>
                      <td className="text-slate-700 max-w-[160px]">{item.subtype}</td>
                      <td className="text-slate-800 max-w-[200px]">{item.address}</td>
                      <td className="whitespace-nowrap text-slate-800">{item.borough}</td>
                      <td className="whitespace-nowrap font-mono text-[12px] text-slate-800 tabular-nums">
                        {item.zip || 'N/A'}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[12px] text-slate-800 tabular-nums">
                        {item.phone || 'Not listed'}
                      </td>
                      <td className="text-slate-700 max-w-[200px]">
                        {item.hours || (
                          <span className="text-slate-400">Hours not listed, call to confirm</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          {isSafeHttpUrl(item.source_url) ? (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2B6CB0] hover:underline"
                            >
                              {item.source_dataset_name}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-[11.5px] text-slate-600">{item.source_dataset_name}</span>
                          )}
                          <span className="text-[10.5px] font-mono text-slate-500">
                            Updated {item.dataset_updated}
                          </span>
                          {linkUrl && linkUrl !== item.source_url ? (
                            <a
                              href={linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10.5px] text-slate-600 hover:underline"
                            >
                              Program site
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-[#F8FAFC] px-3 py-2 text-[12px] text-slate-700">
            <span className="tabular-nums">
              Showing{' '}
              {data.totalFiltered === 0
                ? 0
                : ((data.page - 1) * data.pageSize + 1).toLocaleString()}{' '}
              to{' '}
              {Math.min(data.page * data.pageSize, data.totalFiltered).toLocaleString()} of{' '}
              {data.totalFiltered.toLocaleString()} listings
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="ehr-btn-secondary disabled:opacity-45"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="px-2 font-mono text-[12px] tabular-nums">
                Page {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
                disabled={data.page >= data.totalPages || loading}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="ehr-btn-secondary disabled:opacity-45"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
