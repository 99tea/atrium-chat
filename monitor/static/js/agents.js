const TEAM_NAMES = { 1: 'Dev', 2: 'Fiscal', 3: 'Departamento Pessoal', 4: 'Financeiro', 5: 'Contábil', 7: 'Comercial', 8: 'Outros', 9: 'Triagem' };

const AVAILABILITY_MAP = {
  online: { label: 'Online', color: '#34d399' },
  busy: { label: 'Ocupado', color: '#ffc247' },
  offline: { label: 'Offline', color: '#9296b8' },
};

const AGENT_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill' } 
};

let agentsData = [];
let agentsSortKey = 'name';
let agentsSortDir = 'asc';

function availabilityBadge(status) {
  const info = AVAILABILITY_MAP[status] || AVAILABILITY_MAP.offline;
  return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:6px; padding: 4px 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${info.color}; box-shadow: 0 0 5px ${info.color}90;"></span>
            ${info.label}
          </span>`;
}

function slaListItem(r) {
  if (r.sla_percent === null) {
    return `<div class="sla-list-item" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.assignee_name}</span>
              <span class="badge badge-neutral" style="flex-shrink: 0;"><i class="bi bi-dash-circle"></i> Sem dados</span>
            </div>`;
  }
  
  const badgeClass = r.sla_percent >= 95 ? 'badge-green' : (r.sla_percent >= 80 ? 'badge-yellow' : 'badge-red');
  
  return `<div class="sla-list-item" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
    <span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.assignee_name}">${r.assignee_name}</span>
    <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
      <span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;" title="Conversas Resolvidas">
        <i class="bi bi-check2-all"></i> ${r.total || 0}
      </span>
      <span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;" title="Tempo Médio da 1ª Resposta">
        <i class="bi bi-stopwatch"></i> ${formatDuration(r.avg_first_response)}
      </span>
      <span class="badge ${badgeClass}" style="display:inline-flex; align-items:center; gap:4px; min-width: 65px; justify-content: center;" title="SLA Atingido">
        <i class="bi bi-shield-check"></i> ${r.sla_percent}%
      </span>
    </div>
  </div>`;
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
      <td>${a.name || '-'}</td>
      <td>${availabilityBadge(a.availability_status)}</td>
      <td>${a.assigned}</td>
      <td>${a.resolved_count}</td>
      <td>${a.open_count}</td>
      <td>${a.awaiting_count}</td>
      <td>${a.reopened}</td>
      <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="openAgentDetailModal(${a.agent_id}, '${(a.name || '').replace(/'/g, "\\'")}')"></i></td>
    </tr>
  `).join('');

  document.querySelectorAll('#agents-table th[data-key]').forEach(th => {
    th.classList.toggle('sorted-asc', th.dataset.key === agentsSortKey && agentsSortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.key === agentsSortKey && agentsSortDir === 'desc');
  });
}

async function openAgentDetailModal(agentId, agentName) {
  let selectedDays = 30;

  document.getElementById('agent-detail-modal-title').textContent = agentName;
  document.getElementById('agent-detail-modal').classList.remove('hidden');

  const filterBtns = document.querySelectorAll('#agent-detail-modal .filter-btn');
  filterBtns.forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.days) === selectedDays);
    btn.onclick = () => {
      selectedDays = Number(btn.dataset.days);
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAgentDetail(agentId, selectedDays);
    };
  });

  await renderAgentDetail(agentId, selectedDays);
}

async function renderAgentDetail(agentId, days) {
  const detail = await fetch(`/monitor/api/agents/${agentId}/detail?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));

  const s = detail.summary || {};
  document.getElementById('agent-detail-frt').textContent = formatDuration(s.avg_first_response);
  document.getElementById('agent-detail-res').textContent = formatDuration(s.avg_resolution);

  const slaEl = document.getElementById('agent-detail-sla');
  if (s.total) {
    const current = ((1 - s.resolution_breach_rate) * 100).toFixed(0);
    slaEl.textContent = `${current}%`;
    const target = window.__monitorSettings?.sla_target_percent || 95;
    slaEl.style.color = Number(current) >= Number(target) ? '#34d399' : '#f87171';
  } else {
    slaEl.textContent = '-';
    slaEl.style.color = '';
  }

  const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];
  const orderedPriority = PRIORITY_ORDER.map(p => (detail.by_priority || []).find(r => r.priority === p) || { priority: p, total: 0, avg_resolution: null, avg_first_response: null });

  document.querySelector('#agent-detail-priority-table tbody').innerHTML = orderedPriority.map(r => {
    const prio = String(r.priority || 'none').toLowerCase();
    const info = AGENT_PRIORITY_MAP[prio] || AGENT_PRIORITY_MAP.none;

    return `
      <tr>
        <td>
          <span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
            <i class="bi ${info.icon}"></i> ${info.label}
          </span>
        </td>
        <td>${r.total}</td>
        <td>${formatDuration(r.avg_first_response)}</td>
        <td>${formatDuration(r.avg_resolution)}</td>
      </tr>
    `;
  }).join('');

  const labelColors = {
    'aberto': '#00FFD3',
    'andamento': '#FFFB00',
    'cancelado': '#FF0000',
    'cliente-cadastrado': '#29a3ff',
    'concluído': '#12FF00',
    'depto-pessoal': '#a679ff',
    'pendente-cliente': '#5606EE',
    'pendente-terceiro': '#23B382',
    'resolvido': '#12FF00'
  };

  document.querySelector('#agent-detail-labels-table tbody').innerHTML = (detail.open_labels || []).length
    ? detail.open_labels.map(r => {
        const hex = labelColors[r.label.toLowerCase()] || '#9296b8';
        
        return `
          <tr>
            <td>
              <span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:6px; padding-left:8px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
                ${r.label}
              </span>
            </td>
            <td>${r.total}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="2"><div class="empty-state" style="padding: 15px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Nenhuma etiqueta</span></div></td></tr>`;
}

function closeAgentDetailModal() {
  document.getElementById('agent-detail-modal').classList.add('hidden');
}

Screens.agents = {
  template: `
    <h2>Agentes</h2>
    <p class="muted-text" style="color: var(--muted); margin-top: -8px; margin-bottom: 16px;">Exibindo dados dos últimos 30 dias</p>

    <div class="panel">
      <div class="table-responsive">
        <table id="agents-table">
          <thead>
            <tr>
              <th data-key="name" style="cursor:pointer; white-space: nowrap;">Agente</th>
              <th>Status</th>
              <th data-key="assigned" style="cursor:pointer; white-space: nowrap;">Atribuídas</th>
              <th data-key="resolved_count" style="cursor:pointer; white-space: nowrap;">Resolvidas</th>
              <th data-key="open_count" style="cursor:pointer; white-space: nowrap;">Abertas</th>
              <th data-key="awaiting_count" style="cursor:pointer; white-space: nowrap;">Sem resposta</th>
              <th data-key="reopened" style="cursor:pointer; white-space: nowrap;">Reaberturas</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="agents-grid-4" style="margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Criadas por time</h3>
        <div class="canvas-container" style="height: 160px; position: relative;">
          <canvas id="chart-team-open"></canvas>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <div id="list-team-open" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Resolvidas por time</h3>
        <div class="canvas-container" style="height: 160px; position: relative;">
          <canvas id="chart-team-resolved"></canvas>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <div id="list-team-resolved" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Ranking SLA</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
            <div id="list-top-sla" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Atenção (abaixo da meta)</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
            <div id="list-below-sla" class="sla-list"></div>
        </div>
      </div>
    </div>

    <div id="agent-detail-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 900px;">
        <button class="modal-close" onclick="closeAgentDetailModal()">&times;</button>
        <h3 id="agent-detail-modal-title"></h3>

        <div class="filter-bar" style="margin-bottom: 20px;">
          <button class="filter-btn" data-days="7">7D</button>
          <button class="filter-btn active" data-days="30">30D</button>
          <button class="filter-btn" data-days="90">90D</button>
        </div>

        <div class="cards" style="margin-bottom: 24px;">
          <div class="card">
            <i class="bi bi-stopwatch card-icon"></i>
            <span class="card-label">1ª Resposta</span>
            <span class="card-value" id="agent-detail-frt">-</span>
          </div>
          <div class="card">
            <i class="bi bi-check2-all card-icon"></i>
            <span class="card-label">Resolução</span>
            <span class="card-value" id="agent-detail-res">-</span>
          </div>
          <div class="card">
            <i class="bi bi-shield-check card-icon"></i>
            <span class="card-label">SLA Atingido</span>
            <span class="card-value" id="agent-detail-sla">-</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
          <div style="display: flex; flex-direction: column;">
            <h3>Resolução por prioridade</h3>
            <div class="table-responsive" style="margin-bottom: 0;">
              <table id="agent-detail-priority-table">
                <thead><tr><th>Prioridade</th><th>Total</th><th style="white-space: nowrap;">1ª Resposta</th><th>Resolução</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; flex-direction: column;">
            <h3>Conversas abertas por etiqueta</h3>
            <div class="table-responsive" style="margin-bottom: 0;">
              <table id="agent-detail-labels-table">
                <thead><tr><th>Etiqueta</th><th>Total</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    const oldModal = document.querySelector('body > #agent-detail-modal');
    if (oldModal) oldModal.remove();

    const modalEl = document.getElementById('agent-detail-modal');
    if (modalEl) {
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', function (e) {
        if (e.target === this) closeAgentDetailModal();
      });
    }

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

    const prioColorsTeam = ['#29a3ff', '#34d399', '#ffc247', '#ff5c5c', '#a679ff', '#9296b8', '#f97316', '#22d3ee'];

    function renderTeamDist(chartId, listId, key) {
      const sorted = [...teamDist].sort((a, b) => b[key] - a[key]);
      renderChart(chartId, {
        type: 'doughnut',
        data: {
          labels: sorted.map(r => TEAM_NAMES[r.team_id] || `Time ${r.team_id}`),
          datasets: [{ data: sorted.map(r => r[key]), backgroundColor: sorted.map((_, i) => prioColorsTeam[i % prioColorsTeam.length]) }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        },
      });

      document.getElementById(listId).innerHTML = sorted.map((r, i) => `
        <div class="sla-list-item">
          <span style="display:flex; align-items:center; gap:8px;">
            <span class="team-dist-dot" style="width:10px; height:10px; border-radius:50%; background:${prioColorsTeam[i % prioColorsTeam.length]}"></span>
            ${TEAM_NAMES[r.team_id] || `Time ${r.team_id}`}
          </span>
          <span class="badge badge-neutral">${r[key]}</span>
        </div>`).join('');
    }

    renderTeamDist('chart-team-open', 'list-team-open', 'created_count');
    renderTeamDist('chart-team-resolved', 'list-team-resolved', 'resolved_count');

    const slaMap = {};
    slaRanking.forEach(r => { slaMap[r.assignee_id] = r; });
    const target = settings.sla_target_percent || 95;

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

    document.getElementById('list-top-sla').innerHTML = allAgentsSla.length
      ? allAgentsSla.map(slaListItem).join('')
      : '<div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados suficientes</span></div>';

    const belowSla = allAgentsSla.filter(r => r.sla_percent !== null && r.sla_percent < target);
    document.getElementById('list-below-sla').innerHTML = belowSla.length
      ? belowSla.map(slaListItem).join('')
      : '<div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 1.5rem;"></i><span style="margin-top: 4px;">Tudo no prazo! Nenhum agente abaixo da meta.</span></div>';
  },
};
