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
            <td>${r.total || 0}</td>
            <td style="white-space: nowrap;">${formatDuration(r.avg_first_response)}</td>
            <td style="color: ${color}; font-weight: 700;">${r.sla_percent}%</td>
          </tr>`;
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
      <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer; font-size: 1.1rem;" onclick="openAgentDetailModal(${a.agent_id}, '${(a.name || '').replace(/'/g, "\\'")}')"></i></td>
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
    slaEl.style.color = Number(current) >= Number(target) ? 'var(--accent-green)' : 'var(--accent-red)';
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

    <div class="panel" style="margin-bottom: 24px;">
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

    <div class="grid-3-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Criadas por time</h3>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table id="table-team-open">
            <thead><tr><th>Time</th><th>Total</th><th style="width: 100%;">Proporção</th><th>%</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Resolvidas por time</h3>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table id="table-team-resolved">
            <thead><tr><th>Time</th><th>Total</th><th style="width: 100%;">Proporção</th><th>%</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Ranking SLA</h3>
        <div class="table-responsive" style="flex: 1; max-height: 350px;">
          <table id="table-top-sla">
            <thead><tr><th>Agente</th><th>Resolvidas</th><th style="white-space: nowrap;">1ª Resposta</th><th>SLA</th></tr></thead>
            <tbody></tbody>
          </table>
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

    function renderTeamProgressTable(tableId, key) {
      const sorted = [...teamDist].sort((a, b) => b[key] - a[key]);
      const total = sorted.reduce((sum, r) => sum + (r[key] || 0), 0);
      
      document.querySelector(`#${tableId} tbody`).innerHTML = sorted.length ? sorted.map(r => {
        const val = r[key] || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
        const name = TEAM_NAMES[r.team_id] || `Time ${r.team_id}`;
        
        return `
          <tr>
            <td style="white-space: nowrap; font-weight: 500;">${name}</td>
            <td>${val}</td>
            <td style="min-width: 100px; vertical-align: middle;">
              <div style="width: 100%; background: var(--bg); border-radius: 4px; height: 8px; overflow: hidden; border: 1px solid var(--border);">
                <div style="width: ${pct}%; background: var(--accent); height: 100%; border-radius: 4px; transition: width 1s ease-in-out;"></div>
              </div>
            </td>
            <td style="text-align: right; font-weight: 600;">${pct}%</td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="4"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';
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
      : '<tr><td colspan="4"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';
  },
};
