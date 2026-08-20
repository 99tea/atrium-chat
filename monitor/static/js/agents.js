const AVAILABILITY_MAP = {
  online: { label: 'Online', badge: 'badge-green', icon: 'bi-circle-fill' },
  busy: { label: 'Ocupado', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' },
  offline: { label: 'Offline', badge: 'badge-neutral', icon: 'bi-circle' },
};

let agentsData = [];
let agentsSortKey = 'name';
let agentsSortDir = 'asc';

// Formatação inteligente para exibir Dias e Horas
function formatDetailedDuration(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '-';
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

function availabilityBadge(status) {
  const info = AVAILABILITY_MAP[status] || AVAILABILITY_MAP.offline;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:6px; padding: 4px 8px;">
            <i class="bi ${info.icon}" style="font-size: 0.55rem;"></i> ${info.label}
          </span>`;
}

function slaTableRow(r) {
  if (r.sla_percent === null) {
    return `<tr>
              <td style="font-weight: 500; white-space: nowrap;">${r.assignee_name}</td>
              <td colspan="3"><div class="empty-state" style="padding: 4px;"><span style="font-size: 0.8rem;">Sem dados</span></div></td>
            </tr>`;
  }

  const color = r.sla_percent >= 95 ? 'var(--accent-green)' : (r.sla_percent >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)');

  return `<tr>
            <td style="font-weight: 500; white-space: nowrap;" title="${r.assignee_name}">${r.assignee_name}</td>
            <td style="text-align: right;">${r.total || 0}</td>
            <td style="white-space: nowrap; text-align: right;">${formatDetailedDuration(r.avg_first_response)}</td>
            <td style="text-align: right; color: ${color}; font-weight: 600;">${r.sla_percent}%</td>
          </tr>`;
}

function rankTableRow(name, valueText, highlightColor = null) {
  const style = highlightColor ? `color: ${highlightColor}; font-weight: 600;` : '';
  return `<tr>
            <td style="font-weight: 500; white-space: nowrap;" title="${name}">${name}</td>
            <td style="text-align: right; ${style}">${valueText}</td>
          </tr>`;
}

function openAgentPage(agentId) {
  window.open(`${location.origin}${location.pathname}#agent/${agentId}`, '_blank');
}

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
    <tr>
      <td style="font-weight: 500;">
        <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="openAgentPage(${a.agent_id})">
          <div style="width: 28px; height: 28px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--muted);">
            <i class="bi bi-person"></i>
          </div>
          <span style="color: var(--text);">${a.name || '-'}</span>
        </div>
      </td>
      <td>${availabilityBadge(a.availability_status)}</td>
      <td style="text-align: right;">${a.assigned}</td>
      <td style="text-align: right;">${a.resolved_count}</td>
      <td style="text-align: right;">${a.open_count}</td>
      <td style="text-align: right;">${a.awaiting_count}</td>
      <td style="text-align: right;">${a.reopened > 0 ? `<span style="color: var(--accent-red); font-weight: 600; background: rgba(255, 92, 92, 0.1); padding: 2px 8px; border-radius: 12px;">${a.reopened}</span>` : '<span class="muted-text">0</span>'}</td>
      <td style="text-align: right; width: 40px;">
        <button class="topbar-btn" style="padding: 6px;" data-tooltip="Visão do Agente" onclick="openAgentPage(${a.agent_id})">
          <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
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
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent);">
        <i class="bi bi-people"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Agentes</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Exibindo dados dos últimos 30 dias</p>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 24px; min-width: 0;">
      <div class="table-responsive" style="max-height: 500px;">
        <table id="agents-table" class="sortable">
          <thead>
            <tr>
              <th data-key="name" style="cursor:pointer; white-space: nowrap;">Agente</th>
              <th>Status</th>
              <th data-key="assigned" style="cursor:pointer; white-space: nowrap; text-align: right;">Atribuídas</th>
              <th data-key="resolved_count" style="cursor:pointer; white-space: nowrap; text-align: right;">Resolvidas</th>
              <th data-key="open_count" style="cursor:pointer; white-space: nowrap; text-align: right;">Abertas</th>
              <th data-key="awaiting_count" style="cursor:pointer; white-space: nowrap; text-align: right;">Sem resposta</th>
              <th data-key="reopened" style="cursor:pointer; white-space: nowrap; text-align: right;">Reaberturas</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="grid-3-cols">
      <!-- Painel 1: Produtividade por Time (Com abas) -->
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Times</h3>
          <div id="tabs-team" style="display: flex; gap: 4px; background: var(--bg); padding: 4px; border-radius: 6px; border: 1px solid var(--border);">
            <button class="tab-btn active" data-target="team-open" style="border: none; background: var(--panel); border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; cursor: pointer; color: var(--text); font-weight: 500;">Criadas</button>
            <button class="tab-btn" data-target="team-resolved" style="border: none; background: transparent; border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; cursor: pointer; color: var(--muted);">Resolvidas</button>
          </div>
        </div>
        <div class="table-responsive tab-content" id="team-open" style="flex: 1; max-height: 350px;">
          <table id="table-team-open" class="sortable">
            <thead><tr><th data-sort="string">Time</th><th data-sort="number" style="text-align: right;">Total</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="table-responsive tab-content" id="team-resolved" style="display: none; flex: 1; max-height: 350px;">
          <table id="table-team-resolved" class="sortable">
            <thead><tr><th data-sort="string">Time</th><th data-sort="number" style="text-align: right;">Total</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <!-- Painel 2: Ranking Geral de SLA -->
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-shield-check"></i> SLA Individual</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table id="table-top-sla" class="sortable">
            <thead><tr><th data-sort="string">Agente</th><th data-sort="number" style="text-align: right;">Vol.</th><th data-sort="time" style="white-space: nowrap; text-align: right;">1ª Resp.</th><th data-sort="number" style="text-align: right;">SLA</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <!-- Painel 3: Destaques (Top 10 com abas) -->
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-trophy"></i> Destaques</h3>
          <div id="tabs-rank" style="display: flex; gap: 4px; background: var(--bg); padding: 4px; border-radius: 6px; border: 1px solid var(--border);">
            <button class="tab-btn active" data-target="rank-res" style="border: none; background: var(--panel); border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; color: var(--text); font-weight: 500;">Vol</button>
            <button class="tab-btn" data-target="rank-fast" style="border: none; background: transparent; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; color: var(--muted);">Tmp</button>
            <button class="tab-btn" data-target="rank-reop" style="border: none; background: transparent; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; color: var(--muted);">Reab</button>
          </div>
        </div>
        
        <div class="table-responsive tab-content" id="rank-res" style="flex: 1; max-height: 350px;">
          <table id="table-rank-resolved" class="sortable">
            <thead><tr><th data-sort="string">Agente</th><th data-sort="number" style="text-align: right;">Resolvidas</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="table-responsive tab-content" id="rank-fast" style="display: none; flex: 1; max-height: 350px;">
          <table id="table-rank-fastest" class="sortable">
            <thead><tr><th data-sort="string">Agente</th><th data-sort="time" style="text-align: right;">1ª Resposta</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="table-responsive tab-content" id="rank-reop" style="display: none; flex: 1; max-height: 350px;">
          <table id="table-rank-reopened" class="sortable">
            <thead><tr><th data-sort="string">Agente</th><th data-sort="number" style="text-align: right;">Reaberturas</th></tr></thead>
            <tbody></tbody>
          </table>
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

    // Lógica das Abas (Compactação de painéis)
    function setupTabs(containerId) {
      const container = document.getElementById(containerId);
      if(!container) return;
      const btns = container.querySelectorAll('.tab-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => {
            b.style.background = 'transparent';
            b.style.color = 'var(--muted)';
            b.style.fontWeight = 'normal';
            b.classList.remove('active');
            document.getElementById(b.dataset.target).style.display = 'none';
          });
          btn.style.background = 'var(--panel)';
          btn.style.color = 'var(--text)';
          btn.style.fontWeight = '500';
          btn.classList.add('active');
          document.getElementById(btn.dataset.target).style.display = 'block';
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

	// Reutilizando layout de "Bullet Chart" inline para os Times
    function renderTeamProgressTable(tableId, key) {
      const sorted = [...teamDist].sort((a, b) => b[key] - a[key]);
      const total = sorted.reduce((sum, r) => sum + (r[key] || 0), 0);

      document.querySelector(`#${tableId} tbody`).innerHTML = sorted.length ? sorted.map(r => {
        const val = r[key] || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
        const name = TEAM_NAMES[r.team_id] || `Time ${r.team_id}`;

        return `
          <tr>
            <td style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${name}">${name}</td>
            <td style="text-align: right; width: 40px; padding-right: 16px;">
              <span class="badge badge-neutral" style="font-size: 0.8rem;">${val}</span>
            </td>
            <td style="width: 100%; vertical-align: middle;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 0.75rem;">
                <span></span>
                <span style="color: var(--muted); font-weight: 600;">${pct}%</span>
              </div>
              <div style="width: 100%; background: var(--bg); border-radius: 3px; height: 6px; overflow: hidden; border: 1px solid var(--border);">
                <div style="width: ${pct}%; background: var(--accent); height: 100%; border-radius: 3px; transition: width 1s ease-in-out;"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="3"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>';
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
      : '<tr><td colspan="4"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>';

    const resolvedRanking = [...agentsData].filter(a => a.resolved_count > 0).sort((a, b) => b.resolved_count - a.resolved_count).slice(0, 10);
    document.querySelector('#table-rank-resolved tbody').innerHTML = resolvedRanking.length
      ? resolvedRanking.map(a => rankTableRow(a.name, a.resolved_count, 'var(--accent-green)')).join('')
      : '<tr><td colspan="2"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>';

    const fastestRanking = allAgentsSla.filter(a => a.avg_first_response !== null && a.total > 0).sort((a, b) => a.avg_first_response - b.avg_first_response).slice(0, 10);
    document.querySelector('#table-rank-fastest tbody').innerHTML = fastestRanking.length
      ? fastestRanking.map(a => rankTableRow(a.assignee_name, formatDetailedDuration(a.avg_first_response), 'var(--accent-blue)')).join('')
      : '<tr><td colspan="2"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados</span></div></td></tr>';

    const reopenedRanking = [...agentsData].filter(a => a.reopened > 0).sort((a, b) => b.reopened - a.reopened).slice(0, 10);
    document.querySelector('#table-rank-reopened tbody').innerHTML = reopenedRanking.length
      ? reopenedRanking.map(a => rankTableRow(a.name, a.reopened, 'var(--accent-red)')).join('')
      : '<tr><td colspan="2"><div class="empty-state" style="padding: 24px;"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 1.8rem; margin-bottom: 8px;"></i><span>Tudo tranquilo</span></div></td></tr>';
  },
};
