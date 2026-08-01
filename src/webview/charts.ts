import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { Visual } from '../shared/project.js';
import type { WorkbenchState } from '../shared/state.js';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const instances: echarts.ECharts[] = [];

export function disposeCharts(): void {
  for (const instance of instances.splice(0)) {
    instance.dispose();
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
  if (!page) return;

  for (const visual of page.visuals) {
    if (['table', 'kpi', 'slicer'].includes(visual.type)) continue;
    const host = document.getElementById(`chart-${visual.id}`);
    const data = state.visualData.find((item) => item.visualId === visual.id);
    if (!host || !data || data.error) continue;
    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    instances.push(chart);
    const categories = data.rows.map((row) => row.category ?? 'NULL');
    const values = data.rows.map((row) => Number(row.value ?? 0));
    const base = {
      animationDuration: 250,
      color: ['#5b7cfa', '#38b2ac', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981'],
      textStyle: { color: css('--vscode-foreground', '#d7dce2'), fontFamily: css('--vscode-font-family', 'Segoe UI') },
      tooltip: { trigger: 'item' as const },
      aria: { enabled: true, description: visual.title }
    };
    if (visual.type === 'pie' || visual.type === 'donut') {
      chart.setOption({ ...base, legend: { bottom: 0, textStyle: { color: css('--vscode-foreground', '#d7dce2') } }, series: [{ type: 'pie', radius: visual.type === 'donut' ? ['42%', '70%'] : '70%', data: categories.map((name, index) => ({ name, value: values[index] ?? 0 })), label: { color: css('--vscode-foreground', '#d7dce2') } }] });
    } else if (visual.type === 'scatter') {
      chart.setOption({ ...base, grid: { left: 48, right: 18, top: 18, bottom: 40 }, xAxis: { type: 'category', data: categories, axisLabel: { color: css('--vscode-descriptionForeground', '#9ba2ad'), hideOverlap: true } }, yAxis: { type: 'value', axisLabel: { color: css('--vscode-descriptionForeground', '#9ba2ad') }, splitLine: { lineStyle: { color: css('--vscode-panel-border', '#3a3f47') } } }, series: [{ type: 'scatter', data: values, symbolSize: 12 }] });
    } else {
      const horizontal = visual.type === 'horizontalBar';
      const seriesType = visual.type === 'line' || visual.type === 'area' ? 'line' : 'bar';
      const categoryAxis = { type: 'category' as const, data: categories, axisLabel: { color: css('--vscode-descriptionForeground', '#9ba2ad'), hideOverlap: true } };
      const valueAxis = { type: 'value' as const, axisLabel: { color: css('--vscode-descriptionForeground', '#9ba2ad') }, splitLine: { lineStyle: { color: css('--vscode-panel-border', '#3a3f47') } } };
      chart.setOption({ ...base, grid: { left: 52, right: 18, top: 18, bottom: 46, containLabel: true }, xAxis: horizontal ? valueAxis : categoryAxis, yAxis: horizontal ? categoryAxis : valueAxis, series: [{ type: seriesType, data: values, smooth: seriesType === 'line', areaStyle: visual.type === 'area' ? { opacity: 0.22 } : undefined, emphasis: { focus: 'series' } }] });
    }
    chart.on('click', (event) => {
      if (visual.categoryField) onCategoryClick(visual, event.name);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);
    chart.on('dispose', () => observer.disconnect());
  }
}

function css(variable: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
}
