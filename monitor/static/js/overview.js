const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const OV_CHANNEL_PALETTE = ['#a78bfa', '#fb923c', '#38bdf8', '#f472b6', '#4ade80', '#facc15'];

let OV_CHANNEL_INFO = {};

async function loadOverviewChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  OV_CHANNEL_INFO = {};
  let paletteIdx = 0;
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      OV_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-whatsapp', color: '#34d399' };
    } else if (c.channel_key === 'email') {
      OV_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: 'bi-envelope', color: '#29a3ff' };
    } else {
      OV_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots', color: OV_CHANNEL_PALETTE[paletteIdx % OV_CHANNEL_PALETTE.length] };
      paletteIdx++;
    }
  });
  OV_CHANNEL_INFO.other = { label: 'Outros', classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots', color: '#9296b8' };
}

const OV_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-exclamation-triangle-fill', order: 1 }, 
  high: { label: 'Alta', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-arrow-up-circle-fill', order: 2 }, 
  medium: { label: 'Média', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill', order: 3 }, 
  low: { label: 'Baixa', classes: 'text-muted bg-border/30 border-border', icon: 'bi-arrow-down-circle-fill', order: 4 }, 
  none: { label: 'Nenhuma', classes: 'text-muted bg-border/30 border-border', icon: 'bi-info-circle-fill', order: 5 } 
};

function buildOverviewRow(labelHtml, value, total, barColorClass = 'bg-accent') {
  if (!total) {
    return `<tr><td colspan="3"><div class="p-4 text-center text-muted"><i class="bi bi-inbox text-lg block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>`;
  }
  const pct = (value / total) * 100;
  return `
    <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-3 py-2.5 font-medium truncate text-[0.8rem]">${labelHtml}</td>
      <td class="px-3 py-2.5 text-right w-[60px]">
        <span class="inline-flex items-center px-1.5 py-0.5 text-[0.75rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${value || 0}</span>
      </td>
      <td class="px-3 py-2.5 w-full align-middle pl-4">
        <div class="flex justify-between items-center mb-1 text-[0.7rem]">
          <span></span>
          <span class="text-muted font-bold">${pct.toFixed(1)}%</span>
        </div>
        <div class="w-full bg-panel-light rounded-full h-1.5 overflow-hidden border border-border/50">
          <div style="width: ${pct}%;" class="h-full rounded-full transition-all duration-1000 ${barColorClass}"></div>
        </div>
      </td>
    </tr>
  `;
}

async function renderOverviewData(days) {
  const [kpis, daily, hourly, weekday, reopenRate, newVsReturning, priorityDist, channelDist, companyDist, teamDist] = await Promise.all([
    fetch(`/monitor/api/overview?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/overview/daily?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/overview/hourly?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/overview/weekday?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/overview/reopen-rate?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/clients/new-vs-returning?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/overview/priority-distribution?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/overview/channel-distribution?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/overview/company-distribution?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/teams/distribution?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  document.getElementById('ov-total-resolved').textContent = kpis.total_resolved ?? 0;
  document.getElementById('ov-total-open').textContent = kpis.total_open ?? 0;
  document.getElementById('ov-total-cancelled').textContent = kpis.total_cancelled ?? 0;

  const reopenPct = (kpis.total_resolved && reopenRate.reopened) ? ((reopenRate.reopened / kpis.total_resolved) * 100).toFixed(1) : '0.0';
  document.getElementById('ov-reopen-rate').textContent = `${reopenPct}%`;

  document.getElementById('ov-new-clients').textContent = newVsReturning.new_clients ?? 0;
  document.getElementById('ov-returning-clients').textContent = newVsReturning.returning_clients ?? 0;

  const dailyChannelKeys = Object.keys(OV_CHANNEL_INFO);
  const maxDaily = Math.max(
    ...daily.map(r => dailyChannelKeys.reduce((sum, k) => sum + (r[`created_${k}`] || 0), 0)),
    ...daily.map(r => r.resolved || 0), 0
  );

  const dailyCreatedDatasets = dailyChannelKeys.map(k => ({
    label: `Criadas ${OV_CHANNEL_INFO[k].label}`,
    data: daily.map(r => r[`created_${k}`] || 0),
    borderColor: OV_CHANNEL_INFO[k].color,
    backgroundColor: OV_CHANNEL_INFO[k].color,
    tension: 0.3, fill: false, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4,
  }));

  renderChart('chart-ov-daily', {
    type: 'line',
    data: {
      labels: daily.map(r => new Date(r.day).toLocaleDateString('pt-BR')),
      datasets: [
        ...dailyCreatedDatasets,
        { label: 'Resolvidas', data: daily.map(r => r.resolved), borderColor: '#ffc247', backgroundColor: '#ffc247', tension: 0.3, fill: false, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      // Interação melhorada para exibir tooltip passando o mouse no eixo Y do dia inteiro
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true, padding: 10, font: { size: 10 } } } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 9 } }, suggestedMax: maxDaily + Math.ceil(maxDaily * 0.2) + 1 },
      },
    },
  });

  const hourlyFull = Array.from({ length: 24 }, (_, i) => {
    const found = hourly.find(r => r.hour === i);
    return found ? found.total : 0;
  });

  renderChart('chart-ov-hourly', {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + 'h'),
      datasets: [{ label: 'Conversas criadas', data: hourlyFull, backgroundColor: '#29a3ff', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.6 }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 9 } } },
      },
    },
  });

  const weekdayFull = Array.from({ length: 7 }, (_, i) => {
    const found = weekday.find(r => r.weekday === i);
    return found ? found.total : 0;
  });

  renderChart('chart-ov-weekday', {
    type: 'bar',
    data: {
      labels: WEEKDAY_LABELS,
      datasets: [{ label: 'Conversas criadas', data: weekdayFull, backgroundColor: '#a679ff', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.5 }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 9 } } },
      },
    },
  });

  const emptyRow = '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-1"></i><span class="text-sm">Sem dados</span></div></td></tr>';

  const totalPriority = priorityDist.reduce((acc, r) => acc + r.total, 0);
  const sortedPriority = [...priorityDist].sort((a, b) => {
    const oa = (OV_PRIORITY_MAP[a.priority] || OV_PRIORITY_MAP.none).order;
    const ob = (OV_PRIORITY_MAP[b.priority] || OV_PRIORITY_MAP.none).order;
    return oa - ob;
  });
  document.getElementById('tb-ov-priority').innerHTML = sortedPriority.length ? sortedPriority.map(p => {
    const info = OV_PRIORITY_MAP[p.priority] || OV_PRIORITY_MAP.none;
    const label = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, p.total, totalPriority, 'bg-accent');
  }).join('') : emptyRow;

  const channelKeys = Object.keys(OV_CHANNEL_INFO);
  const totalChannel = channelKeys.reduce((acc, k) => acc + (channelDist[k] || 0), 0);
  document.getElementById('tb-ov-channel').innerHTML = totalChannel ? channelKeys.map(k => {
    const info = OV_CHANNEL_INFO[k] || OV_CHANNEL_INFO.other;
    const label = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, channelDist[k] || 0, totalChannel, 'bg-accent');
  }).join('') : emptyRow;

  const totalTeam = teamDist.reduce((acc, r) => acc + r.created_count, 0);
  document.getElementById('tb-ov-team').innerHTML = teamDist.length ? [...teamDist].sort((a, b) => b.created_count - a.created_count).map(t => 
    buildOverviewRow(`<span class="text-text text-[0.8rem]"><i class="bi bi-people mr-1.5 text-muted"></i>${TEAM_NAMES[t.team_id] || `Time ${t.team_id}`}</span>`, t.created_count, totalTeam, 'bg-accent')
  ).join('') : emptyRow;

  const totalCompany = companyDist.reduce((acc, c) => acc + c.total, 0);
  document.getElementById('tb-ov-companies').innerHTML = companyDist.length ? companyDist.map(c => 
    buildOverviewRow(`<span class="text-text text-[0.8rem]"><i class="bi bi-building mr-1.5 text-muted"></i>${c.company_name}</span>`, c.total, totalCompany, 'bg-accent')
  ).join('') : emptyRow;
}

Screens.overview = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <!-- Header & Date Filters -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent text-white shadow-sm glow-border"><i class="bi bi-grid-1x2"></i></div>
          <div>
            <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Visão Geral</h2>
            <p class="m-0 text-[0.9rem] text-muted">Métricas e acompanhamento do período</p>
          </div>
        </div>
        
        <div id="ov-date-filters" class="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
          <button id="btn-ov-7" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="7">7D</button>
          <button id="btn-ov-14" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="14">14D</button>
          <button id="btn-ov-30" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-accent bg-panel shadow-sm text-text glow-border" data-days="30">30D</button>
          <button id="btn-ov-90" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="90">90D</button>
          <button id="btn-ov-180" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="180">180D</button>
        </div>
      </div>

      <!-- Quick KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-blue/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-envelope-open text-[4rem] text-accent-blue"></i></div>
          <i class="bi bi-envelope-open text-2xl text-accent-blue mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Total Criadas</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-total-open">-</span>
        </div>
        
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-yellow/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-check2-circle text-[4rem] text-accent-yellow"></i></div>
          <i class="bi bi-check2-circle text-2xl text-accent-yellow mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Total Resolvidas</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-total-resolved">-</span>
        </div>
        
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm group relative overflow-hidden">
          <i class="bi bi-slash-circle text-2xl text-muted mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Total Canceladas</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-total-cancelled">-</span>
        </div>
        
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-red/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-arrow-repeat text-[4rem] text-accent-red"></i></div>
          <i class="bi bi-arrow-repeat text-2xl text-accent-red mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Reaberturas</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-reopen-rate">-</span>
        </div>
        
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-green/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-person-plus text-[4rem] text-accent-green"></i></div>
          <i class="bi bi-person-plus text-2xl text-accent-green mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Novos Clientes</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-new-clients">-</span>
        </div>
        
        <div class="bg-panel border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent/50 transition-colors group relative overflow-hidden">
           <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-people text-[4rem] text-accent"></i></div>
          <i class="bi bi-people text-2xl text-accent mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Recorrentes</span>
          <span class="text-2xl font-bold text-text relative z-10" id="ov-returning-clients">-</span>
        </div>
      </div>

      <!-- Trend Chart (Full Width) -->
      <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col">
        <div class="px-5 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
          <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-graph-up text-accent glow-text"></i> Tendência Geral</h3>
          <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
        </div>
        <div class="panel-content flex-col p-5 h-[280px]">
          <div class="relative flex-1 w-full h-full min-h-0">
            <canvas id="chart-ov-daily"></canvas>
          </div>
        </div>
      </div>

      <!-- Secondary Charts (Half/Half) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-clock text-accent-blue"></i> Padrão por Hora</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 w-full">
            <div class="relative w-full h-[220px]">
              <canvas id="chart-ov-hourly"></canvas>
            </div>
          </div>
        </div>
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-calendar-event text-purple-400"></i> Padrão por Dia</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 w-full">
            <div class="relative w-full h-[220px]">
              <canvas id="chart-ov-weekday"></canvas>
            </div>
          </div>
        </div>
      </div>

	  <!-- Breakdown Tables (Thirds) com alturas fixas e scrollbars -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[300px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-flag text-muted"></i> Por Prioridade</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Prioridade</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Volume</th>
                </tr>
              </thead>
              <tbody id="tb-ov-priority"></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[300px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-chat-square-dots text-muted"></i> Por Canal</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Canal</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Volume</th>
                </tr>
              </thead>
              <tbody id="tb-ov-channel"></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[300px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-muted"></i> Por Time</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Time</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Volume</th>
                </tr>
              </thead>
              <tbody id="tb-ov-team"></tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Volume por empresa (Full Width) -->
      <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
          <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-building text-muted"></i> Volume por Empresa</h3>
          <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
        </div>
        <div class="panel-content overflow-y-auto max-h-[300px] relative">
          <table class="w-full text-left table-fixed">
            <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
              <tr>
                <th class="px-5 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[40%] bg-panel">Empresa</th>
                <th class="px-5 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[80px] bg-panel">Total</th>
                <th class="px-5 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-6 bg-panel">Volume</th>
              </tr>
            </thead>
            <tbody id="tb-ov-companies"></tbody>
          </table>
        </div>
      </div>

    </div>
  `,
  load: async function () {
    let selectedDays = Number(localStorage.getItem('monitor-filter-days')) || 30;

    const initialBtnId = `btn-ov-${selectedDays}`;
    if (document.getElementById(initialBtnId)) {
        window.handleDateFilterClick('ov-date-filters', initialBtnId, 'monitor-filter-days');
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedDays = Number(btn.dataset.days);
        
        window.handleDateFilterClick('ov-date-filters', btn.id, 'monitor-filter-days');

        const content = document.getElementById('content');
        content.classList.add('opacity-50', 'pointer-events-none');

        await renderOverviewData(selectedDays);

        content.classList.remove('opacity-50', 'pointer-events-none');
      });
    });

    await loadOverviewChannelInfo();
    await renderOverviewData(selectedDays);
  }
};
