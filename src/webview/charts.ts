import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { BiProject, DisplayFormat, Visual, VisualData } from '../shared/project.js';
import type { WorkbenchState } from '../shared/state.js';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const instances: Array<{ chart: echarts.ECharts; observer: ResizeObserver }> = [];

export function disposeCharts(): void {
  for (const { chart, observer } of instances.splice(0)) {
    observer.disconnect();
    if (!chart.isDisposed()) chart.dispose();
  }
}

export function renderCharts(
  state: WorkbenchState,
  onCategoryClick: (visual: Visual, value: unknown) => void
): void {
  disposeCharts();
  const project = state.project;
  const report = project?.reports.find((item) => item.id === state.selectedReportId);
  const page = report?.pages.find((item) => item.id === state.selectedPageId);
  if (!project || !page) return;

  for (const visual of page.visuals) {
    if (['table', 'kpi', 'slicer'].includes(visual.type)) continue;
    const host = document.getElementById(`chart-${visual.id}`);
    const data = state.visualData.find((item) => item.visualId === visual.id);
    if (!host || !data || data.error) continue;
    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    chart.setOption(chartOptions(project, visual, data));
    chart.on('click', (event) => {
      if (visual.categoryField && visual.interactionMode !== 'none') onCategoryClick(visual, event.name);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);
    instances.push({ chart, observer });
  }
}

function chartOptions(project: BiProject, visual: Visual, data: VisualData): Record<string, unknown> {
  const categories = unique(data.rows.map((row) => row.category ?? 'NULL'));
  const seriesNames = visual.seriesField
    ? unique(data.rows.map((row) => row.series ?? 'NULL'))
    : [visual.title];
  const colors = visual.color
    ? [visual.color, ...project.theme.palette.filter((color) => color.toLowerCase() !== visual.color?.toLowerCase())]
    : project.theme.palette;
  const format = valueFormatter(project, visual);
  const background = visual.backgroundColor ?? project.theme.backgroundColor;
  const foreground = background ? contrastTextColor(background) : css('--vscode-foreground', '#d7dce2');
  const muted = background ? foreground === '#111827' ? '#4b5563' : '#cbd5e1' : css('--vscode-descriptionForeground', '#9ba2ad');
  const gridColor = background ? foreground === '#111827' ? '#d1d5db' : '#3a4250' : css('--vscode-panel-border', '#3a3f47');
  const legend = legendOptions(visual, seriesNames.length > 1 || visual.type === 'pie' || visual.type === 'donut', foreground);
  const base = {
    animationDuration: 250,
    backgroundColor: background ?? 'transparent',
    color: colors,
    textStyle: {
      color: foreground,
      fontFamily: css('--vscode-font-family', 'Segoe UI')
    },
    tooltip: {
      trigger: visual.type === 'pie' || visual.type === 'donut' ? 'item' as const : 'axis' as const,
      valueFormatter: (value: unknown) => format(Number(value ?? 0))
    },
    aria: {
      enabled: true,
      description: visual.description || `${visual.title}. ${data.rows.length} data points.`
    },
    legend
  };

  if (visual.type === 'pie' || visual.type === 'donut') {
    return {
      ...base,
      series: [{
        name: visual.title,
        type: 'pie',
        radius: visual.type === 'donut' ? ['42%', '70%'] : '70%',
        data: data.rows.map((row) => ({ name: row.category ?? 'NULL', value: Number(row.value ?? 0) })),
        label: {
          show: visual.showLabels ?? true,
          color: foreground,
          formatter: (parameters: { name?: string; value?: unknown }) => `${parameters.name ?? ''}: ${format(Number(parameters.value ?? 0))}`
        }
      }]
    };
  }

  const horizontal = visual.type === 'horizontalBar';
  const seriesType = visual.type === 'line' || visual.type === 'area'
    ? 'line'
    : visual.type === 'scatter' ? 'scatter' : 'bar';
  const categoryAxis = {
    type: 'category' as const,
    name: displayFieldName(project, visual.tableId, visual.categoryField),
    nameLocation: 'middle' as const,
    nameGap: horizontal ? 52 : 28,
    data: categories,
    axisLabel: { color: muted, hideOverlap: true }
  };
  const valueAxis = {
    type: 'value' as const,
    name: visual.measureId
      ? project.measures.find((measure) => measure.id === visual.measureId)?.name ?? ''
      : displayFieldName(project, visual.tableId, visual.valueField),
    nameLocation: 'middle' as const,
    nameGap: horizontal ? 28 : 52,
    axisLabel: {
      color: muted,
      formatter: (value: number) => format(value)
    },
    splitLine: { lineStyle: { color: gridColor } }
  };
  const chartSeries = seriesNames.map((seriesName) => ({
    name: String(seriesName),
    type: seriesType,
    data: categories.map((category) => {
      const row = data.rows.find((candidate) => String(candidate.category ?? 'NULL') === String(category)
        && (!visual.seriesField || String(candidate.series ?? 'NULL') === String(seriesName)));
      return row ? Number(row.value ?? 0) : null;
    }),
    smooth: seriesType === 'line' && Boolean(visual.smooth),
    areaStyle: visual.type === 'area' ? { opacity: 0.22 } : undefined,
    label: {
      show: Boolean(visual.showLabels),
      color: foreground,
      formatter: (parameters: { value?: unknown }) => format(Number(parameters.value ?? 0))
    },
    emphasis: { focus: 'series' }
  }));

  return {
    ...base,
    grid: {
      left: visual.legendPosition === 'left' && visual.showLegend ? 118 : horizontal ? 72 : 58,
      right: visual.legendPosition === 'right' && visual.showLegend ? 110 : 22,
      top: visual.legendPosition === 'top' && visual.showLegend ? 48 : 24,
      bottom: visual.legendPosition === 'bottom' && visual.showLegend ? 62 : 46,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel'
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: chartSeries
  };
}

function legendOptions(visual: Visual, relevant: boolean, foreground: string): Record<string, unknown> {
  if (!(visual.showLegend ?? relevant)) {
    return { show: false };
  }
  const position = visual.legendPosition ?? 'bottom';
  const base = {
    show: true,
    textStyle: { color: foreground }
  };
  switch (position) {
    case 'top': return { ...base, top: 0, left: 'center' };
    case 'right': return { ...base, right: 0, top: 'middle', orient: 'vertical' };
    case 'left': return { ...base, left: 0, top: 'middle', orient: 'vertical' };
    case 'bottom': return { ...base, bottom: 0, left: 'center' };
  }
}

function contrastTextColor(background: string): '#111827' | '#f3f4f6' {
  const red = Number.parseInt(background.slice(1, 3), 16) / 255;
  const green = Number.parseInt(background.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(background.slice(5, 7), 16) / 255;
  const linear = [red, green, blue].map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  return luminance > 0.45 ? '#111827' : '#f3f4f6';
}

function displayFieldName(project: BiProject, tableId: string, field?: string): string {
  if (!field) return '';
  return project.tables.find((table) => table.id === tableId)?.columns.find((column) => column.name === field)?.displayName ?? field;
}

function valueFormatter(project: BiProject, visual: Visual): (value: number) => string {
  const measure = project.measures.find((candidate) => candidate.id === visual.measureId);
  const column = project.tables.find((table) => table.id === visual.tableId)?.columns.find((candidate) => candidate.name === visual.valueField);
  const configured = visual.numberFormat ?? 'auto';
  const format: DisplayFormat = configured !== 'auto'
    ? configured
    : measure?.format === 'text' ? 'text' : measure?.format ?? column?.format ?? 'number';
  const decimals = visual.decimals ?? (format === 'integer' ? 0 : 2);
  if (format === 'currency') {
    return (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: visual.currency ?? 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  }
  if (format === 'percent') {
    return (value) => new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  }
  if (format === 'integer') {
    return (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  }
  if (format === 'text') {
    return (value) => String(value);
  }
  return (value) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

function unique(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = String(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function css(variable: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
}
