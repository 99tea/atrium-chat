const ME_DAYS_OPTIONS = [7, 14, 30, 90, 180];

const ME_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

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

function meSlaBadge(row) {
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  
  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i class="bi ${icon}"></i> ${late ? 'Atrasado ' : 'Em '}${formatDetailedDuration(absMinutes)}
          </span>`;
}

function mePriorityBadge(priority) {
  const prioMap = { 
    urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' }, 
    high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' }, 
    medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' }, 
    low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' }, 
    none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill' } 
  };
  const prio = String(priority || 'none').toLowerCase();
  const info = prioMap[prio] || prioMap.none;
  
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
            <i class="bi ${info.icon}"></i> ${info.label}
          </span>`;
}

function meLabelBadge(label) {
  const hex = getLabelColor(label);
  return `<span class="badge badge-neutral" style="margin-right:4px; display:inline-flex; align-items:center; gap:6px; padding-left:8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
            ${label}
          </span>`;
}

function meCompareValue(agentVal, teamVal) {
  if (agentVal === null || agentVal === undefined || teamVal === null || teamVal === undefined) {
    return `<span class="muted-text">-</span>`;
  }
  const better = agentVal <= teamVal;
  const diffPct = teamVal ? Math.abs(((agentVal - teamVal) / teamVal) * 100).toFixed(0) : 0;
  const color = better ? 'var(--accent-green)' : 'var(--accent-red)';
  const arrow = better ? 'bi-arrow-down-short' : 'bi-arrow-up-short';
  return `${formatDetailedDuration(agentVal)} <span style="color:${color}; font-size:0.85rem;"><i class="bi ${arrow}"></i>${diffPct}% vs time</span>`;
}

async function renderMeData(days) {
  const [detail, status, awaiting, reopened, settings] = await Promise.all([
    fetch(`/monitor/api/agents/${currentUser.id}/detail?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/monitor/api/status').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/monitor/api/me/awaiting').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/me/reopened?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);

  const s = detail.summary || {};
  document.getElementById('me-frt').textContent = formatDetailedDuration(s.avg_first_response);
  document.getElementById('me-res').textContent = formatDetailedDuration(s.avg_resolution);
  document.getElementById('me-resolved').textContent = s.total ?? 0;
  
  if (document.getElementById('me-avgresponse')) {
    document.getElementById('me-avgresponse').textContent = formatDetailedDuration(s.avg_response_time);
  }

  const slaEl = document.getElementById('me-sla');
  if (s.total) {
    const current = ((1 - s.resolution_breach_rate) * 100).toFixed(0);
    const target = settings.sla_target_percent || 95;
    slaEl.textContent = `${current}% / ${target}%`;
    slaEl.style.color = Number(current) >= Number(target) ? '#34d399' : '#f87171';
  } else {
    slaEl.textContent = '-';
    slaEl.style.color = '';
  }

  document.getElementById('me-awaiting').textContent = awaiting.length;
  document.getElementById('me-reopened').textContent = reopened.reopened ?? 0;

  const teamAvg = detail.team_avg;
  const compareEl = document.getElementById('me-team-compare');
  if (teamAvg && teamAvg.resolved_count > 0) {
    compareEl.style.display = 'flex';
    document.getElementById('me-team-name').textContent = TEAM_NAMES[teamAvg.team_id] || `Time ${teamAvg.team_id}`;
    document.getElementById('me-cmp-frt').innerHTML = meCompareValue(s.avg_first_response, teamAvg.avg_first_response);
    document.getElementById('me-cmp-res').innerHTML = meCompareValue(s.avg_resolution, teamAvg.avg_resolution);
  } else {
    compareEl.style.display = 'none';
  }

  const PRIORITY_ORDER_ME = ['urgent', 'high', 'medium', 'low', 'none'];
  const orderedPriority = PRIORITY_ORDER_ME.map(p => detail.by_priority?.find(r => r.priority === p) || { priority: p, total: 0, avg_resolution: null, avg_first_response: null });

  document.querySelector('#me-priority-table tbody').innerHTML = orderedPriority.map(r => `
    <tr>
      <td>${mePriorityBadge(r.priority)}</td>
      <td style="text-align: right;">${r.total}</td>
      <td style="text-align: right;">${formatDetailedDuration(r.avg_first_response)}</td>
      <td style="text-align: right;">${formatDetailedDuration(r.avg_resolution)}</td>
    </tr>
  `).join('');

  document.querySelector('#me-channel-table tbody').innerHTML = (detail.by_channel || []).length
    ? detail.by_channel.map(r => {
        const info = ME_CHANNEL_MAP[r.channel] || ME_CHANNEL_MAP.other;
        return `
          <tr>
            <td>
              <span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
                <i class="bi ${info.icon}"></i> ${info.label}
              </span>
            </td>
            <td style="text-align: right;">${r.total}</td>
            <td style="text-align: right;">${formatDetailedDuration(r.avg_first_response)}</td>
            <td style="text-align: right;">${formatDetailedDuration(r.avg_resolution)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 24px;"><i class="bi bi-chat-dots" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#me-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `
        <tr>
          <td style="font-weight: 500;">${r.subject}</td>
          <td style="text-align: right;">${r.total}</td>
          <td style="text-align: right;">${formatDetailedDuration(r.avg_first_response)}</td>
          <td style="text-align: right;">${formatDetailedDuration(r.avg_resolution)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 24px;"><i class="bi bi-folder2-open" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#me-labels-table tbody').innerHTML = (detail.open_labels || []).length
    ? detail.open_labels.map(r => `<tr><td>${meLabelBadge(r.label)}</td><td style="text-align: right;"><span class="badge badge-neutral">${r.total}</span></td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state" style="padding: 24px;"><i class="bi bi-tags" style="font-size: 1.5rem; margin-bottom: 8px;"></i><span>Nenhuma etiqueta</span></div></td></tr>';

  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.querySelector('#me-open-table tbody').innerHTML = status.length
    ? status.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const chInfo = ME_CHANNEL_MAP[r.channel] || ME_CHANNEL_MAP.other;
        return `
          <tr>
            <td style="font-weight: 500;">${r.conversation_id}</td>
            <td>${mePriorityBadge(r.priority)}</td>
            <td>${r.subject || '-'}</td>
            <td>${r.contact_name || '-'}</td>
            <td>
              <span class="badge ${chInfo.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
                <i class="bi ${chInfo.icon}"></i> ${chInfo.label}
              </span>
            </td>
            <td>${meSlaBadge(r)}</td>
            <td style="text-align: right;">
              <button class="topbar-btn" style="padding: 4px 8px;" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7"><div class="empty-state" style="padding: 40px 20px;"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 1.8rem; margin-bottom: 8px;"></i><span>Nenhuma conversa aberta no momento</span></div></td></tr>';
}

Screens.me = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" id="me-page-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent);"></div>
      <div>
        <h2 id="me-page-title" style="margin: 0 0 4px; font-size: 1.4rem;">Meus Dados</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Sua visão individual de desempenho</p>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 24px;">
      ${ME_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <!-- KPIs do Agente -->
      <div class="cards" style="margin-bottom: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div class="card" style="padding: 16px;">
          <i class="bi bi-check2-circle card-icon" style="color: var(--accent-yellow); font-size: 1.4rem;"></i>
          <span class="card-label">Resolvidas</span>
          <span class="card-value" id="me-resolved">-</span>
        </div>
        <div class="card" style="padding: 16px;">
          <i class="bi bi-shield-check card-icon" style="color: var(--accent-green); font-size: 1.4rem;"></i>
          <span class="card-label">SLA Atingido</span>
          <span class="card-value" id="me-sla">-</span>
        </div>
        <div class="card" style="padding: 16px; border-color: rgba(41,163,255,0.3); background: linear-gradient(135deg, rgba(41,163,255,0.05), var(--panel) 60%);">
          <i class="bi bi-hourglass-split card-icon" style="color: var(--accent); font-size: 1.4rem;"></i>
          <span class="card-label">Aguardando</span>
          <span class="card-value" id="me-awaiting">-</span>
        </div>
        <div class="card" style="padding: 16px; border-color: rgba(255,92,92,0.3); background: linear-gradient(135deg, rgba(255,92,92,0.05), var(--panel) 60%);">
          <i class="bi bi-arrow-repeat card-icon" style="color: var(--accent-red); font-size: 1.4rem;"></i>
          <span class="card-label">Reaberturas</span>
          <span class="card-value" id="me-reopened">-</span>
        </div>
      </div>

      <!-- Comparativo com o Time -->
      <div class="panel" id="me-team-compare" style="display: none; flex-direction: column; justify-content: center; position: relative; overflow: hidden; min-width: 0;">
        <div style="position: absolute; right: -20px; top: -20px; opacity: 0.05; pointer-events: none;">
          <i class="bi bi-people-fill" style="font-size: 12rem;"></i>
        </div>
        
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0; z-index: 1;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Comparativo: <span id="me-team-name" style="color: var(--text);"></span></h3>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px; z-index: 1;">
          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(52, 211, 153, 0.1); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="bi bi-stopwatch"></i>
              </div>
              <div>
                <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">1ª Resposta</span>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--text);" id="me-frt">-</div>
              </div>
            </div>
            <div style="text-align: right; background: var(--panel); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);" id="me-cmp-frt"></div>
          </div>

          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(41, 163, 255, 0.1); color: #29a3ff; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="bi bi-check2-all"></i>
              </div>
              <div>
                <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Resolução</span>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--text);" id="me-res">-</div>
              </div>
            </div>
            <div style="text-align: right; background: var(--panel); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);" id="me-cmp-res"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabelas de Resolução -->
    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-flag"></i> Resolução por Prioridade</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="me-priority-table">
            <thead><tr><th data-sort="string">Prioridade</th><th data-sort="number" style="text-align: right;">Total</th><th data-sort="time" style="white-space: nowrap; text-align: right;">1ª Resposta</th><th data-sort="time" style="text-align: right;">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-chat-square-dots"></i> Resolução por Canal</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="me-channel-table">
            <thead><tr><th data-sort="string">Canal</th><th data-sort="number" style="text-align: right;">Total</th><th data-sort="time" style="white-space: nowrap; text-align: right;">1ª Resposta</th><th data-sort="time" style="text-align: right;">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-folder2-open"></i> Resolução por Assunto</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <table class="sortable" id="me-subject-table">
            <thead><tr><th data-sort="string">Assunto</th><th data-sort="number" style="text-align: right;">Total</th><th data-sort="time" style="white-space: nowrap; text-align: right;">1ª Resposta</th><th data-sort="time" style="text-align: right;">Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Conversas Abertas e Etiquetas -->
    <div class="grid-3-cols" style="grid-template-columns: 1fr 300px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-inbox"></i> Minhas Conversas Abertas</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table class="sortable" id="me-open-table">
            <thead>
              <tr>
                <th data-sort="number">ID</th>
                <th data-sort="string">Pr.</th>
                <th data-sort="string">Assunto</th>
                <th data-sort="string">Cliente</th>
                <th data-sort="string">Canal</th>
                <th data-sort="time">SLA</th>
                <th style="text-align: right;">Ação</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-tags"></i> Abertas por Etiqueta</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table class="sortable" id="me-labels-table">
            <thead><tr><th data-sort="string" style="width: 100%;">Etiqueta</th><th data-sort="number" style="text-align: right;">Total</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `,
        load: async function () {
            let selectedDays = Number(localStorage.getItem('monitor-filter-days')) || 30;

            // Set Header Info
            document.getElementById('me-page-title').textContent = currentUser.name || 'Meus Dados';
            document.getElementById('me-page-avatar').textContent = homeInitials(currentUser.name || '?');

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
                
                await renderMeData(selectedDays); 
                
                content.classList.remove('loading');
              });
            });

            await renderMeData(selectedDays); 
          },
};
