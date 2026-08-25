const AVAILABILITY_MAP = {
  online: { label: 'Online', classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-circle-fill' },
  busy: { label: 'Ocupado', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill' },
  offline: { label: 'Offline', classes: 'text-muted bg-panel-light border-border', icon: 'bi-circle' },
};

let agentsData = [];
let agentsSortKey = 'name';
let agentsSortDir = 'asc';

function formatDetailedDuration(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '-';
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

function availabilityBadge(status) {
  const info = AVAILABILITY_MAP[status] || AVAILABILITY_MAP.offline;
  return `<span class="inline-flex items-center gap-1.5 px-2 py-1 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}">
            <i class="bi ${info.icon} text-[0.55rem]"></i> ${info.label}
          </span>`;
}

function slaTableRow(r) {
  if (r.sla_percent === null) {
    return `<tr class="border-b border-border/50 last:border-0">
              <td class="px-4 py-2 font-medium truncate text-[0.8rem] text-text">${r.assignee_name}</td>
              <td colspan="3" class="px-4 py-2"><div class="p-2 text-center text-muted"><span class="text-xs">Sem dados</span></div></td>
            </tr>`;
  }
  const color = r.sla_percent >= 95 ? 'text-accent-green' : (r.sla_percent >= 80 ? 'text-accent-yellow' : 'text-accent-red');
  return `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-4 py-2 font-medium truncate text-[0.8rem] text-text" title="${r.assignee_name}">${r.assignee_name}</td>
            <td class="px-4 py-2 text-right text-[0.8rem] text-text font-medium">${r.total || 0}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap text-[0.8rem] text-muted">${formatDetailedDuration(r.avg_first_response)}</td>
            <td class="px-4 py-2 text-right font-bold text-[0.85rem] ${color}">${r.sla_percent}%</td>
          </tr>`;
}

function rankTableRow(name, valueText, highlightClass = 'text-text') {
  return `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-4 py-2 font-medium truncate text-[0.8rem] text-text" title="${name}">${name}</td>
            <td class="px-4 py-2 text-right text-[0.85rem] font-bold ${highlightClass}">${valueText}</td>
          </tr>`;
}

function openAgentPage(agentId) { window.open(`${location.origin}${location.pathname}#agent/${agentId}`, '_blank'); }

function renderAgentsTable() {
  const sorted = [...agentsData].sort((a, b) => {
    let va = a[agentsSortKey], vb = b[agentsSortKey];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va === null || va === undefined) va = agentsSortDir === 'asc' ? Infinity : -Infinity;
    if (vb === null || vb === undefined) vb = agentsSortDir === 'asc' ? Infinity : -Infinity;
    if (va < vb) return agentsSortDir === 'asc' ? -1 : 1;
    if (va > vb) return agentsSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelector('#agents-table tbody').innerHTML = sorted.map(a => `
    <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-4 py-2.5 font-medium">
        <div class="flex items-center gap-3 cursor-pointer group" onclick="openAgentPage(${a.agent_id})">
          <div class="w-8 h-8 rounded-lg bg-panel border border-border flex items-center justify-center text-[0.85rem] text-muted group-hover:border-accent group-hover:text-accent transition-colors"><i class="bi bi-person"></i></div>
          <span class="text-text text-[0.85rem] truncate group-hover:text-accent transition-colors">${a.name || '-'}</span>
        </div>
      </td>
      <td class="px-4 py-2.5">${availabilityBadge(a.availability_status)}</td>
      <td class="px-4 py-2.5 text-right text-[0.85rem] font-medium text-text">${a.assigned}</td>
      <td class="px-4 py-2.5 text-right text-[0.85rem] font-medium text-accent-green">${a.resolved_count}</td>
      <td class="px-4 py-2.5 text-right text-[0.85rem] font-medium text-accent-yellow">${a.open_count}</td>
      <td class="px-4 py-2.5 text-right text-[0.85rem] font-medium text-muted">${a.awaiting_count}</td>
      <td class="px-4 py-2.5 text-right text-[0.85rem]">
        ${a.reopened > 0 ? `<span class="inline-flex items-center px-2 py-0.5 text-accent-red font-bold bg-accent-red/10 border border-accent-red/20 rounded-full">${a.reopened}</span>` : '<span class="text-muted">-</span>'}
      </td>
      <td class="px-4 py-2.5 text-right w-12">
        <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Visão do Agente" onclick="openAgentPage(${a.agent_id})">
          <i class="bi bi-box-arrow-up-right text-[0.85rem]"></i>
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('#agents-table th[data-key]').forEach(th => {
    th.classList.toggle('sorted-asc', th.dataset.key === agentsSortKey && agentsSortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.key === agentsSortKey && agentsSortDir === 'desc');
  });
}

Screens.agents = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <div class="flex items-center gap-4 pb-4 border-b border-border">
        <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent text-white shadow-sm glow-border"><i class="bi bi-people"></i></div>
        <div>
          <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Agentes</h2>
          <p class="m-0 text-[0.9rem] text-muted">Exibindo dados dos últimos 30 dias</p>
        </div>
      </div>

      <!-- Tabela Principal de Agentes -->
      <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden mb-2">
        <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
          <h3 class="m-0 text-[0.95rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-person-badge text-accent glow-text"></i> Desempenho Geral</h3>
          <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
        </div>
        <div class="panel-content flex-1 overflow-x-auto overflow-y-auto max-h-[450px] relative no-scrollbar">
          <table id="agents-table" class="sortable w-full text-left whitespace-nowrap min-w-[800px]">
            <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
              <tr>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer select-none hover:text-text bg-panel" data-key="name">Agente</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel">Status</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer select-none hover:text-text bg-panel" data-key="assigned">Atribuídas</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer select-none hover:text-text bg-panel" data-key="resolved_count">Resolvidas</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer select-none hover:text-text bg-panel" data-key="open_count">Abertas</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer select-none hover:text-text bg-panel" data-key="awaiting_count">Sem resposta</th>
                <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer select-none hover:text-text bg-panel" data-key="reopened">Reaberturas</th>
                <th class="px-4 py-3 w-[50px] bg-panel"></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <!-- Painéis Inferiores (Thirds) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <!-- Painel 1: Produtividade por Time -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="p-3 border-b border-border flex justify-between items-center gap-2 shrink-0">
            <div class="flex items-center gap-2 cursor-pointer select-none pl-1" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-muted"></i> Times</h3>
              <i class="bi bi-chevron-up toggle-icon transition-transform text-muted ml-1 text-[0.7rem]"></i>
            </div>
            <div id="tabs-team" class="flex p-1 bg-bg border border-border rounded-lg gap-1">
              <button class="tab-btn active px-3 py-1.5 rounded-md text-[0.7rem] font-semibold transition-colors border bg-panel shadow-sm text-text border-accent glow-border" data-target="team-open">Criadas</button>
              <button class="tab-btn px-3 py-1.5 rounded-md text-[0.7rem] font-semibold transition-colors border border-transparent text-muted bg-transparent hover:text-text hover:bg-panel-light" data-target="team-resolved">Resolvidas</button>
            </div>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <div id="team-open" class="tab-content block h-full">
              <table id="table-team-open" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[40%] bg-panel">Time</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[60px] bg-panel">Total</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Volume</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div id="team-resolved" class="tab-content hidden h-full">
              <table id="table-team-resolved" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[40%] bg-panel">Time</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[60px] bg-panel">Total</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Volume</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Painel 2: Ranking SLA (CORREÇÃO DE ALARGAMENTO HORIZONTAL) -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-shield-check text-accent-yellow glow-text"></i> SLA Individual</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <!-- Adicionado 'table-fixed' e classes de largura nas colunas -->
            <table id="table-top-sla" class="sortable w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel w-full" data-sort="string">Agente</th>
                  <th class="px-4 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel w-[15%]" data-sort="number">Vol.</th>
                  <th class="px-4 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel w-[25%]" data-sort="time">1ª Resp.</th>
                  <th class="px-4 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel w-[15%]" data-sort="number">SLA</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <!-- Painel 3: Destaques (CORREÇÃO DE ALARGAMENTO HORIZONTAL) -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="p-3 border-b border-border flex justify-between items-center gap-2 shrink-0">
            <div class="flex items-center gap-2 cursor-pointer select-none pl-1" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-trophy-fill text-accent-green glow-text"></i> Destaques</h3>
              <i class="bi bi-chevron-up toggle-icon transition-transform text-muted ml-1 text-[0.7rem]"></i>
            </div>
            <div id="tabs-rank" class="flex p-1 bg-bg border border-border rounded-lg gap-1">
              <button class="tab-btn active px-2.5 py-1.5 rounded-md text-[0.7rem] font-semibold transition-colors border bg-panel shadow-sm text-text border-accent glow-border" data-target="rank-res">Vol</button>
              <button class="tab-btn px-2.5 py-1.5 rounded-md text-[0.7rem] font-semibold transition-colors border border-transparent text-muted bg-transparent hover:text-text hover:bg-panel-light" data-target="rank-fast">Tmp</button>
              <button class="tab-btn px-2.5 py-1.5 rounded-md text-[0.7rem] font-semibold transition-colors border border-transparent text-muted bg-transparent hover:text-text hover:bg-panel-light" data-target="rank-reop">Reab</button>
            </div>
          </div>
          
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <div id="rank-res" class="tab-content block h-full">
              <!-- Adicionado 'table-fixed' e classes de largura -->
              <table id="table-rank-resolved" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel w-[60%]">Agente</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel w-[40%]">Resolvidas</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div id="rank-fast" class="tab-content hidden h-full">
              <table id="table-rank-fastest" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel w-[60%]">Agente</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel w-[40%]">1ª Resposta</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div id="rank-reop" class="tab-content hidden h-full">
              <table id="table-rank-reopened" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider bg-panel w-[60%]">Agente</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel w-[40%]">Reaberturas</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

    </div>
  `,
  load: async function () {
    const days = 30;

    const [summary, status, teamDist, settings, slaRanking, awaitingCount, reopenRate] = await Promise.all([
      fetch(`/monitor/api/agents/summary?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/agents/status').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/monitor/api/teams/distribution?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(`/monitor/api/agents/sla-ranking?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/agents/awaiting-count').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/monitor/api/agents/reopen-rate?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    window.__monitorSettings = settings;

    function setupTabs(containerId) {
      const container = document.getElementById(containerId);
      if(!container) return;
      const btns = container.querySelectorAll('.tab-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => {
            b.classList.remove('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
            b.classList.add('text-muted', 'border-transparent', 'bg-transparent');
            document.getElementById(b.dataset.target).classList.add('hidden');
            document.getElementById(b.dataset.target).classList.remove('block');
          });
          btn.classList.add('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
          btn.classList.remove('text-muted', 'border-transparent', 'bg-transparent');
          document.getElementById(btn.dataset.target).classList.remove('hidden');
          document.getElementById(btn.dataset.target).classList.add('block');
        });
      });
    }
    setupTabs('tabs-team');
    setupTabs('tabs-rank');

    const summaryMap = {};
    summary.forEach(r => { summaryMap[r.assignee_id] = r; });
    const awaitingMap = {};
    awaitingCount.forEach(r => { awaitingMap[r.assignee_id] = r.awaiting_count; });
    const reopenMap = {};
    reopenRate.forEach(r => { reopenMap[r.assignee_id] = r.reopened; });

    agentsData = status.map(a => {
      const s = summaryMap[a.agent_id] || { open_count: 0, resolved_count: 0 };
      return {
        agent_id: a.agent_id,
        name: a.name,
        availability_status: a.availability_status,
        open_count: s.open_count,
        resolved_count: s.resolved_count,
        assigned: s.open_count + s.resolved_count,
        awaiting_count: awaitingMap[a.agent_id] || 0,
        reopened: reopenMap[a.agent_id] || 0,
      };
    });

    document.querySelectorAll('#agents-table th[data-key]').forEach(th => {
      th.onclick = () => {
        const key = th.dataset.key;
        if (agentsSortKey === key) {
          agentsSortDir = agentsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          agentsSortKey = key;
          agentsSortDir = 'asc';
        }
        renderAgentsTable();
      };
    });

    renderAgentsTable();

    function renderTeamProgressTable(tableId, key) {
      const sorted = [...teamDist].sort((a, b) => b[key] - a[key]);
      const total = sorted.reduce((sum, r) => sum + (r[key] || 0), 0);

      document.querySelector(`#${tableId} tbody`).innerHTML = sorted.length ? sorted.map(r => {
        const val = r[key] || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
        const name = TEAM_NAMES[r.team_id] || `Time ${r.team_id}`;
        
        // CORREÇÃO DA COR: Injetada via style direto
        const barHex = key === 'created_count' ? '#29a3ff' : '#34d399';

        return `
          <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-4 py-2 font-medium truncate text-[0.8rem]">${name}</td>
            <td class="px-4 py-2 text-right w-[60px]">
              <span class="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${val}</span>
            </td>
            <td class="px-4 py-2 w-full align-middle pl-4">
              <div class="flex justify-between items-center mb-1 text-[0.65rem]">
                <span></span>
                <span class="text-muted font-bold">${pct}%</span>
              </div>
              <div class="w-full bg-panel-light rounded-full h-1.5 overflow-hidden border border-border/50">
                <div style="width: ${pct}%; background-color: ${barHex}; box-shadow: 0 0 5px ${barHex}80;" class="h-full rounded-full transition-all duration-1000"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados</span></div></td></tr>';
    }

    renderTeamProgressTable('table-team-open', 'created_count');
    renderTeamProgressTable('table-team-resolved', 'resolved_count');

    const slaMap = {};
    slaRanking.forEach(r => { slaMap[r.assignee_id] = r; });

    const allAgentsSla = status.map(a => {
      const sla = slaMap[a.agent_id];
      return {
        assignee_id: a.agent_id,
        assignee_name: a.name,
        sla_percent: sla ? sla.sla_percent : null,
        total: sla ? sla.total : 0,
        avg_first_response: sla ? sla.avg_first_response : null,
      };
    }).sort((a, b) => {
      if (a.sla_percent === null && b.sla_percent === null) return 0;
      if (a.sla_percent === null) return 1;
      if (b.sla_percent === null) return -1;
      return b.sla_percent - a.sla_percent;
    });

    document.querySelector('#table-top-sla tbody').innerHTML = allAgentsSla.length
      ? allAgentsSla.map(slaTableRow).join('')
      : '<tr><td colspan="4"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados</span></div></td></tr>';

    const resolvedRanking = [...agentsData].filter(a => a.resolved_count > 0).sort((a, b) => b.resolved_count - a.resolved_count).slice(0, 10);
    document.querySelector('#table-rank-resolved tbody').innerHTML = resolvedRanking.length
      ? resolvedRanking.map(a => rankTableRow(a.name, a.resolved_count, 'text-accent-green')).join('')
      : '<tr><td colspan="2"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados</span></div></td></tr>';

    const fastestRanking = allAgentsSla.filter(a => a.avg_first_response !== null && a.total > 0).sort((a, b) => a.avg_first_response - b.avg_first_response).slice(0, 10);
    document.querySelector('#table-rank-fastest tbody').innerHTML = fastestRanking.length
      ? fastestRanking.map(a => rankTableRow(a.assignee_name, formatDetailedDuration(a.avg_first_response), 'text-[#29a3ff]')).join('')
      : '<tr><td colspan="2"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados</span></div></td></tr>';

    const reopenedRanking = [...agentsData].filter(a => a.reopened > 0).sort((a, b) => b.reopened - a.reopened).slice(0, 10);
    document.querySelector('#table-rank-reopened tbody').innerHTML = reopenedRanking.length
      ? reopenedRanking.map(a => rankTableRow(a.name, a.reopened, 'text-accent-red')).join('')
      : '<tr><td colspan="2"><div class="p-8 text-center flex flex-col items-center"><i class="bi bi-emoji-smile text-[2.5rem] text-accent-green mb-3"></i><span class="text-[0.9rem] text-text font-medium">Tudo tranquilo!</span></div></td></tr>';
  },
};
