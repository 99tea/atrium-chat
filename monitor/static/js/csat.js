const CSAT_DAYS_OPTIONS = [7, 14, 30, 90, 180];

let CSAT_CHANNEL_INFO = {};
let csatResponsesState = { days: 30, rating: '', assignee_id: '', page: 1, page_size: 20 };

async function loadCsatChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  CSAT_CHANNEL_INFO = {};
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      CSAT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-whatsapp' };
    } else if (c.channel_key === 'email') {
      CSAT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: 'bi-envelope' };
    } else {
      CSAT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
    }
  });
  CSAT_CHANNEL_INFO.other = { label: 'Outros', classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
}

function csatStars(rating) {
  if (rating === null || rating === undefined) return '<span class="text-muted text-xs">-</span>';
  const color = rating >= 4 ? 'text-accent-green' : (rating === 3 ? 'text-accent-yellow' : 'text-accent-red');
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<i class="bi ${i <= rating ? 'bi-star-fill' : 'bi-star'} text-[0.7rem]"></i>`;
  }
  return `<span class="inline-flex items-center gap-0.5 ${color}">${stars}</span>`;
}

function csatRatingBadge(rating) {
  const isDsat = rating <= 2;
  const isNeutral = rating === 3;
  const color = isDsat ? 'text-accent-red bg-accent-red/10 border-accent-red/20' : (isNeutral ? 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' : 'text-accent-green bg-accent-green/10 border-accent-green/20');
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${color}">${csatStars(rating)}</span>`;
}

function csatBuildRow(labelHtml, data) {
  if (!data.total) {
    return `<tr><td colspan="3"><div class="p-4 text-center text-muted"><i class="bi bi-inbox text-lg block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>`;
  }
  const avgColor = data.avg_rating >= 4 ? 'text-accent-green' : (data.avg_rating >= 3 ? 'text-accent-yellow' : 'text-accent-red');
  return `
    <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-3 py-2.5 font-medium truncate text-[0.8rem]">${labelHtml}</td>
      <td class="px-3 py-2.5 text-right w-[60px]">
        <span class="inline-flex items-center px-1.5 py-0.5 text-[0.75rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${data.total}</span>
      </td>
      <td class="px-3 py-2.5 text-right w-[100px]">
        <span class="font-bold text-[0.85rem] ${avgColor}">${data.avg_rating.toFixed(1)}</span>
        ${data.dsat_count > 0 ? `<span class="ml-2 text-[0.65rem] text-accent-red font-semibold">${data.dsat_count} DSAT</span>` : ''}
      </td>
    </tr>
  `;
}

async function renderCsatResponses() {
  const params = new URLSearchParams();
  params.set('days', csatResponsesState.days);
  params.set('page', csatResponsesState.page);
  params.set('page_size', csatResponsesState.page_size);
  if (csatResponsesState.rating) params.set('rating', csatResponsesState.rating);
  if (csatResponsesState.assignee_id) params.set('assignee_id', csatResponsesState.assignee_id);

  const settings = window.__monitorSettings || await fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  const data = await fetch(`/monitor/api/csat/responses?${params}`).then(r => r.ok ? r.json() : { items: [], total: 0, page: 1, page_size: 20 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 20 }));

  document.querySelector('#csat-responses-table tbody').innerHTML = data.items.length
    ? data.items.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const chInfo = CSAT_CHANNEL_INFO[r.channel] || CSAT_CHANNEL_INFO.other;
        const isDsat = r.rating <= 2;
        return `
          <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors ${isDsat ? 'bg-accent-red/5' : ''}">
            <td class="px-3 py-3 text-[0.75rem] text-muted whitespace-nowrap align-top">
              ${new Date(r.created_at).toLocaleDateString('pt-BR')}
            </td>
            <td class="px-3 py-3 align-top">${csatRatingBadge(r.rating)}</td>
            <td class="px-3 py-3 text-[0.8rem] text-text align-top max-w-[220px]">
              <span class="block truncate font-medium" title="${r.subject || ''}">${r.subject || 'Não categorizado'}</span>
              <span class="block text-[0.7rem] text-muted truncate">${r.contact_name || '-'}${r.company_name ? ` · ${r.company_name}` : ''}</span>
            </td>
            <td class="px-3 py-3 text-[0.8rem] text-text align-top truncate max-w-[130px]" title="${r.assignee_name}">${r.assignee_name}</td>
            <td class="px-3 py-3 align-top">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${chInfo.classes}"><i class="bi ${chInfo.icon}"></i> ${chInfo.label}</span>
            </td>
            <td class="px-3 py-3 text-[0.8rem] text-text align-top max-w-[280px]">
              ${r.feedback_message ? `<span class="whitespace-pre-wrap">${r.feedback_message}</span>` : '<span class="text-muted text-xs">Sem comentário</span>'}
            </td>
            <td class="px-3 py-3 text-right align-top w-[40px]">
              <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right text-[0.8rem]"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7"><div class="py-12 text-center flex flex-col items-center"><i class="bi bi-inbox text-3xl text-border mb-3"></i><span class="text-muted text-sm">Nenhuma avaliação encontrada</span></div></td></tr>';

  const totalPages = Math.max(Math.ceil(data.total / data.page_size), 1);
  document.getElementById('csat-page-indicator').textContent = `Página ${data.page} de ${totalPages} (${data.total} avaliações)`;
  document.getElementById('csat-prev-page').disabled = data.page <= 1;
  document.getElementById('csat-next-page').disabled = data.page >= totalPages;
}

async function renderCsatData(days) {
  csatResponsesState.days = days;
  csatResponsesState.page = 1;

  const [summary, timeline, byAgent, byTeam, byChannel] = await Promise.all([
    fetch(`/monitor/api/csat/summary?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/csat/timeline?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/csat/by-agent?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/csat/by-team?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/csat/by-channel?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  document.getElementById('csat-total').textContent = summary.total ?? 0;
  document.getElementById('csat-avg').textContent = summary.avg_rating != null ? summary.avg_rating.toFixed(1) : '-';

  const csatRateEl = document.getElementById('csat-rate');
  csatRateEl.textContent = summary.csat_rate != null ? `${(summary.csat_rate * 100).toFixed(0)}%` : '-';

  const dsatRateEl = document.getElementById('csat-dsat-rate');
  dsatRateEl.textContent = summary.dsat_count != null ? `${summary.dsat_count} (${summary.dsat_rate != null ? (summary.dsat_rate * 100).toFixed(0) : 0}%)` : '-';

  const dist = summary.distribution || {};
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0);
  document.getElementById('csat-distribution').innerHTML = [5, 4, 3, 2, 1].map(n => {
    const val = dist[String(n)] || 0;
    const pct = distTotal ? (val / distTotal) * 100 : 0;
    const color = n >= 4 ? '#34d399' : (n === 3 ? '#ffc247' : '#ff5c5c');
    return `
      <div class="flex items-center gap-2 mb-1.5">
        <span class="text-[0.7rem] text-muted w-[38px] flex items-center gap-0.5">${n} <i class="bi bi-star-fill text-[0.6rem]"></i></span>
        <div class="flex-1 h-2 bg-panel-light rounded-full overflow-hidden border border-border/50">
          <div style="width: ${pct}%; background-color: ${color}; box-shadow: 0 0 5px ${color}80;" class="h-full rounded-full transition-all duration-1000"></div>
        </div>
        <span class="text-[0.7rem] text-muted font-semibold w-[30px] text-right">${val}</span>
      </div>`;
  }).join('');

  renderChart('chart-csat-timeline', {
    type: 'line',
    data: {
      labels: timeline.map(r => new Date(r.day).toLocaleDateString('pt-BR')),
      datasets: [{
        label: 'Nota média', data: timeline.map(r => r.avg_rating), borderColor: '#8f161b', backgroundColor: '#8f161b',
        tension: 0.3, fill: false, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
        y: { min: 0, max: 5, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 9 } } },
      },
    },
  });

  const emptyRow = '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-1"></i><span class="text-sm">Sem dados</span></div></td></tr>';

  const sortedAgents = [...byAgent].sort((a, b) => b.avg_rating - a.avg_rating);
  document.getElementById('tb-csat-agent').innerHTML = sortedAgents.length
    ? sortedAgents.map(a => csatBuildRow(`<span class="text-text">${a.assignee_name}</span>`, a)).join('')
    : emptyRow;

  document.getElementById('tb-csat-team').innerHTML = byTeam.length
    ? byTeam.sort((a, b) => b.total - a.total).map(t => csatBuildRow(`<span class="text-text flex items-center"><i class="bi bi-people mr-1.5 text-muted"></i>${t.team_name}</span>`, t)).join('')
    : emptyRow;

  document.getElementById('tb-csat-channel').innerHTML = byChannel.length
    ? byChannel.sort((a, b) => b.total - a.total).map(c => {
        const info = CSAT_CHANNEL_INFO[c.channel] || CSAT_CHANNEL_INFO.other;
        const label = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
        return csatBuildRow(label, c);
      }).join('')
    : emptyRow;

  const agentFilterEl = document.getElementById('csat-agent-filter');
  const currentSelection = agentFilterEl.value;
  agentFilterEl.innerHTML = '<option value="">Todos os agentes</option>' +
    byAgent.map(a => `<option value="${a.assigned_agent_id}">${a.assignee_name}</option>`).join('');
  agentFilterEl.value = currentSelection;

  await renderCsatResponses();
}

Screens.csat = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent text-white shadow-sm glow-border"><i class="bi bi-emoji-smile"></i></div>
          <div>
            <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">CSAT / DSAT</h2>
            <p class="m-0 text-[0.9rem] text-muted">Satisfação dos clientes com o atendimento</p>
          </div>
        </div>

        <div id="csat-date-filters" class="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
          ${CSAT_DAYS_OPTIONS.map(d => `<button id="btn-csat-${d}" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="${d}">${d}D</button>`).join('')}
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-blue/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-chat-square-heart text-[4rem] text-accent-blue"></i></div>
          <i class="bi bi-chat-square-heart text-2xl text-accent-blue mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Total de Avaliações</span>
          <span class="text-2xl font-bold text-text relative z-10" id="csat-total">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-yellow/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-star-fill text-[4rem] text-accent-yellow"></i></div>
          <i class="bi bi-star-fill text-2xl text-accent-yellow mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Nota Média</span>
          <span class="text-2xl font-bold text-text relative z-10" id="csat-avg">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-green/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-hand-thumbs-up text-[4rem] text-accent-green"></i></div>
          <i class="bi bi-hand-thumbs-up text-2xl text-accent-green mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">% CSAT (4-5)</span>
          <span class="text-2xl font-bold text-text relative z-10" id="csat-rate">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-red/50 transition-colors group relative overflow-hidden bg-gradient-to-br from-accent-red/5 to-panel">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-hand-thumbs-down text-[4rem] text-accent-red"></i></div>
          <i class="bi bi-hand-thumbs-down text-2xl text-accent-red mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">DSAT (1-2)</span>
          <span class="text-2xl font-bold text-accent-red relative z-10" id="csat-dsat-rate">-</span>
        </div>
      </div>

      <!-- Timeline + Distribution -->
      <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col">
          <div class="px-5 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-graph-up text-accent glow-text"></i> Evolução da Nota Média</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-col p-5 h-[260px]">
            <div class="relative flex-1 w-full h-full min-h-0">
              <canvas id="chart-csat-timeline"></canvas>
            </div>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col">
          <div class="px-5 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-bar-chart-steps text-muted"></i> Distribuição de Notas</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 h-[260px] flex flex-col justify-center" id="csat-distribution"></div>
        </div>
      </div>

      <!-- Breakdown Tables -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[300px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-person-badge text-muted"></i> Por Agente</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel">Agente</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Vol.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[100px] bg-panel">Nota</th>
                </tr>
              </thead>
              <tbody id="tb-csat-agent"></tbody>
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
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel">Time</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Vol.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[100px] bg-panel">Nota</th>
                </tr>
              </thead>
              <tbody id="tb-csat-team"></tbody>
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
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel">Canal</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[50px] bg-panel">Vol.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[100px] bg-panel">Nota</th>
                </tr>
              </thead>
              <tbody id="tb-csat-channel"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Responses Table -->
      <div class="panel-card bg-panel border border-border rounded-xl flex flex-col min-w-0 shadow-sm overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-list-ul text-muted"></i> Respostas de Avaliação</h3>
          <div class="flex gap-3">
            <select id="csat-rating-filter" class="px-3 py-2 rounded-lg border border-border bg-bg text-text text-[0.8rem] focus:outline-none focus:border-accent shadow-inner">
              <option value="">Todas as notas</option>
              <option value="1">1 estrela</option>
              <option value="2">2 estrelas</option>
              <option value="3">3 estrelas</option>
              <option value="4">4 estrelas</option>
              <option value="5">5 estrelas</option>
            </select>
            <select id="csat-agent-filter" class="px-3 py-2 rounded-lg border border-border bg-bg text-text text-[0.8rem] focus:outline-none focus:border-accent shadow-inner">
              <option value="">Todos os agentes</option>
            </select>
          </div>
        </div>
        <div class="panel-content overflow-x-auto overflow-y-auto h-[450px] no-scrollbar">
          <table id="csat-responses-table" class="w-full text-left table-fixed min-w-[900px]">
            <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
              <tr>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-24 bg-panel">Data</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-24 bg-panel">Nota</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-52 bg-panel">Conversa</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-32 bg-panel">Agente</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-28 bg-panel">Canal</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel">Comentário</th>
                <th class="px-3 py-3 w-10 bg-panel"></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="flex justify-between items-center px-5 py-4 border-t border-border bg-bg">
          <span id="csat-page-indicator" class="text-[0.8rem] font-medium text-muted"></span>
          <div class="flex gap-2">
            <button id="csat-prev-page" class="px-4 py-1.5 bg-panel-light border border-border rounded-lg text-[0.8rem] font-semibold text-text hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><i class="bi bi-chevron-left mr-1"></i> Anterior</button>
            <button id="csat-next-page" class="px-4 py-1.5 bg-panel-light border border-border rounded-lg text-[0.8rem] font-semibold text-text hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Próxima <i class="bi bi-chevron-right ml-1"></i></button>
          </div>
        </div>
      </div>

    </div>
  `,
  load: async function () {
    let selectedDays = Number(localStorage.getItem('monitor-filter-days')) || 30;

    const initialBtnId = `btn-csat-${selectedDays}`;
    if (document.getElementById(initialBtnId)) {
      window.handleDateFilterClick('csat-date-filters', initialBtnId, 'monitor-filter-days');
    }

    document.querySelectorAll('#csat-date-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedDays = Number(btn.dataset.days);
        window.handleDateFilterClick('csat-date-filters', btn.id, 'monitor-filter-days');

        const content = document.getElementById('content');
        content.classList.add('opacity-50', 'pointer-events-none');
        await renderCsatData(selectedDays);
        content.classList.remove('opacity-50', 'pointer-events-none');
      });
    });

    document.getElementById('csat-rating-filter').addEventListener('change', (e) => {
      csatResponsesState.rating = e.target.value;
      csatResponsesState.page = 1;
      renderCsatResponses();
    });

    document.getElementById('csat-agent-filter').addEventListener('change', (e) => {
      csatResponsesState.assignee_id = e.target.value;
      csatResponsesState.page = 1;
      renderCsatResponses();
    });

    document.getElementById('csat-prev-page').addEventListener('click', () => {
      if (csatResponsesState.page > 1) { csatResponsesState.page--; renderCsatResponses(); }
    });
    document.getElementById('csat-next-page').addEventListener('click', () => {
      csatResponsesState.page++; renderCsatResponses();
    });

    await loadCsatChannelInfo();
    await renderCsatData(selectedDays);
  },
};
