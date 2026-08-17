const AGENT_DETAIL_DAYS_OPTIONS = [7, 14, 30, 90, 180];

const AGENT_DETAIL_CHANNEL_MAP = {
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' },
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' },
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' },
};

function agentDetailSlaBadge(row) {
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';

  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i class="bi ${icon}"></i> ${late ? 'Atrasado ' : 'Em '}${formatDuration(absMinutes)}
          </span>`;
}

function agentDetailPriorityBadge(priority) {
  const prioMap = {
    urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' },
    high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' },
    medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' },
    low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' },
    none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill' },
  };
  const prio = String(priority || 'none').toLowerCase();
  const info = prioMap[prio] || prioMap.none;

  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
            <i class="bi ${info.icon}"></i> ${info.label}
          </span>`;
}

function agentDetailLabelBadge(label) {
  const hex = getLabelColor(label);
  return `<span class="badge badge-neutral" style="margin-right:4px; display:inline-flex; align-items:center; gap:6px; padding-left:8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
            ${label}
          </span>`;
}

function agentDetailCompareValue(agentVal, teamVal) {
  if (agentVal === null || agentVal === undefined || teamVal === null || teamVal === undefined) {
    return `<span class="muted-text">-</span>`;
  }
  const better = agentVal <= teamVal;
  const diffPct = teamVal ? Math.abs(((agentVal - teamVal) / teamVal) * 100).toFixed(0) : 0;
  const color = better ? 'var(--accent-green)' : 'var(--accent-red)';
  const arrow = better ? 'bi-arrow-down-short' : 'bi-arrow-up-short';
  return `${formatDuration(agentVal)} <span style="color:${color}; font-size:0.85rem;"><i class="bi ${arrow}"></i>${diffPct}% vs time</span>`;
}

async function renderAgentDetailPage(agentId, days) {
  const [detail, openConvs, awaiting, reopened, settings] = await Promise.all([
    fetch(`/monitor/api/agents/${agentId}/detail?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/agents/${agentId}/open-conversations`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/agents/${agentId}/awaiting`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/agents/${agentId}/reopened?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);

  const s = detail.summary || {};
  document.getElementById('agent-page-frt').textContent = formatDuration(s.avg_first_response);
  document.getElementById('agent-page-res').textContent = formatDuration(s.avg_resolution);
  document.getElementById('agent-page-resolved').textContent = s.total ?? 0;

  const slaEl = document.getElementById('agent-page-sla');
  if (s.total) {
    const current = ((1 - s.resolution_breach_rate) * 100).toFixed(0);
    const target = settings.sla_target_percent || 95;
    slaEl.textContent = `${current}% / ${target}%`;
    slaEl.style.color = Number(current) >= Number(target) ? '#34d399' : '#f87171';
  } else {
    slaEl.textContent = '-';
    slaEl.style.color = '';
  }

  document.getElementById('agent-page-awaiting').textContent = awaiting.length;
  document.getElementById('agent-page-reopened').textContent = reopened.reopened ?? 0;

  const teamAvg = detail.team_avg;
  const compareEl = document.getElementById('agent-page-team-compare');
  if (teamAvg && teamAvg.resolved_count > 0) {
    compareEl.style.display = 'flex';
    document.getElementById('agent-page-team-name').textContent = TEAM_NAMES[teamAvg.team_id] || `Time ${teamAvg.team_id}`;
    document.getElementById('agent-page-cmp-frt').innerHTML = agentDetailCompareValue(s.avg_first_response, teamAvg.avg_first_response);
    document.getElementById('agent-page-cmp-res').innerHTML = agentDetailCompareValue(s.avg_resolution, teamAvg.avg_resolution);
  } else {
    compareEl.style.display = 'none';
  }

  const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];
  const orderedPriority = PRIORITY_ORDER.map(p => detail.by_priority?.find(r => r.priority === p) || { priority: p, total: 0, avg_resolution: null, avg_first_response: null });

  document.querySelector('#agent-page-priority-table tbody').innerHTML = orderedPriority.map(r => `
    <tr>
      <td>${agentDetailPriorityBadge(r.priority)}</td>
      <td>${r.total}</td>
      <td>${formatDuration(r.avg_first_response)}</td>
      <td>${formatDuration(r.avg_resolution)}</td>
    </tr>
  `).join('');

  document.querySelector('#agent-page-channel-table tbody').innerHTML = (detail.by_channel || []).length
    ? detail.by_channel.map(r => {
        const info = AGENT_DETAIL_CHANNEL_MAP[r.channel] || AGENT_DETAIL_CHANNEL_MAP.other;
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
          </tr>`;
      }).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 15px;"><i class="bi bi-chat-dots" style="font-size: 1.5rem;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#agent-page-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `
        <tr>
          <td>${r.subject}</td>
          <td>${r.total}</td>
          <td>${formatDuration(r.avg_first_response)}</td>
          <td>${formatDuration(r.avg_resolution)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 15px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#agent-page-labels-table tbody').innerHTML = (detail.open_labels || []).length
    ? detail.open_labels.map(r => `<tr><td>${agentDetailLabelBadge(r.label)}</td><td style="text-align: right;"><span class="badge badge-neutral">${r.total}</span></td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state" style="padding: 15px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Nenhuma etiqueta</span></div></td></tr>';

  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.querySelector('#agent-page-open-table tbody').innerHTML = openConvs.length
    ? openConvs.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const chInfo = AGENT_DETAIL_CHANNEL_MAP[r.channel] || AGENT_DETAIL_CHANNEL_MAP.other;
        return `
          <tr>
            <td style="font-weight: 500;">${r.conversation_id}</td>
            <td>${agentDetailPriorityBadge(r.priority)}</td>
            <td>${r.subject || '-'}</td>
            <td>${r.contact_name || '-'}</td>
            <td>
              <span class="badge ${chInfo.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
                <i class="bi ${chInfo.icon}"></i> ${chInfo.label}
              </span>
            </td>
            <td>${agentDetailSlaBadge(r)}</td>
            <td style="text-align: right;">
              <button class="topbar-btn" style="padding: 4px 8px;" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7"><div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 1.8rem; margin-bottom: 8px;"></i><span>Nenhuma conversa aberta no momento</span></div></td></tr>';
}

Screens.agent = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" id="agent-page-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0;"></div>
      <div>
        <h2 id="agent-page-title" style="margin: 0 0 4px; font-size: 1.4rem;">Detalhes do Agente</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Visão individual de desempenho</p>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 24px;">
      ${AGENT_DETAIL_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <!-- KPIs do Agente -->
      <div class="cards" style="margin-bottom: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div class="card" style="padding: 16px;">
          <i class="bi bi-check2-circle card-icon" style="color: var(--accent-yellow); font-size: 1.4rem;"></i>
          <span class="card-label">Resolvidas</span>
          <span class="card-value" id="agent-page-resolved">-</span>
        </div>
        <div class="card" style="padding: 16px;">
          <i class="bi bi-shield-check card-icon" style="color: var(--accent-green); font-size: 1.4rem;"></i>
          <span class="card-label">SLA Atingido</span>
          <span class="card-value" id="agent-page-sla">-</span>
        </div>
        <div class="card" style="padding: 16px; border-color: rgba(41,163,255,0.3); background: linear-gradient(135deg, rgba(41,163,255,0.05), var(--panel) 60%);">
          <i class="bi bi-hourglass-split card-icon" style="color: var(--accent); font-size: 1.4rem;"></i>
          <span class="card-label">Aguardando</span>
          <span class="card-value" id="agent-page-awaiting">-</span>
        </div>
        <div class="card" style="padding: 16px; border-color: rgba(255,92,92,0.3); background: linear-gradient(135deg, rgba(255,92,92,0.05), var(--panel) 60%);">
          <i class="bi bi-arrow-repeat card-icon" style="color: var(--accent-red); font-size: 1.4rem;"></i>
          <span class="card-label">Reaberturas</span>
          <span class="card-value" id="agent-page-reopened">-</span>
        </div>
      </div>

      <!-- Comparativo com o Time -->
      <div class="panel" id="agent-page-team-compare" style="display: none; flex-direction: column; justify-content: center; position: relative; overflow: hidden;">
        <div style="position: absolute; right: -20px; top: -20px; opacity: 0.05; pointer-events: none;">
          <i class="bi bi-people-fill" style="font-size: 12rem;"></i>
        </div>
        
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0; z-index: 1;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Comparativo: <span id="agent-page-team-name" style="color: var(--text);"></span></h3>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px; z-index: 1;">
          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(52, 211, 153, 0.1); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="bi bi-stopwatch"></i>
              </div>
              <div>
                <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">1ª Resposta</span>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--text);" id="agent-page-frt">-</div>
              </div>
            </div>
            <div style="text-align: right; background: var(--panel); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);" id="agent-page-cmp-frt"></div>
          </div>

          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(41, 163, 255, 0.1); color: #29a3ff; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="bi bi-check2-all"></i>
              </div>
              <div>
                <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Resolução</span>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--text);" id="agent-page-res">-</div>
              </div>
            </div>
            <div style="text-align: right; background: var(--panel); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);" id="agent-page-cmp-res"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabelas de Resolução -->
    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3 style="margin: 0;"><i class="bi bi-flag"></i> Resolução por Prioridade</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="agent-page-priority-table">
            <thead><tr><th data-sort="string">Prioridade</th><th data-sort="number">Total</th><th data-sort="time" style="white-space: nowrap;">1ª Resposta</th><th data-sort="time">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3 style="margin: 0;"><i class="bi bi-chat-square-dots"></i> Resolução por Canal</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="agent-page-channel-table">
            <thead><tr><th data-sort="string">Canal</th><th data-sort="number">Total</th><th data-sort="time" style="white-space: nowrap;">1ª Resposta</th><th data-sort="time">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3 style="margin: 0;"><i class="bi bi-folder2-open"></i> Resolução por Assunto</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="agent-page-subject-table">
            <thead><tr><th data-sort="string">Assunto</th><th data-sort="number">Total</th><th data-sort="time" style="white-space: nowrap;">1ª Resposta</th><th data-sort="time">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Conversas Abertas e Etiquetas -->
    <div class="grid-3-cols" style="grid-template-columns: 1fr 300px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3 style="margin: 0;"><i class="bi bi-inbox"></i> Conversas Abertas</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table class="sortable" id="agent-page-open-table">
            <thead>
              <tr>
                <th data-sort="number">ID</th>
                <th data-sort="string">Pr.</th>
                <th data-sort="string">Assunto</th>
                <th data-sort="string">Cliente</th>
                <th data-sort="string">Canal</th>
                <th data-sort="time">SLA</th>
                <th></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 16px;">
          <h3 style="margin: 0;"><i class="bi bi-tags"></i> Abertas por Etiqueta</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table class="sortable" id="agent-page-labels-table">
            <thead><tr><th data-sort="string" style="width: 100%;">Etiqueta</th><th data-sort="number" style="text-align: right;">Total</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    const agentId = Number(window.__routeParam);
    if (!agentId) {
      document.getElementById('agent-page-title').textContent = 'Agente não encontrado';
      return;
    }

    const agentsStatus = await fetch('/monitor/api/agents/status').then(r => r.ok ? r.json() : []).catch(() => []);
    const agent = agentsStatus.find(a => a.agent_id === agentId);
    const agentName = agent ? agent.name : `Agente #${agentId}`;

    document.getElementById('agent-page-title').textContent = agentName;
    document.getElementById('agent-page-avatar').textContent = homeInitials(agentName);

    let selectedDays = 30;

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDays = Number(btn.dataset.days);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAgentDetailPage(agentId, selectedDays);
      });
    });

    await renderAgentDetailPage(agentId, selectedDays);
  },
};
