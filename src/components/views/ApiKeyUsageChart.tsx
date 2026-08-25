import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../../lib/apiClient.ts';
import { ApiKey, ApiKeyUsageResponse, ApiKeyUsagePoint, ApiKeyUsageSummary } from '../../types.ts';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Zap,
  Clock,
  ShieldCheck,
  AlertCircle,
  Flame,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface ApiKeyUsageChartProps {
  keys: ApiKey[];
  onRefreshKeys?: () => void;
}

type ChartMetric = 'volume' | 'latency' | 'comparison';
type TimePeriod = '24h' | '7d' | '30d';

const KEY_COLORS = [
  { stroke: '#3b82f6', fill: '#3b82f6' }, // Blue
  { stroke: '#10b981', fill: '#10b981' }, // Emerald
  { stroke: '#8b5cf6', fill: '#8b5cf6' }, // Purple
  { stroke: '#f59e0b', fill: '#f59e0b' }, // Amber
  { stroke: '#06b6d4', fill: '#06b6d4' }, // Cyan
  { stroke: '#ec4899', fill: '#ec4899' }, // Pink
];

export const ApiKeyUsageChart: React.FC<ApiKeyUsageChartProps> = ({ keys, onRefreshKeys }) => {
  const [period, setPeriod] = useState<TimePeriod>('24h');
  const [metric, setMetric] = useState<ChartMetric>('volume');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('all');
  const [analyticsData, setAnalyticsData] = useState<ApiKeyUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = async (p: TimePeriod = period) => {
    try {
      setIsRefreshing(true);
      const data = await api.getKeyUsageAnalytics(p);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to load key usage analytics:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(period);
  }, [period]);

  const activeKeyMap = useMemo(() => {
    const map = new Map<string, ApiKey>();
    keys.forEach((k) => map.set(k.id, k));
    return map;
  }, [keys]);

  // Filtered timeline data if a single key is selected
  const chartPoints = useMemo(() => {
    if (!analyticsData?.timeSeries) return [];
    if (selectedKeyId === 'all') return analyticsData.timeSeries;

    return analyticsData.timeSeries.map((pt) => {
      const keyCount = Number(pt[selectedKeyId]) || 0;
      const throttledRatio = pt.throttledCount > 0 ? (keyCount / Math.max(1, pt.totalRequests)) : 0;
      const keyThrottled = Math.round(pt.throttledCount * throttledRatio);
      return {
        ...pt,
        totalRequests: keyCount,
        successCount: Math.max(0, keyCount - keyThrottled),
        throttledCount: keyThrottled,
      };
    });
  }, [analyticsData, selectedKeyId]);

  const selectedSummary = useMemo(() => {
    if (!analyticsData?.summaries) return null;
    if (selectedKeyId === 'all') return null;
    return analyticsData.summaries.find((s) => s.keyId === selectedKeyId) || null;
  }, [analyticsData, selectedKeyId]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-2xl border border-white/15 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-xl text-xs space-y-2 min-w-[200px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-medium text-slate-300">
            <span>{label}</span>
            <span className="text-[10px] font-mono text-slate-500">{period}</span>
          </div>

          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={`tip_${index}`} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke }} />
                  {entry.name}:
                </span>
                <span className="font-mono font-bold text-white">
                  {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                  {metric === 'latency' ? ' ms' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 sm:p-7 backdrop-blur-2xl shadow-2xl space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">Usage Statistics & API Traffic</h2>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/20">
                  Real-time Ingress
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Visualizing API call volume over time, latency distributions, and throttling thresholds per key.
              </p>
            </div>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Key Selector Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-white">All Keys Combined</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id} className="bg-slate-900 text-white">
                  {k.name} ({k.keyPrefix})
                </option>
              ))}
            </select>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/80 p-1">
            <button
              onClick={() => setMetric('volume')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                metric === 'volume'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="h-3 w-3" />
              <span>Volume</span>
            </button>

            <button
              onClick={() => setMetric('latency')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                metric === 'latency'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>Latency</span>
            </button>

            <button
              onClick={() => setMetric('comparison')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                metric === 'comparison'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Keys</span>
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/80 p-1">
            {(['24h', '7d', '30d'] as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold font-mono transition-all ${
                  period === p
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchAnalytics(period)}
            className="flex items-center justify-center h-8 w-8 rounded-xl border border-white/10 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Refresh analytics data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
            Total Requests
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-white">
            {selectedSummary
              ? selectedSummary.totalRequests.toLocaleString()
              : (analyticsData?.totalVolume || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500 font-mono">Window: {period.toUpperCase()}</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Success Rate
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400">
            {selectedSummary
              ? `${selectedSummary.successRate}%`
              : `${analyticsData?.overallSuccessRate || 99.4}%`}
          </div>
          <p className="text-[10px] text-emerald-500/80 font-mono">Zero Critical Faults</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            429 Rate Throttled
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-amber-300">
            {selectedSummary
              ? selectedSummary.throttledRequests.toLocaleString()
              : (analyticsData?.overallThrottledCount || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500 font-mono">Protected by Rate Limit</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 space-y-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            Avg Latency
          </span>
          <div className="text-lg sm:text-xl font-bold font-mono text-cyan-300">
            {selectedSummary
              ? `${selectedSummary.avgLatencyMs} ms`
              : `${analyticsData?.overallAvgLatencyMs || 22} ms`}
          </div>
          <p className="text-[10px] text-slate-500 font-mono">Edge Ingress Target</p>
        </div>
      </div>

      {/* Main Recharts Area Chart Container */}
      <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 sm:p-5">
        <div className="h-[280px] sm:h-[320px] w-full">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400 mr-2" />
              Loading chart telemetry data...
            </div>
          ) : metric === 'volume' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="volSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="volThrottled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', opacity: 0.4 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconType="circle"
                />
                <Area
                  type="monotone"
                  dataKey="successCount"
                  name="Successful Requests (200 OK)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#volSuccess)"
                />
                <Area
                  type="monotone"
                  dataKey="throttledCount"
                  name="Throttled (429 Rate Limit)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#volThrottled)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : metric === 'latency' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', opacity: 0.4 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  unit="ms"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="latencyMs"
                  name="Average Response Time"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#06b6d4' }}
                />
                <Line
                  type="monotone"
                  dataKey="p95LatencyMs"
                  name="P95 Latency Threshold"
                  stroke="#ec4899"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ec4899' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', opacity: 0.4 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconType="circle"
                />
                {keys.map((k, index) => {
                  const palette = KEY_COLORS[index % KEY_COLORS.length];
                  return (
                    <Area
                      key={k.id}
                      type="monotone"
                      dataKey={k.id}
                      name={k.name}
                      stackId="1"
                      stroke={palette.stroke}
                      fill={palette.fill}
                      fillOpacity={0.4}
                      strokeWidth={1.5}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-Key Breakdown Cards & Endpoints */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Per-Key Resource & Endpoint Telemetry</span>
          <span>{analyticsData?.summaries.length || 0} active keys monitored</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {(analyticsData?.summaries || []).map((summary, idx) => {
            const keyColor = KEY_COLORS[idx % KEY_COLORS.length];
            const isSelected = selectedKeyId === summary.keyId;

            return (
              <div
                key={summary.keyId}
                onClick={() => setSelectedKeyId(isSelected ? 'all' : summary.keyId)}
                className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-950/20 shadow-lg shadow-blue-950/40'
                    : 'border-white/5 bg-slate-900/40 hover:border-white/15 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: keyColor.stroke }} />
                      <span className="text-xs font-bold text-white truncate max-w-[150px]">{summary.keyName}</span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500">{summary.keyPrefix}</p>
                  </div>

                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold border ${
                      summary.environment === 'live'
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {summary.environment}
                  </span>
                </div>

                {/* Quota Progress Bar */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Monthly Quota Used</span>
                    <strong className="text-slate-200">{summary.quotaUsedPercent}%</strong>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${summary.quotaUsedPercent}%`,
                        backgroundColor: summary.quotaUsedPercent > 80 ? '#f43f5e' : keyColor.stroke,
                      }}
                    />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="mt-3 pt-2.5 border-t border-white/5 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-500 block">Total Reqs</span>
                    <span className="font-mono font-bold text-slate-200">{summary.totalRequests.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Success</span>
                    <span className="font-mono font-bold text-emerald-400">{summary.successRate}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Peak RPM</span>
                    <span className="font-mono font-bold text-indigo-300">{summary.peakRpm}</span>
                  </div>
                </div>

                {/* Top Endpoints */}
                <div className="mt-2.5 pt-2 border-t border-white/5 space-y-1">
                  <span className="text-[9px] uppercase font-semibold text-slate-500 tracking-wider block">Top Endpoint Ingress</span>
                  {summary.topEndpoints.slice(0, 2).map((ep, eIdx) => (
                    <div key={eIdx} className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="truncate max-w-[140px]">{ep.endpoint}</span>
                      <span className="text-slate-300 font-semibold">{ep.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
