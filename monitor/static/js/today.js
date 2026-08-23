const KPI_COLUMNS = {
  'created-today': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'open': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'unassigned': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'awaiting-agent': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'breakdown': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
};

// Mapas Encurtados para caber perfeitamente na tabela
const TODAY_CHANNEL_MAP = { 
  whatsapp: { label: 'WPP', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Out', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

const TODAY_PRIORITY_MAP = { 
  urgent: { label: 'Urg', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alt', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Med', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Bxa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nen', badge: 'badge-neutral', icon: 'bi-info-circle-fill' } 
};

// Formatação de tempo inteligente (Dias e Horas)
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

function todayPriorityBadge(val) {
  const prio = String(val ?? 'none').toLowerCase();
  const info = TODAY_PRIORITY_MAP[prio] || TODAY_PRIORITY_MAP.none;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 2px 6px; font-size: 0.65rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todayChannelBadge(val) {
  const info = TODAY_CHANNEL_MAP[val] || TODAY_CHANNEL_MAP.other;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 2px 6px; font-size: 0.65rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todaySlaBadge(minutesRemaining) {
  if (minutesRemaining === null || minutesRemaining === undefined) {
    return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px; padding: 2px 6px; font-size: 0.65rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis;"><i class="bi bi-clock-history"></i> -</span>`;
  }
  const late = minutesRemaining < 0;
  const absMinutes = Math.abs(minutesRemaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  // Omitindo as palavras "Atrasado/Em" para ganhar espaço (a cor já indica a situação)
  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px; padding: 2px 6px; font-size: 0.65rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis;"><i class="bi ${icon}"></i> ${formatDetailedDuration(absMinutes)}</span>`;
}

function rankTableRow(name, valueText, highlightColor = null) {
  const style = highlightColor ? `color: ${highlightColor}; font-weight: 600;` : '';
  return `<tr>
            <td style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${name}">${name}</td>
            <td style="text-align: right; ${style}">${valueText}</td>
          </tr>`;
}

async function openKpiModal(kpi, endpointOverride = null, titleOverride = null) {
  const endpoint = endpointOverride || `/monitor/api/today/kpi/${kpi}`;
  const [data, settings] = await Promise.all([
    fetch(endpoint).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  ]);
  
  const rows = Array.isArray(data) ? data : [];
  const cols = KPI_COLUMNS[kpi] || KPI_COLUMNS['breakdown'];
  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;
  
  const defaultTitle = document.querySelector(`[data-kpi="${kpi}"] .card-label`)?.textContent || 'Detalhes';
  
  document.getElementById('kpi-modal-title').textContent = titleOverride || defaultTitle;  
  document.querySelector('#kpi-modal-table thead').innerHTML = '<tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th style="text-align: right;">Ação</th></tr>';
  
  document.querySelector('#kpi-modal-table tbody').innerHTML = rows.map(r => {
    const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
    
    const rowContent = cols.map(c => {
      let val = r[c[0]];

      if (c[0] === 'priority') {
        val = todayPriorityBadge(val);
      } else if (c[0] === 'channel') {
        val = todayChannelBadge(val);
      } else if (c[0] === 'status') {
        const status = String(val ?? '-').toLowerCase();
        const statusBadge = status === 'open' ? 'badge-green' : 'badge-neutral';
        val = `<span class="badge ${statusBadge}">${val}</span>`;
      } else if (c[0] === 'age_minutes') {
        val = formatDetailedDuration(val);
      } else {
        val = val ?? '-';
      }
      
      return `<td>${val}</td>`;
    }).join('');

    return `<tr>${rowContent}<td style="text-align: right;"><button class="topbar-btn" style="padding: 4px 8px;" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')"><i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i></button></td></tr>`;
  }).join('');
  
  document.getElementById('kpi-modal').classList.remove('hidden');
}

function closeKpiModal() {
  document.getElementById('kpi-modal').classList.add('hidden');
}

Screens.today = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent-blue);">
        <i class="bi bi-calendar2-day"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Visão Hoje</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Métricas e acompanhamento do dia atual</p>
      </div>
    </div>

    <div class="chart-row-top">
      <div class="chart-hourly panel" style="display: flex; flex-direction: column; min-width: 0; margin-bottom: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-bar-chart"></i> Conversas por hora</h3>
        </div>
        <div class="canvas-container" style="flex: 1; min-height: 280px; min-width: 0;">
          <canvas id="chart-hourly"></canvas>
        </div>
      </div>
      
      <div class="kpi-clickable-group" style="display: flex; flex-direction: column; gap: 16px; min-width: 0;">
        <div class="kpi-clickable card" data-kpi="created-today" style="flex: 1; padding: 20px; align-items: flex-start; text-align: left; margin: 0;">
          <div class="kpi-header" style="margin-bottom: 4px;">
            <span class="card-label" style="margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Criadas hoje</span>
            <i class="bi bi-inbox" style="font-size: 1.2rem; color: var(--accent-blue);"></i>
          </div>
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span class="card-value" id="kpi-created-today" style="font-size: 2.5rem;">-</span>
          </div>
        </div>
        
        <div class="kpi-clickable card" data-kpi="open" style="flex: 1; padding: 20px; align-items: flex-start; text-align: left; margin: 0;">
          <div class="kpi-header" style="margin-bottom: 4px;">
            <span class="card-label" style="margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Abertas</span>
            <i class="bi bi-envelope-open" style="font-size: 1.2rem; color: var(--accent-yellow);"></i>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <span class="card-value" id="kpi-open" style="font-size: 2.2rem; line-height: 1;">-</span>
            <div id="kpi-open-badge"></div>
          </div>
          <div id="kpi-open-bars" style="width: 100%; display: flex; flex-direction: column; gap: 6px;"></div>
        </div>
        
        <div class="kpi-clickable kpi-alert card" data-kpi="unassigned" style="flex: 1; padding: 20px; align-items: flex-start; text-align: left; margin: 0;">
          <div class="kpi-header" style="margin-bottom: 4px;">
            <span class="card-label" style="margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Não atribuídas</span>
            <i class="bi bi-exclamation-octagon" style="font-size: 1.2rem; color: var(--accent-red);"></i>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <span class="card-value" id="kpi-unassigned" style="font-size: 2.2rem; line-height: 1; color: var(--accent-red);">-</span>
            <div id="kpi-unassigned-badge"></div>
          </div>
          <div id="kpi-unassigned-bars" style="width: 100%; display: flex; flex-direction: column; gap: 6px;"></div>
        </div>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="card" style="flex-direction: row; justify-content: flex-start; gap: 16px; padding: 20px;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(52, 211, 153, 0.1); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          <i class="bi bi-stopwatch"></i>
        </div>
        <div style="text-align: left;">
          <span class="card-label" style="margin: 0 0 4px;">1ª Resposta (Média)</span>
          <span class="card-value" id="card-frt" style="font-size: 1.5rem;">-</span>
        </div>
      </div>
      <div class="card" style="flex-direction: row; justify-content: flex-start; gap: 16px; padding: 20px;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(41, 163, 255, 0.1); color: #29a3ff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          <i class="bi bi-check2-all"></i>
        </div>
        <div style="text-align: left;">
          <span class="card-label" style="margin: 0 0 4px;">Resolução (Média)</span>
          <span class="card-value" id="card-res" style="font-size: 1.5rem;">-</span>
        </div>
      </div>
      <div class="card" style="flex-direction: row; justify-content: flex-start; gap: 16px; padding: 20px;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(255, 194, 71, 0.1); color: var(--accent-yellow); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          <i class="bi bi-shield-check"></i>
        </div>
        <div style="text-align: left;">
          <span class="card-label" style="margin: 0 0 4px;">SLA Atingido</span>
          <span class="card-value" id="card-sla-met" style="font-size: 1.5rem;">-</span>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 24px;">
      <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
        <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Detalhamento de Fila</h3>
      </div>
      
      <div class="grid-3-cols" style="margin-bottom: 0;">
        <div class="card kpi-clickable" data-kpi="awaiting-agent" style="margin: 0; padding: 24px 16px; border-color: rgba(41,163,255,0.3); background: linear-gradient(135deg, rgba(41,163,255,0.05), var(--panel) 60%); display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <i class="bi bi-hourglass-split" style="font-size: 1.8rem; color: var(--accent-blue); margin-bottom: 12px;"></i>
          <span class="card-label" style="margin: 0 0 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Aguardando Agente</span>
          <span class="card-value" id="kpi-awaiting-agent" style="font-size: 2.5rem; line-height: 1;">-</span>
        </div>

        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
          <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 12px;">Por Prioridade</span>
          <div id="priority-list" style="display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;"></div>
        </div>

        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
          <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 12px;">Por Etiqueta</span>
          <div id="label-list" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 160px; overflow-y: auto; padding-right: 4px; align-content: flex-start;"></div>
        </div>
      </div>
    </div>

    <div class="attention-assignees-row">
      <div class="panel panel-attention" style="display: flex; flex-direction: column; min-width: 0; margin-bottom: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-exclamation-triangle"></i> Precisam de Atenção</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 350px; overflow-x: hidden;">
          <table id="attention-table" style="table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th style="font-size: 0.7rem; width: 8%;">ID</th>
                <th style="font-size: 0.7rem; width: 18%;">Cliente</th>
                <th style="font-size: 0.7rem; width: 18%;">Assunto</th>
                <th style="font-size: 0.7rem; width: 14%;">Agente</th>
                <th style="font-size: 0.7rem; width: 11%;">Pr.</th>
                <th style="font-size: 0.7rem; width: 13%;">Canal</th>
                <th style="font-size: 0.7rem; width: 14%;">SLA</th>
                <th style="text-align: right; font-size: 0.7rem; width: 4%;"></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 18px; min-width: 0;">
        <div class="panel" style="display: flex; flex-direction: column; flex: 1; min-width: 0; margin-bottom: 0;">
          <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
            <h3 style="margin: 0;"><i class="bi bi-person-lines-fill"></i> Atribuições Hoje</h3>
          </div>
          <div class="table-responsive" style="flex: 1; max-height: 250px;">
            <table id="table-today-assignees" class="sortable">
              <thead><tr><th data-sort="string">Agente</th><th data-sort="number" style="text-align: right;">Atribuídas</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        
        <div class="panel" style="display: flex; flex-direction: column; flex: 1; min-width: 0; margin-bottom: 0;">
          <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
            <h3 style="margin: 0;"><i class="bi bi-trophy"></i> Resoluções Hoje</h3>
          </div>
          <div class="table-responsive" style="flex: 1; max-height: 250px;">
            <table id="table-today-solvers" class="sortable">
              <thead><tr><th data-sort="string">Agente</th><th data-sort="number" style="text-align: right;">Resolvidas</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div id="kpi-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 1000px;">
        <button class="modal-close" onclick="closeKpiModal()">&times;</button>
        <h3 id="kpi-modal-title" style="margin-top: 0; padding-bottom: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px;">
          <i class="bi bi-table" style="color: var(--accent-blue);"></i> Detalhes
        </h3>
        <div class="table-responsive" style="max-height: 65vh; margin-top: 10px;">
          <table id="kpi-modal-table"><thead></thead><tbody></tbody></table>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    const oldModal = document.querySelector('body > #kpi-modal');
    if (oldModal) oldModal.remove();
  
    const modalEl = document.getElementById('kpi-modal');
    if (modalEl) {
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', function(e) {
        if (e.target === this) closeKpiModal();
      });
    }

    const [kpis, hourly, createdToday, open, unassigned, comparison, attention, assignees, solvers, settings, awaitingAgent, statusBreakdown, firstResponseToday] = await Promise.all([
      fetch('/monitor/api/today/kpis').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/monitor/api/today/hourly').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/kpi/created-today').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/kpi/open').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/kpi/unassigned').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/comparison').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/monitor/api/today/attention').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/assignees').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/today/top-solvers').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/monitor/api/today/kpi/awaiting-agent').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/overview/status-breakdown').then(r => r.ok ? r.json() : { priority: [], labels: [] }).catch(() => ({ priority: [], labels: [] })),
      fetch('/monitor/api/today/first-response').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);

    document.getElementById('card-frt').textContent = formatDetailedDuration(firstResponseToday.avg_first_response);
    document.getElementById('card-res').textContent = formatDetailedDuration(kpis.avg_resolution);
    document.getElementById('kpi-created-today').textContent = createdToday.length || 0;
    document.getElementById('kpi-open').textContent = open.length || 0;
    document.getElementById('kpi-unassigned').textContent = unassigned.length || 0;
    document.getElementById('kpi-awaiting-agent').textContent = awaitingAgent.length || 0;

    const renderKpiGridSquare = (label, total, color, onClick) => {
      const div = document.createElement('div');
      div.className = 'kpi-clickable card';
      
      div.style.width = '76px';
      div.style.height = '76px';
      div.style.flexShrink = '0';
      
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.justifyContent = 'center';
      div.style.alignItems = 'center';
      div.style.padding = '8px';
      div.style.margin = '0';
      div.style.gap = '6px';
      div.style.textAlign = 'center';
      div.style.cursor = 'pointer';
      
      div.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${color}; flex-shrink: 0; box-shadow: 0 0 4px ${color}80;"></span>
          <span style="font-weight: 600; font-size: 0.65rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); text-transform: uppercase;" title="${label}">${label}</span>
        </div>
        <span style="font-size: 1.4rem; font-weight: 700; line-height: 1; color: var(--text);">${total}</span>`;
      div.onclick = onClick;
      return div;
    };

    // Usando nomes cheios para o Grid Quadrado
    const prioMapFull = { 'urgent': 'Urgente', 'high': 'Alta', 'medium': 'Média', 'low': 'Baixa', 'none': 'Nenhuma' };
    const prioColors = { 'urgent': '#ff5c5c', 'high': '#ff5c5c', 'medium': '#ffc247', 'low': '#34d399', 'none': '#9296b8' };
    const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];

    const priorityContainer = document.getElementById('priority-list');
    PRIORITY_ORDER.forEach(p => {
      const found = (statusBreakdown.priority || []).find(r => r.priority === p);
      if (found && found.total > 0) {
        const el = renderKpiGridSquare(prioMapFull[p], found.total, prioColors[p], 
            () => openKpiModal('breakdown', `/monitor/api/today/conversations/priority/${p}`, `Prioridade: ${prioMapFull[p]}`));
        priorityContainer.appendChild(el);
      }
    });
    if (priorityContainer.innerHTML === '') priorityContainer.innerHTML = '<div class="empty-state" style="width: 100%; padding: 10px;"><i class="bi bi-inbox" style="font-size: 1.5rem;"></i><span>Nenhum chamado aberto</span></div>';

    const labelContainer = document.getElementById('label-list');
    if (!statusBreakdown.labels || statusBreakdown.labels.length === 0) {
      labelContainer.innerHTML = '<div class="empty-state" style="width: 100%; padding: 10px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Nenhuma etiqueta em uso</span></div>';
    } else {
      statusBreakdown.labels.forEach(l => {
        const color = getLabelColor(l.label);
        const el = renderKpiGridSquare(l.label, l.total, color, 
            () => openKpiModal('breakdown', `/monitor/api/today/conversations/label/${encodeURIComponent(l.label)}`, `Etiqueta: ${l.label}`));
        labelContainer.appendChild(el);
      });
    }
    
    const cardSlaMet = document.getElementById('card-sla-met');
    if (kpis.total) {
      const currentSla = ((1 - kpis.resolution_breach_rate) * 100).toFixed(0);
      const targetSla = settings.sla_target_percent || 95;
      
      cardSlaMet.textContent = `${currentSla}% / ${targetSla}%`;
      cardSlaMet.style.color = Number(currentSla) >= Number(targetSla) ? '#34d399' : '#f87171';
    } else {
      cardSlaMet.textContent = '-';
      cardSlaMet.style.color = '';
    }

    const renderCompareBars = (elId, current, previous, themeColor) => {
      const badgeEl = document.getElementById(`${elId}-badge`);
      const barsEl = document.getElementById(`${elId}-bars`);
      
      if (!badgeEl || !barsEl) return;
      
      const diff = current - previous;
      const maxVal = Math.max(current, previous, 1);
      const prevPct = (previous / maxVal) * 100;
      const currPct = (current / maxVal) * 100;
      
      if (diff === 0) {
        badgeEl.innerHTML = `<span class="badge badge-neutral" style="font-size: 0.65rem; text-transform: uppercase;">= Igual</span>`;
      } else {
        const isGood = diff < 0; 
        const colorClass = isGood ? 'badge-green' : 'badge-red';
        const icon = isGood ? 'bi-graph-down-arrow' : 'bi-graph-up-arrow';
        badgeEl.innerHTML = `<span class="badge ${colorClass}" style="font-size: 0.65rem;"><i class="bi ${icon}"></i> ${Math.abs(diff)} vs Sem. Pass.</span>`;
      }
      
      barsEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
           <span style="font-size: 0.65rem; color: var(--muted); width: 30px; text-align: right;">${previous}</span>
           <div style="flex: 1; height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; border: 1px solid var(--border);">
              <div style="width: ${prevPct}%; height: 100%; background: var(--muted); opacity: 0.5;"></div>
           </div>
         </div>
         <div style="display: flex; align-items: center; gap: 8px;">
           <span style="font-size: 0.65rem; color: var(--text); font-weight: bold; width: 30px; text-align: right;">${current}</span>
           <div style="flex: 1; height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; border: 1px solid var(--border);">
              <div style="width: ${currPct}%; height: 100%; background: ${themeColor}; box-shadow: 0 0 5px ${themeColor}80;"></div>
           </div>
         </div>
      `;
    };

    renderCompareBars('kpi-open', open.length || 0, comparison.open_last_week ?? 0, 'var(--accent-yellow)');
    renderCompareBars('kpi-unassigned', unassigned.length || 0, comparison.unassigned_last_week ?? 0, 'var(--accent-red)');

    document.querySelectorAll('.kpi-clickable[data-kpi]').forEach(el => {
      el.onclick = () => openKpiModal(el.dataset.kpi);
    });

    const fullDayData = Array.from({length: 24}, (_, i) => {
      const hrStr = i.toString().padStart(2, '0') + ':00';
      const found = hourly.find(r => new Date(r.hour).getHours() === i);
      return {
        hour: hrStr,
        created_whatsapp: found ? found.created_whatsapp : 0,
        created_email: found ? found.created_email : 0,
        created_other: found ? found.created_other : 0,
        resolved: found ? found.resolved : 0,
      };
    });

    renderChart('chart-hourly', {
      type: 'bar',
      data: {
        labels: fullDayData.map(r => r.hour),
        datasets: [
          { label: 'WhatsApp', data: fullDayData.map(r => r.created_whatsapp), backgroundColor: '#34d399', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
          { label: 'E-mail', data: fullDayData.map(r => r.created_email), backgroundColor: '#29a3ff', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
          { label: 'Outros', data: fullDayData.map(r => r.created_other), backgroundColor: '#9296b8', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
          { label: 'Resolvidas', data: fullDayData.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
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
          y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } } }
        },
      },
    });

    const attentionTbody = document.querySelector('#attention-table tbody');
    if (attention.length === 0) {
      attentionTbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding: 40px 20px;"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 2.5rem; margin-bottom: 12px;"></i><span style="font-size: 1.1rem; color: var(--text);">Tudo tranquilo!</span><span style="font-size: 0.9rem;">Nenhum chamado precisando de atenção.</span></div></td></tr>`;
    } else {
      const chatwootBase = settings.chatwoot_base_url || '';
      const accountId = currentUser.account_id;

      attentionTbody.innerHTML = attention.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        
        return `<tr>
          <td style="font-weight: 600; font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.conversation_id}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem;" title="${r.contact_name ?? '-'}">${r.contact_name ?? '-'}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem;" title="${r.subject ?? '-'}">${r.subject ?? '-'}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem;" title="${r.assignee_name ?? '-'}">${r.assignee_name ?? '-'}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${todayPriorityBadge(r.priority)}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${todayChannelBadge(r.channel)}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${todaySlaBadge(r.minutes_remaining)}</td>
          <td style="text-align: right; padding: 4px;">
            <button class="topbar-btn" style="padding: 4px 6px; display: inline-flex;" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
              <i class="bi bi-box-arrow-up-right" style="font-size: 0.8rem;"></i>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    const assigneesHtml = assignees.length > 0 
      ? assignees.sort((a,b) => b.total - a.total).map(a => rankTableRow(a.assignee_name, a.total, 'var(--accent-blue)')).join('')
      : '<tr><td colspan="2"><div class="empty-state" style="padding: 16px;"><i class="bi bi-inbox" style="font-size: 1.2rem; margin-bottom: 4px;"></i><span>Sem dados</span></div></td></tr>';
    document.querySelector('#table-today-assignees tbody').innerHTML = assigneesHtml;

    const solversHtml = solvers.length > 0
      ? solvers.sort((a,b) => b.resolved_count - a.resolved_count).map(s => rankTableRow(s.assignee_name, s.resolved_count, 'var(--accent-green)')).join('')
      : '<tr><td colspan="2"><div class="empty-state" style="padding: 16px;"><i class="bi bi-inbox" style="font-size: 1.2rem; margin-bottom: 4px;"></i><span>Sem dados</span></div></td></tr>';
    document.querySelector('#table-today-solvers tbody').innerHTML = solversHtml;

  },
};
