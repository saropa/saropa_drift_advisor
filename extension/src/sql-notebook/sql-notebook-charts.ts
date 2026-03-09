/**
 * Inline JS for rendering a simple SVG bar chart from query results
 * inside the SQL Notebook webview.
 *
 * Injected into the HTML scaffold by {@link getNotebookHtml}.
 */
export function getChartsJs(): string {
  return `
  // --- Chart Rendering ---

  var chartVisible = false;

  document.getElementById('btn-chart').addEventListener('click', toggleChart);

  function toggleChart() {
    chartVisible = !chartVisible;
    var tab = getActiveTab();
    if (chartVisible && tab && tab.results && tab.columns) {
      renderChart(tab);
    } else {
      removeChart();
    }
  }

  function renderChart(tab) {
    var numericCols = [];
    for (var i = 0; i < tab.columns.length; i++) {
      if (tab.results.length > 0 && typeof tab.results[0][i] === 'number') {
        numericCols.push(i);
      }
    }
    if (numericCols.length === 0) {
      chartVisible = false;
      return;
    }

    var labelCol = 0;
    var valueCol = numericCols[0] === 0 && numericCols.length > 1
      ? numericCols[1] : numericCols[0];

    var data = [];
    var limit = Math.min(tab.results.length, 20);
    for (var i = 0; i < limit; i++) {
      var row = tab.results[i];
      data.push({
        label: String(row[labelCol] != null ? row[labelCol] : ''),
        value: Number(row[valueCol]) || 0
      });
    }

    var maxVal = 1;
    for (var j = 0; j < data.length; j++) {
      var abs = Math.abs(data[j].value);
      if (abs > maxVal) maxVal = abs;
    }

    var barWidth = 30;
    var gap = 8;
    var chartHeight = 200;
    var chartWidth = data.length * (barWidth + gap) + gap;
    var labelHeight = 60;

    var svg = '<svg width="' + chartWidth + '" height="' + (chartHeight + labelHeight) + '" xmlns="http://www.w3.org/2000/svg">';

    for (var k = 0; k < data.length; k++) {
      var d = data[k];
      var x = gap + k * (barWidth + gap);
      var h = (Math.abs(d.value) / maxVal) * (chartHeight - 20);
      var y = chartHeight - h;
      var color = d.value >= 0
        ? 'var(--vscode-charts-blue, #4fc1ff)'
        : 'var(--vscode-errorForeground, #f14c4c)';

      svg += '<rect x="' + x + '" y="' + y + '" width="' + barWidth
        + '" height="' + h + '" fill="' + color + '" rx="2"/>';

      svg += '<text x="' + (x + barWidth / 2) + '" y="' + (y - 4)
        + '" text-anchor="middle" font-size="11" fill="var(--vscode-foreground)">'
        + d.value + '</text>';

      var labelText = d.label.length > 10
        ? d.label.substring(0, 10) + '..' : d.label;
      svg += '<text x="' + (x + barWidth / 2) + '" y="' + (chartHeight + 15)
        + '" text-anchor="end" font-size="10" fill="var(--vscode-descriptionForeground)"'
        + ' transform="rotate(-45 ' + (x + barWidth / 2) + ' ' + (chartHeight + 15) + ')">'
        + esc(labelText) + '</text>';
    }

    svg += '</svg>';

    var existing = document.getElementById('chart-area');
    if (existing) existing.remove();

    var chartDiv = document.createElement('div');
    chartDiv.id = 'chart-area';
    chartDiv.className = 'chart-area';
    chartDiv.innerHTML = '<h4>' + esc(tab.columns[valueCol])
      + ' by ' + esc(tab.columns[labelCol]) + '</h4>' + svg;

    var area = resultArea();
    area.insertBefore(chartDiv, area.firstChild);
  }

  function removeChart() {
    var existing = document.getElementById('chart-area');
    if (existing) existing.remove();
    chartVisible = false;
  }
`;
}
