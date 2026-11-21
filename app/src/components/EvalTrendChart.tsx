import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { LineChart, Play, Trash2 } from 'lucide-react';
import type { EvalRunHistoryEntry } from '../types.ts';

interface EvalTrendChartProps {
  runs: EvalRunHistoryEntry[];
  isRunningEval: boolean;
  onRunFullEval: () => void;
  onClearHistory: () => void;
}

type SeriesFilter = 'both' | 'rate' | 'seconds';

const CHART_HEIGHT = 276;
const MARGIN = { top: 24, right: 56, bottom: 38, left: 54 };

function formatDelta(diff: number, suffix: string): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return `0.0${suffix}`;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}${suffix}`;
}

export const EvalTrendChart: React.FC<EvalTrendChartProps> = ({
  runs,
  isRunningEval,
  onRunFullEval,
  onClearHistory,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(840);
  const [seriesFilter, setSeriesFilter] = useState<SeriesFilter>('both');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const recentRuns = useMemo(() => runs.slice(-10), [runs]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.clientWidth));
      setContainerWidth(next);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveIndex(recentRuns.length > 0 ? recentRuns.length - 1 : null);
  }, [recentRuns.length]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();

    if (recentRuns.length === 0) return;

    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerWidth = Math.max(180, width - MARGIN.left - MARGIN.right);
    const innerHeight = Math.max(120, height - MARGIN.top - MARGIN.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xDomain = recentRuns.map((r) => r.id);
    const xScale = d3
      .scalePoint<string>()
      .domain(xDomain)
      .range([0, innerWidth])
      .padding(recentRuns.length === 1 ? 0.5 : 0.35);

    const yRateScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    const maxSecRaw = d3.max(recentRuns, (d) => d.avgSeconds) ?? 20;
    const maxSecDomain = Math.max(10, Math.ceil((maxSecRaw * 1.2) / 5) * 5);
    const ySecScale = d3.scaleLinear().domain([0, maxSecDomain]).range([innerHeight, 0]);

    // Horizontal grid lines anchored to left axis (0, 25, 50, 75, 100)
    const gridTicks = seriesFilter === 'seconds' ? ySecScale.ticks(4) : [0, 25, 50, 75, 100];
    g.append('g')
      .attr('class', 'grid-lines')
      .selectAll('line')
      .data(gridTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => (seriesFilter === 'seconds' ? ySecScale(d) : yRateScale(d)))
      .attr('y2', (d) => (seriesFilter === 'seconds' ? ySecScale(d) : yRateScale(d)))
      .attr('stroke', 'rgba(0, 0, 0, 0.06)')
      .attr('stroke-width', 1);

    // X Axis
    const labelById = new Map(recentRuns.map((r) => [r.id, r.label]));
    const xAxis = d3
      .axisBottom(xScale)
      .tickFormat((id) => labelById.get(id) || id)
      .tickSize(0)
      .tickPadding(12);

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.select('.domain').attr('stroke', 'rgba(0, 0, 0, 0.12)');
    xAxisGroup
      .selectAll('text')
      .attr('fill', '#52525B')
      .attr('font-size', width < 480 ? '10.5px' : '11.5px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // Left Y Axis (Verification success rate %)
    if (seriesFilter === 'both' || seriesFilter === 'rate') {
      const yLeftAxis = d3
        .axisLeft(yRateScale)
        .tickValues([0, 25, 50, 75, 100])
        .tickFormat((v) => `${v}%`)
        .tickSize(0)
        .tickPadding(10);

      const leftGroup = g.append('g').call(yLeftAxis);
      leftGroup.select('.domain').remove();
      leftGroup
        .selectAll('text')
        .attr('fill', '#0071E3')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

      g.append('text')
        .attr('x', -MARGIN.left + 4)
        .attr('y', -10)
        .attr('fill', '#0071E3')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Verification rate');
    }

    // Right Y Axis (Average seconds)
    if (seriesFilter === 'both' || seriesFilter === 'seconds') {
      const yRightAxis = (
        seriesFilter === 'seconds' ? d3.axisLeft(ySecScale) : d3.axisRight(ySecScale)
      )
        .ticks(4)
        .tickFormat((v) => `${v}s`)
        .tickSize(0)
        .tickPadding(10);

      const rightGroup = g
        .append('g')
        .attr(
          'transform',
          seriesFilter === 'seconds' ? 'translate(0,0)' : `translate(${innerWidth},0)`
        )
        .call(yRightAxis);

      rightGroup.select('.domain').remove();
      rightGroup
        .selectAll('text')
        .attr('fill', '#059669')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

      g.append('text')
        .attr('x', seriesFilter === 'seconds' ? -MARGIN.left + 4 : innerWidth + MARGIN.right - 4)
        .attr('y', -10)
        .attr('text-anchor', seriesFilter === 'seconds' ? 'start' : 'end')
        .attr('fill', '#059669')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Avg seconds');
    }

    // Verification success rate path & points (#0071E3, solid line, circle markers)
    if (seriesFilter === 'both' || seriesFilter === 'rate') {
      const rateLine = d3
        .line<EvalRunHistoryEntry>()
        .x((d) => xScale(d.id) ?? 0)
        .y((d) => yRateScale(d.verificationSuccessRate))
        .curve(d3.curveMonotoneX);

      if (recentRuns.length > 1) {
        g.append('path')
          .datum(recentRuns)
          .attr('fill', 'none')
          .attr('stroke', '#0071E3')
          .attr('stroke-width', 2.5)
          .attr('stroke-linecap', 'round')
          .attr('d', rateLine);
      }

      g.selectAll('.dot-rate')
        .data(recentRuns)
        .join('circle')
        .attr('class', 'dot-rate')
        .attr('cx', (d) => xScale(d.id) ?? 0)
        .attr('cy', (d) => yRateScale(d.verificationSuccessRate))
        .attr('r', (_, idx) => (idx === activeIndex ? 6 : 4.25))
        .attr('fill', (_, idx) => (idx === activeIndex ? '#0071E3' : '#FFFFFF'))
        .attr('stroke', '#0071E3')
        .attr('stroke-width', 2.25);
    }

    // Average seconds path & points (#059669, dashed line, square markers)
    if (seriesFilter === 'both' || seriesFilter === 'seconds') {
      const secLine = d3
        .line<EvalRunHistoryEntry>()
        .x((d) => xScale(d.id) ?? 0)
        .y((d) => ySecScale(d.avgSeconds))
        .curve(d3.curveMonotoneX);

      if (recentRuns.length > 1) {
        g.append('path')
          .datum(recentRuns)
          .attr('fill', 'none')
          .attr('stroke', '#059669')
          .attr('stroke-width', 2.25)
          .attr('stroke-dasharray', '6,4')
          .attr('stroke-linecap', 'round')
          .attr('d', secLine);
      }

      g.selectAll('.dot-sec')
        .data(recentRuns)
        .join('rect')
        .attr('class', 'dot-sec')
        .attr('x', (d, idx) => (xScale(d.id) ?? 0) - (idx === activeIndex ? 5 : 3.75))
        .attr('y', (d, idx) => ySecScale(d.avgSeconds) - (idx === activeIndex ? 5 : 3.75))
        .attr('width', (_, idx) => (idx === activeIndex ? 10 : 7.5))
        .attr('height', (_, idx) => (idx === activeIndex ? 10 : 7.5))
        .attr('rx', 1.5)
        .attr('fill', (_, idx) => (idx === activeIndex ? '#059669' : '#FFFFFF'))
        .attr('stroke', '#059669')
        .attr('stroke-width', 2);
    }

    // Active crosshair vertical line
    if (activeIndex !== null && recentRuns[activeIndex]) {
      const activeX = xScale(recentRuns[activeIndex].id) ?? 0;
      g.append('line')
        .attr('x1', activeX)
        .attr('x2', activeX)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'rgba(0, 0, 0, 0.14)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');
    }

    // Transparent pointer interaction overlay
    const xPositions = recentRuns.map((r) => xScale(r.id) ?? 0);
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove touchstart', function (event: MouseEvent | TouchEvent) {
        const [px] = d3.pointer(event, this);
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < xPositions.length; i += 1) {
          const dist = Math.abs(xPositions[i] - px);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        setActiveIndex(bestIdx);
      });
  }, [recentRuns, containerWidth, seriesFilter, activeIndex]);

  const activeRun =
    activeIndex !== null && recentRuns[activeIndex]
      ? recentRuns[activeIndex]
      : recentRuns[recentRuns.length - 1] || null;
  const latestRun = recentRuns[recentRuns.length - 1] || null;
  const prevRun = recentRuns.length >= 2 ? recentRuns[recentRuns.length - 2] : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (recentRuns.length === 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, (prev ?? recentRuns.length - 1) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveIndex((prev) =>
        Math.min(recentRuns.length - 1, (prev ?? recentRuns.length - 1) + 1)
      );
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-neutral-900">
            Run history (last 10 full evals)
          </h2>
          <p className="mt-1 text-[13.5px] text-neutral-500">
            Care Agents Average seconds and Verification success rate across completed 20-case evaluations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Chart metric filter"
            className="inline-flex items-center rounded-full bg-[#F5F5F7] p-1 border border-black/[0.06]"
          >
            {(
              [
                { id: 'both', label: 'Both metrics' },
                { id: 'rate', label: 'Verification rate' },
                { id: 'seconds', label: 'Avg seconds' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={seriesFilter === opt.id}
                onClick={() => setSeriesFilter(opt.id)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition whitespace-nowrap shrink-0 ${
                  seriesFilter === opt.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {recentRuns.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.1] bg-white px-3.5 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 card-surface overflow-hidden">
        {recentRuns.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <LineChart className="mx-auto h-8 w-8 text-neutral-400" />
            <h3 className="mt-3 text-[16px] font-semibold text-neutral-900">
              No completed 20-case eval runs yet
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] text-neutral-500">
              Run a full evaluation to plot Care Agents Average seconds alongside Verification success rate over your last 10 runs.
            </p>
            <button
              type="button"
              onClick={onRunFullEval}
              disabled={isRunningEval}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#0071E3] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#0062C4] disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Run full eval
            </button>
          </div>
        ) : (
          <>
            {/* Key metrics header strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.06] border-b border-black/[0.06] bg-[#F5F5F7]/40">
              <div className="px-6 py-4">
                <div className="text-[12px] font-medium text-neutral-500">Runs recorded</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[20px] font-semibold text-neutral-900 tabular-nums">
                    {recentRuns.length} / 10
                  </span>
                  <span className="text-[12px] text-neutral-500">
                    {recentRuns.length === 1 ? 'Run another eval to connect lines' : '20 cases per run'}
                  </span>
                </div>
              </div>

              <div className="px-6 py-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-600">
                  <svg width="18" height="10" aria-hidden="true">
                    <line x1="0" y1="5" x2="18" y2="5" stroke="#0071E3" strokeWidth="2.5" />
                    <circle cx="9" cy="5" r="3" fill="#FFFFFF" stroke="#0071E3" strokeWidth="2" />
                  </svg>
                  <span>Verification success rate</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-mono text-[20px] font-semibold text-[#0071E3] tabular-nums">
                    {latestRun ? `${latestRun.verificationSuccessRate.toFixed(1)}%` : 'N/A'}
                  </span>
                  {latestRun && prevRun ? (
                    <span className="font-mono text-[12px] text-neutral-500 tabular-nums">
                      {formatDelta(
                        latestRun.verificationSuccessRate - prevRun.verificationSuccessRate,
                        '%'
                      )}{' '}
                      vs prev
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="px-6 py-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-600">
                  <svg width="18" height="10" aria-hidden="true">
                    <line
                      x1="0"
                      y1="5"
                      x2="18"
                      y2="5"
                      stroke="#059669"
                      strokeWidth="2.25"
                      strokeDasharray="4,2"
                    />
                    <rect
                      x="6.5"
                      y="2.5"
                      width="5"
                      height="5"
                      rx="1"
                      fill="#FFFFFF"
                      stroke="#059669"
                      strokeWidth="1.75"
                    />
                  </svg>
                  <span>Average seconds</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="font-mono text-[20px] font-semibold text-emerald-700 tabular-nums">
                    {latestRun ? `${latestRun.avgSeconds.toFixed(1)}s` : 'N/A'}
                  </span>
                  {latestRun && prevRun ? (
                    <span className="font-mono text-[12px] text-neutral-500 tabular-nums">
                      {formatDelta(latestRun.avgSeconds - prevRun.avgSeconds, 's')} vs prev
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Interactive D3 SVG Chart */}
            <div
              ref={containerRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-label="D3 line chart of Average seconds and Verification success rate over the last 10 full eval runs. Use left and right arrow keys to inspect each run."
              className="px-4 pt-4 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0071E3]"
            >
              <svg ref={svgRef} className="w-full block overflow-visible" />
            </div>

            {/* Inspected Run Readout Bar */}
            {activeRun ? (
              <div className="border-t border-black/[0.06] bg-[#F5F5F7]/35 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2 text-neutral-700">
                  <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                    {activeRun.label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-neutral-500 tabular-nums">
                    {new Date(activeRun.timestampIso).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{activeRun.casesCompleted} cases scored</span>
                </div>

                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                  <span className="text-[#0071E3] font-semibold">
                    Verified {activeRun.verificationSuccessRate.toFixed(1)}% ({activeRun.verifiedCount}/
                    {activeRun.totalReferrals})
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    Avg {activeRun.avgSeconds.toFixed(1)}s
                  </span>
                  <span className="text-neutral-600">
                    Call to confirm {activeRun.callToConfirmCount}
                  </span>
                  <span className="text-neutral-600">
                    Rejected {activeRun.rejectedCount}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};
