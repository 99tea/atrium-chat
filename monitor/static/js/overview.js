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

function buildOverviewRow(labelHtml, value, total) {
  if (!total) {
    return `<tr>
              <td style="font-weight: 500; white-space: nowrap;">${labelHtml}</td>
              <td colspan="3"><div class="empty-state" style="padding: 4px;"><span style="font-size: 0.8rem;">Sem dados</span></div></td>
            </tr>`;
  }
  const pct = (value / total) * 100;
  return `
    <tr>
      <td style="font-weight: 500; white-space: nowrap;">${labelHtml}</td>
      <td>${value || 0}</td>
      <td style="min-width: 80px; vertical-align: middle;">
        <div style="width: 100%; background: var(--bg); border-radius: 4px; height: 8px; overflow: hidden; border: 1px solid var(--border);">
          <div style="width: ${pct}%; background: var(--accent); height: 100%; border-radius: 4px; transition: width 1s ease-in-out;"></div>
        </div>
      </td>
      <td style="text-align: right; font-weight: 600;">${pct.toFixed(1)}%</td>
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
        { label: 'Criadas WhatsApp', data: daily.map(r => r.created_whatsapp), borderColor: '#34d399', backgroundColor: '#34d399', tension: 0.3, fill: false },
        { label: 'Criadas E-mail', data: daily.map(r => r.created_email), borderColor: '#29a3ff', backgroundColor: '#29a3ff', tension: 0.3, fill: false },
        { label: 'Outros', data: daily.map(r => r.created_other), borderColor: '#9296b8', backgroundColor: '#9296b8', tension: 0.3, fill: false },
        { label: 'Resolvidas', data: daily.map(r => r.resolved), borderColor: '#ffc247', backgroundColor: '#ffc247', tension: 0.3, fill: false },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 15 } },
        y: { ticks: { stepSize: 1 }, suggestedMax: maxDaily + Math.ceil(maxDaily * 0.3) + 1 },
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
      datasets: [{ label: 'Conversas criadas', data: hourlyFull, backgroundColor: '#29a3ff', borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { stepSize: 1 } },
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
      datasets: [{ label: 'Conversas criadas', data: weekdayFull, backgroundColor: '#a679ff', borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { stepSize: 1 } },
      },
    },
  });

  const emptyRow = '<tr><td colspan="4"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  const totalPriority = priorityDist.reduce((acc, r) => acc + r.total, 0);
  const sortedPriority = [...priorityDist].sort((a, b) => {
    const oa = (OV_PRIORITY_MAP[a.priority] || OV_PRIORITY_MAP.none).order;
    const ob = (OV_PRIORITY_MAP[b.priority] || OV_PRIORITY_MAP.none).order;
    return oa - ob;
  });
  document.getElementById('tb-ov-priority').innerHTML = sortedPriority.length ? sortedPriority.map(p => {
    const info = OV_PRIORITY_MAP[p.priority] || OV_PRIORITY_MAP.none;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, p.total, totalPriority);
  }).join('') : emptyRow;

  const channelKeys = ['whatsapp', 'email', 'other'];
  const totalChannel = channelKeys.reduce((acc, k) => acc + (channelDist[k] || 0), 0);
  document.getElementById('tb-ov-channel').innerHTML = totalChannel ? channelKeys.map(k => {
    const info = OV_CHANNEL_MAP[k] || OV_CHANNEL_MAP.other;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildOverviewRow(label, channelDist[k] || 0, totalChannel);
  }).join('') : emptyRow;

  const totalTeam = teamDist.reduce((acc, r) => acc + r.created_count, 0);
  document.getElementById('tb-ov-team').innerHTML = teamDist.length ? [...teamDist].sort((a, b) => b.created_count - a.created_count).map(t => 
    buildOverviewRow(TEAM_NAMES[t.team_id] || `Time ${t.team_id}`, t.created_count, totalTeam)
  ).join('') : emptyRow;

  const totalCompany = companyDist.reduce((acc, c) => acc + c.total, 0);
  document.getElementById('tb-ov-companies').innerHTML = companyDist.length ? companyDist.map(c => 
    buildOverviewRow(c.company_name, c.total, totalCompany)
  ).join('') : emptyRow;
}

Screens.overview = {
  template: `
    <div class="filter-bar" style="margin-bottom: 24px;">
      <button class="filter-btn" data-days="7">7D</button>
      <button class="filter-btn" data-days="14">14D</button>
      <button class="filter-btn active" data-days="30">30D</button>
      <button class="filter-btn" data-days="90">90D</button>
      <button class="filter-btn" data-days="180">180D</button>
    </div>

    <div class="cards" style="margin-bottom: 24px;">
      <div class="card">
        <i class="bi bi-envelope-open card-icon" style="color: var(--accent-blue);"></i>
        <span class="card-label">Total Criadas</span>
        <span class="card-value" id="ov-total-open">-</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-circle card-icon" style="color: var(--accent-yellow);"></i>
        <span class="card-label">Total Resolvidas</span>
        <span class="card-value" id="ov-total-resolved">-</span>
      </div>
      <div class="card">
        <i class="bi bi-slash-circle card-icon" style="color: var(--muted);"></i>
        <span class="card-label">Total Canceladas</span>
        <span class="card-value" id="ov-total-cancelled">-</span>
      </div>
      <div class="card">
        <i class="bi bi-arrow-repeat card-icon" style="color: var(--accent-red);"></i>
        <span class="card-label">Taxa de Reabertura</span>
        <span class="card-value" id="ov-reopen-rate">-</span>
      </div>
      <div class="card">
        <i class="bi bi-person-plus card-icon" style="color: var(--accent-green);"></i>
        <span class="card-label">Novos Clientes</span>
        <span class="card-value" id="ov-new-clients">-</span>
      </div>
      <div class="card">
        <i class="bi bi-people card-icon" style="color: var(--accent);"></i>
        <span class="card-label">Clientes Recorrentes</span>
        <span class="card-value" id="ov-returning-clients">-</span>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 24px; display: flex; flex-direction: column;">
      <div class="home-panel-header" style="margin-bottom: 16px;">
        <h3><i class="bi bi-graph-up"></i> Tendência Geral</h3>
      </div>
      <div class="canvas-container" style="height: 300px;">
        <canvas id="chart-ov-daily"></canvas>
      </div>
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3><i class="bi bi-clock"></i> Padrão por Hora</h3>
        </div>
        <div class="canvas-container" style="height: 250px;">
          <canvas id="chart-ov-hourly"></canvas>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3><i class="bi bi-calendar-event"></i> Padrão por Dia</h3>
        </div>
        <div class="canvas-container" style="height: 250px;">
          <canvas id="chart-ov-weekday"></canvas>
        </div>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3><i class="bi bi-flag"></i> Por Prioridade</h3>
        </div>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Prioridade</th>
                <th data-sort="number">Total</th>
                <th style="width: 100%;">Volume</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-ov-priority"></tbody>
          </table>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3><i class="bi bi-chat-square-dots"></i> Por Canal</h3>
        </div>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Canal</th>
                <th data-sort="number">Total</th>
                <th style="width: 100%;">Volume</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-ov-channel"></tbody>
          </table>
        </div>
      </div>
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3><i class="bi bi-diagram-3"></i> Por Time</h3>
        </div>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Time</th>
                <th data-sort="number">Total</th>
                <th style="width: 100%;">Volume</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-ov-team"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel" style="display: flex; flex-direction: column;">
      <div class="home-panel-header" style="margin-bottom: 16px;">
        <h3><i class="bi bi-building"></i> Empresas com mais conversas</h3>
      </div>
      <div class="table-responsive" style="max-height: 350px;">
        <table class="sortable">
          <thead>
            <tr>
              <th data-sort="string">Empresa</th>
              <th data-sort="number">Total</th>
              <th style="width: 100%;">Volume</th>
              <th data-sort="number">%</th>
            </tr>
          </thead>
          <tbody id="tb-ov-companies"></tbody>
        </table>
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
