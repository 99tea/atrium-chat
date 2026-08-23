const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const OV_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

const OV_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill', order: 1 }, 
  high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill', order: 2 }, 
  medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill', order: 3 }, 
  low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill', order: 4 }, 
  none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill', order: 5 } 
};

// Layout mais limpo e condensado para as barras de progresso (Bullet Chart inline)
function buildOverviewRow(labelHtml, value, total, barColor = 'var(--accent)') {
  if (!total) {
    return `<tr><td colspan="3"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>`;
  }
  const pct = (value / total) * 100;
  return `
    <tr>
      <td style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${labelHtml}</td>
      <td style="text-align: right; width: 60px; padding-right: 16px;">
        <span class="badge badge-neutral" style="font-size: 0.8rem;">${value || 0}</span>
      </td>
      <td style="width: 100%; vertical-align: middle;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 0.75rem;">
          <span></span>
          <span style="color: var(--muted); font-weight: 600;">${pct.toFixed(1)}%</span>
        </div>
        <div style="width: 100%; background: var(--bg); border-radius: 3px; height: 6px; overflow: hidden; border: 1px solid var(--border);">
          <div style="width: ${pct}%; background: ${barColor}; height: 100%; border-radius: 3px; transition: width 1s ease-in-out;"></div>
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

  const maxDaily = Math.max(
    ...daily.map(r => (r.created_whatsapp || 0) + (r.created_email || 0) + (r.created_other || 0)),
    ...daily.map(r => r.resolved || 0), 0
  );

  renderChart('chart-ov-daily', {
    type: 'line',
    data: {
      labels: daily.map(r => new Date(r.day).toLocaleDateString('pt-BR')),
      datasets: [
        { label: 'Criadas WhatsApp', data: daily.map(r => r.created_whatsapp), borderColor: '#34d399', backgroundColor: '#34d399', tension: 0.3, fill: false, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
        { label: 'Criadas E-mail', data: daily.map(r => r.created_email), borderColor: '#29a3ff', backgroundColor: '#29a3ff', tension: 0.3, fill: false, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
        { label: 'Outros', data: daily.map(r => r.created_other), borderColor: '#9296b8', backgroundColor: '#9296b8', tension: 0.3, fill: false, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
        { label: 'Resolvidas', data: daily.map(r => r.resolved), borderColor: '#ffc247', backgroundColor: '#ffc247', tension: 0.3, fill: false, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          position: 'top', 
          align: 'end',
          labels: { boxWidth: 10, usePointStyle: true, padding: 16, font: { size: 11 } } 
        } 
      },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } }, suggestedMax: maxDaily + Math.ceil(maxDaily * 0.2) + 1 },
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
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } } },
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
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } } },
      },
    },
  });

  const emptyRow = '<tr><td colspan="3"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>';

  const totalPriority = priorityDist.reduce((acc, r) => acc + r.total, 0);
  const sortedPriority = [...priorityDist].sort((a, b) => {
    const oa = (OV_PRIORITY_MAP[a.priority] || OV_PRIORITY_MAP.none).order;
    const ob = (OV_PRIORITY_MAP[b.priority] || OV_PRIORITY_MAP.none).order;
    return oa - ob;
  });
  document.getElementById('tb-ov-priority').innerHTML = sortedPriority.length ? sortedPriority.map(p => {
    const info = OV_PRIORITY_MAP[p.priority] || OV_PRIORITY_MAP.none;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, p.total, totalPriority, 'var(--accent)');
  }).join('') : emptyRow;

  const channelKeys = ['whatsapp', 'email', 'other'];
  const totalChannel = channelKeys.reduce((acc, k) => acc + (channelDist[k] || 0), 0);
  document.getElementById('tb-ov-channel').innerHTML = totalChannel ? channelKeys.map(k => {
    const info = OV_CHANNEL_MAP[k] || OV_CHANNEL_MAP.other;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, channelDist[k] || 0, totalChannel, 'var(--accent)');
  }).join('') : emptyRow;

  const totalTeam = teamDist.reduce((acc, r) => acc + r.created_count, 0);
  document.getElementById('tb-ov-team').innerHTML = teamDist.length ? [...teamDist].sort((a, b) => b.created_count - a.created_count).map(t => 
    buildOverviewRow(`<span style="color: var(--text);"><i class="bi bi-people" style="margin-right: 6px; color: var(--muted);"></i>${TEAM_NAMES[t.team_id] || `Time ${t.team_id}`}</span>`, t.created_count, totalTeam, 'var(--accent)')
  ).join('') : emptyRow;

  const totalCompany = companyDist.reduce((acc, c) => acc + c.total, 0);
  document.getElementById('tb-ov-companies').innerHTML = companyDist.length ? companyDist.map(c => 
    buildOverviewRow(`<span style="color: var(--text);"><i class="bi bi-building" style="margin-right: 6px; color: var(--muted);"></i>${c.company_name}</span>`, c.total, totalCompany, 'var(--accent)')
  ).join('') : emptyRow;
}

Screens.overview = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent);">
        <i class="bi bi-grid-1x2"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Visão Geral</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Métricas e acompanhamento do período</p>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 24px;">
      <button class="filter-btn" data-days="7">7D</button>
      <button class="filter-btn" data-days="14">14D</button>
      <button class="filter-btn active" data-days="30">30D</button>
      <button class="filter-btn" data-days="90">90D</button>
      <button class="filter-btn" data-days="180">180D</button>
    </div>

    <div class="cards" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <i class="bi bi-envelope-open card-icon" style="color: var(--accent-blue);"></i>
        <span class="card-label">Total Criadas</span>
        <span class="card-value" id="ov-total-open">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-check2-circle card-icon" style="color: var(--accent-yellow);"></i>
        <span class="card-label">Total Resolvidas</span>
        <span class="card-value" id="ov-total-resolved">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-slash-circle card-icon" style="color: var(--muted);"></i>
        <span class="card-label">Total Canceladas</span>
        <span class="card-value" id="ov-total-cancelled">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-arrow-repeat card-icon" style="color: var(--accent-red);"></i>
        <span class="card-label">Taxa de Reabertura</span>
        <span class="card-value" id="ov-reopen-rate">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-person-plus card-icon" style="color: var(--accent-green);"></i>
        <span class="card-label">Novos Clientes</span>
        <span class="card-value" id="ov-new-clients">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-people card-icon" style="color: var(--accent);"></i>
        <span class="card-label">Clientes Recorrentes</span>
        <span class="card-value" id="ov-returning-clients">-</span>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 24px; display: flex; flex-direction: column; min-width: 0;">
      <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
        <h3 style="margin: 0;"><i class="bi bi-graph-up"></i> Tendência Geral</h3>
      </div>
      <div class="canvas-container" style="flex: 1; min-height: 300px; min-width: 0;">
        <canvas id="chart-ov-daily"></canvas>
      </div>
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-clock"></i> Padrão por Hora</h3>
        </div>
        <div class="canvas-container" style="flex: 1; min-height: 250px; min-width: 0;">
          <canvas id="chart-ov-hourly"></canvas>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-calendar-event"></i> Padrão por Dia</h3>
        </div>
        <div class="canvas-container" style="flex: 1; min-height: 250px; min-width: 0;">
          <canvas id="chart-ov-weekday"></canvas>
        </div>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-flag"></i> Por Prioridade</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Prioridade</th>
                <th data-sort="number" style="text-align: right;">Total</th>
                <th style="width: 100%;">Volume / Proporção</th>
              </tr>
            </thead>
            <tbody id="tb-ov-priority"></tbody>
          </table>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-chat-square-dots"></i> Por Canal</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Canal</th>
                <th data-sort="number" style="text-align: right;">Total</th>
                <th style="width: 100%;">Volume / Proporção</th>
              </tr>
            </thead>
            <tbody id="tb-ov-channel"></tbody>
          </table>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Por Time</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Time</th>
                <th data-sort="number" style="text-align: right;">Total</th>
                <th style="width: 100%;">Volume / Proporção</th>
              </tr>
            </thead>
            <tbody id="tb-ov-team"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-3-cols">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-building"></i> Empresas por Volume</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Empresa</th>
                <th data-sort="number" style="text-align: right;">Total</th>
                <th style="width: 100%;">Volume / Proporção</th>
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

    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.days) === selectedDays);
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedDays = Number(btn.dataset.days);
        localStorage.setItem('monitor-filter-days', selectedDays);

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const content = document.getElementById('content');
        content.classList.add('loading');

        await renderOverviewData(selectedDays);

        content.classList.remove('loading');
      });
    });

    await renderOverviewData(selectedDays);
  }
};
