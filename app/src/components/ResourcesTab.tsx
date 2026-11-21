import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, ExternalLink, RefreshCw, Search } from 'lucide-react';
import type { NeedDomain, NycResourcesApiResponse } from '../types.ts';

const DOMAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All domains' },
  { value: 'food', label: 'Food' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'housing', label: 'Housing' },
  { value: 'benefits', label: 'Benefits' },
  { value: 'other', label: 'Other' },
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
        setError(err instanceof Error ? err.message : 'Unable to fetch NYC directory.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
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
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-6">
      {/* Header & Dataset Cards */}
      <section className="calm-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-[#2B6CB0] mt-1 shrink-0" />
            <div>
              <h1 className="calm-heading">
                {data
                  ? `${data.totalRecords.toLocaleString()} official NYC resources`
                  : 'Official NYC resources'}
              </h1>
              <p className="mt-0.5 text-[14px] text-slate-600">
                {data
                  ? `${data.datasetCount} NYC Open Data datasets · Updated ${data.snapshotDate}`
                  : 'Loading NYC Open Data snapshot...'}
              </p>
            </div>
          </div>

          <button type="button" onClick={handleResetFilters} className="ehr-btn-secondary">
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {data && data.datasets.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  className={`text-left rounded-lg border p-3 ${
                    selected
                      ? 'border-[#2B6CB0] bg-blue-50/60'
                      : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#2B6CB0]">
                      {ds.dataset_id}
                    </span>
                    <span className="font-mono text-[13.5px] font-semibold text-slate-900 tabular-nums">
                      {ds.record_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-slate-800 truncate">
                    {ds.dataset_name}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Search and Filters */}
      <section className="calm-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, street, ZIP, or agency"
            aria-label="Search NYC resources"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[14px] text-slate-900 focus:border-[#2B6CB0] focus:outline-none"
          />
        </div>

        <select
          value={domainFilter}
          onChange={(e) => {
            setDomainFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by domain"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
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
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          <option value="all">All boroughs</option>
          {BOROUGH_OPTIONS.filter((b) => b !== 'all').map((b) => (
            <option key={b} value={b}>
              {b}
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
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-[#2B6CB0] focus:outline-none"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </section>

      {error ? (
        <div className="calm-card border-red-200 bg-red-50 p-4 text-[14px] text-[#C53030]">
          {error}
        </div>
      ) : null}

      {/* Table */}
      <section className="calm-card overflow-hidden">
        <div className="ehr-section-header">
          <span>
            Directory{data ? ` (${data.totalFiltered.toLocaleString()} matches)` : ''}
          </span>
          {data ? (
            <span className="font-mono text-[13px] font-normal text-slate-500 tabular-nums">
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
                <th>Address</th>
                <th>ZIP</th>
                <th>Phone</th>
                <th>Hours</th>
                <th className="text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Loading official NYC listings...
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    No matching listings found.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[260px]">
                      <div className="font-semibold text-slate-900 truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[12.5px] text-slate-500 truncate" title={item.subtype}>
                        {item.subtype}
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-medium text-[#1F3A5F]">
                      {DOMAIN_LABELS[item.domain] || item.domain}
                    </td>
                    <td
                      className="max-w-[220px] text-slate-700 truncate"
                      title={`${item.address}, ${item.borough}${item.zip ? `, NY ${item.zip}` : ''}`}
                    >
                      {item.address}, {item.borough}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[13px] text-slate-700 tabular-nums">
                      {item.zip || 'N/A'}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[13px] text-slate-700 tabular-nums">
                      {item.phone || 'Not listed'}
                    </td>
                    <td
                      className="max-w-[200px] text-slate-600 truncate"
                      title={item.hours || 'Call to confirm'}
                    >
                      {item.hours || 'Call to confirm'}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {isSafeHttpUrl(item.source_url) ? (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2B6CB0] hover:underline"
                        >
                          Dataset
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-[13px] text-slate-500">{item.source_dataset_id}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[13.5px] text-slate-600">
            <span className="tabular-nums">
              Showing{' '}
              {data.totalFiltered === 0
                ? 0
                : ((data.page - 1) * data.pageSize + 1).toLocaleString()}{' '}
              to {Math.min(data.page * data.pageSize, data.totalFiltered).toLocaleString()} of{' '}
              {data.totalFiltered.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="ehr-btn-secondary py-1.5 px-3"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages || loading}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="ehr-btn-secondary py-1.5 px-3"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
