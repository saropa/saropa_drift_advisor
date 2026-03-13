/**
 * Shared HTML renderers for table and chart widgets.
 */

import { escapeHtml, type ChartType } from '../dashboard-types';

const esc = escapeHtml;

/** Render a small table (up to 10 rows) with optional "more rows" note. */
export function renderMiniTable(columns: string[], rows: unknown[][]): string {
  if (rows.length === 0) {
    return '<p class="empty-data">No data</p>';
  }
  const headerCells = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const bodyRows = rows.slice(0, 10).map((row) => {
    const cells = row.map((cell) => `<td>${esc(String(cell ?? ''))}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="mini-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>${rows.length > 10 ? `<p class="more-rows">+${rows.length - 10} more rows</p>` : ''}`;
}

/** Render an SVG chart (bar, pie, or line). */
export function renderSvgChart(
  data: { columns: string[]; rows: unknown[][] },
  chartType: ChartType,
): string {
  if (!data.rows || data.rows.length === 0) {
    return '<p class="empty-data">No chart data</p>';
  }

  const labels = data.rows.map((r) => String(r[0] ?? ''));
  const values = data.rows.map((r) => Number(r[1]) || 0);
  const maxVal = Math.max(...values, 1);

  if (chartType === 'bar') {
    const barWidth = Math.min(40, 200 / values.length);
    const gap = 4;
    const chartWidth = values.length * (barWidth + gap);
    const chartHeight = 100;

    const bars = values.map((v, i) => {
      const height = (v / maxVal) * (chartHeight - 20);
      const x = i * (barWidth + gap);
      const y = chartHeight - height - 15;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="var(--vscode-charts-blue)" />
        <text x="${x + barWidth / 2}" y="${chartHeight - 2}" text-anchor="middle" font-size="8" fill="var(--vscode-foreground)">${esc(labels[i].substring(0, 6))}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="chart-svg">${bars}</svg>`;
  }

  if (chartType === 'pie') {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = [
      'var(--vscode-charts-blue)',
      'var(--vscode-charts-green)',
      'var(--vscode-charts-yellow)',
      'var(--vscode-charts-orange)',
      'var(--vscode-charts-red)',
      'var(--vscode-charts-purple)',
    ];
    let cumulativeAngle = 0;
    const slices = values.map((v, i) => {
      const angle = (v / total) * 360;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;
      const largeArc = angle > 180 ? 1 : 0;
      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (startAngle + angle - 90) * Math.PI / 180;
      const x1 = 50 + 40 * Math.cos(startRad);
      const y1 = 50 + 40 * Math.sin(startRad);
      const x2 = 50 + 40 * Math.cos(endRad);
      const y2 = 50 + 40 * Math.sin(endRad);
      const color = colors[i % colors.length];
      return `<path d="M50,50 L${x1},${y1} A40,40 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" />`;
    }).join('');

    return `<svg viewBox="0 0 100 100" class="chart-svg pie-chart">${slices}</svg>`;
  }

  if (chartType === 'line') {
    const chartWidth = 200;
    const chartHeight = 100;
    const stepX = values.length > 1 ? (chartWidth - 20) / (values.length - 1) : 0;
    const points = values.map((v, i) => {
      const x = 10 + i * stepX;
      const y = chartHeight - 15 - ((v / maxVal) * (chartHeight - 30));
      return `${x},${y}`;
    }).join(' ');

    return `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="chart-svg">
      <polyline points="${points}" fill="none" stroke="var(--vscode-charts-blue)" stroke-width="2" />
      ${values.map((v, i) => {
        const x = 10 + i * stepX;
        const y = chartHeight - 15 - ((v / maxVal) * (chartHeight - 30));
        return `<circle cx="${x}" cy="${y}" r="3" fill="var(--vscode-charts-blue)" />`;
      }).join('')}
    </svg>`;
  }

  return '<p class="empty-data">Unknown chart type</p>';
}
