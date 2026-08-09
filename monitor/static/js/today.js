const KPI_COLUMNS = {
  'created-today': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'open': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'unassigned': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'awaiting-agent': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'breakdown': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
};

const TODAY_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

const TODAY_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill' } 
};

function todayPriorityBadge(val) {
  const prio = String(val ?? 'none').toLowerCase();
  const info = TODAY_PRIORITY_MAP[prio] || TODAY_PRIORITY_MAP.none;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todayChannelBadge(val) {
  const info = TODAY_CHANNEL_MAP[val] || TODAY_CHANNEL_MAP.other;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todaySlaBadge(minutesRemaining) {
  if (minutesRemaining === null || minutesRemaining === undefined) {
    return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  const late = minutesRemaining < 0;
  const absMinutes = Math.abs(minutesRemaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><i class="bi ${icon}"></i> ${late ? 'Atrasado ' : 'Em '}${formatDuration(absMinutes)}</span>`;
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
  document.querySelector('#kpi-modal-table thead').innerHTML = '<tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th></th></tr>';
  
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
        if (val === null || val === undefined) {
          val = '-';
        } else {
          const totalMin = Math.round(val);
          const days = Math.floor(totalMin / 1440);
          const hours = Math.floor((totalMin % 1440) / 60);
          val = days > 0 ? `${days}d ${hours}h` : formatDuration(val);
        }
      } else {
        val = val ?? '-';
      }
      
      return `<td>${val}</td>`;
    }).join('');

    return `<tr>${rowContent}<td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="window.open('${url}', '_blank')"></i></td></tr>`;
  }).join('');
  
  document.getElementById('kpi-modal').classList.remove('hidden');
}

function closeKpiModal() {
  document.getElementById('kpi-modal').classList.add('hidden');
}

Screens.today = {
  template: `
    <div class="chart-row-top">
      <div class="chart-hourly">
        <div class="canvas-container">
          <canvas id="chart-hourly"></canvas>
        </div>
      </div>
      <div class="kpi-clickable-group">
        <div class="kpi-clickable" data-kpi="created-today">
          <div class="kpi-header">
            <span class="card-label">Criadas hoje</span>
            <i class="bi bi-inbox" data-tooltip="Total de conversas iniciadas hoje"></i>
          </div>
          <span class="card-value" id="kpi-created-today">-</span>
        </div>
        <div class="kpi-clickable" data-kpi="open">
          <div class="kpi-header">
            <span class="card-label">Abertas</span>
            <i class="bi bi-envelope-open" data-tooltip="Conversas aguardando tratativa"></i>
          </div>
          <span class="card-value" id="kpi-open">-</span>
          <span class="card-compare" id="kpi-open-compare"></span>
        </div>
        <div class="kpi-clickable kpi-alert" data-kpi="unassigned">
          <div class="kpi-header">
            <span class="card-label">Não atribuídas</span>
            <i class="bi bi-exclamation-octagon" data-tooltip="Conversas sem agente responsável"></i>
          </div>
          <span class="card-value" id="kpi-unassigned">-</span>
          <span class="card-compare" id="kpi-unassigned-compare"></span>
        </div>
      </div>
    </div>

    <h2>Backlog atual</h2>
    <div class="cards" style="margin-bottom: 20px;">
      <div class="card kpi-clickable" data-kpi="awaiting-agent">
        <i class="bi bi-hourglass-split card-icon"></i>
        <span class="card-label">Aguardando resposta</span>
        <span class="card-value" id="kpi-awaiting-agent">-</span>
      </div>
    </div>

    <div class="breakdown-row" style="display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; flex-direction: row;">
      <div class="panel" style="flex: 1; min-width: 250px; margin-bottom: 0;">
        <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 1.1em; color: var(--text-muted);">Por Prioridade</h3>
        <div id="priority-list" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px;"></div>
      </div>
      <div class="panel" style="flex: 1; min-width: 250px; margin-bottom: 0;">
        <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 1.1em; color: var(--text-muted);">Por Etiqueta</h3>
        <div id="label-list" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px;"></div>
      </div>
    </div>

    <div class="attention-assignees-row">
      <div class="panel panel-attention">
        <h3>Precisam de atenção</h3>
        <div class="table-responsive">
          <table id="attention-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Assunto</th>
                <th>Agente</th>
                <th><span data-tooltip="Nível de urgência definido">Prioridade</span></th>
                <th>Canal</th>
                <th><span data-tooltip="Tempo restante até violar a meta">SLA</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <div class="panel"><h3>Atribuições hoje</h3><canvas id="chart-assignees"></canvas></div>
      <div class="panel"><h3>Resoluções hoje</h3><canvas id="chart-top-solvers"></canvas></div>
    </div>

    <div class="cards">
      <div class="card">
        <i class="bi bi-stopwatch card-icon"></i>
        <span class="card-label">1ª Resposta (hoje)</span>
        <span class="card-value" id="card-frt">-</span>
        <span class="card-desc">Tempo médio para a primeira interação</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-all card-icon"></i>
        <span class="card-label">Resolução (hoje)</span>
        <span class="card-value" id="card-res">-</span>
        <span class="card-desc">Tempo médio para fechamento</span>
      </div>
      <div class="card">
        <i class="bi bi-shield-check card-icon"></i>
        <span class="card-label">SLA Atingido (hoje)</span>
        <span class="card-value" id="card-sla-met">-</span>
        <span class="card-desc">Percentual de chamados no prazo</span>
      </div>
    </div>

    <div id="kpi-modal" class="modal hidden">
      <div class="modal-content">
        <button class="modal-close" onclick="closeKpiModal()">&times;</button>
        <h3 id="kpi-modal-title"></h3>
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

    document.getElementById('card-frt').textContent = formatDuration(firstResponseToday.avg_first_response);
    document.getElementById('card-res').textContent = formatDuration(kpis.avg_resolution);
    document.getElementById('kpi-created-today').textContent = createdToday.length || 0;
    document.getElementById('kpi-open').textContent = open.length || 0;
    document.getElementById('kpi-unassigned').textContent = unassigned.length || 0;
    document.getElementById('kpi-awaiting-agent').textContent = awaitingAgent.length || 0;

    const renderKpiRow = (label, total, color, onClick) => {
      const div = document.createElement('div');
      div.className = 'card kpi-clickable';
      div.style.display = 'flex';
      div.style.flexDirection = 'row';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.padding = '8px 12px';
      div.style.minHeight = 'auto';
      div.style.flex = '1 1 110px'; 
      div.style.minWidth = '110px';
      div.style.gap = '8px';
      div.innerHTML = `<div style="display:flex; align-items:center; gap: 8px; overflow: hidden;">
                        <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; flex-shrink: 0; box-shadow: 0 0 4px ${color}80;"></span>
                        <span style="font-weight: 500; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${label}">${label}</span>
                       </div>
                       <span style="font-size: 1.1em; font-weight: 600;">${total}</span>`;
      div.onclick = onClick;
      return div;
    };

    const prioMap = { 'urgent': 'Urgente', 'high': 'Alta', 'medium': 'Média', 'low': 'Baixa', 'none': 'Nenhuma' };
    const prioColors = { 'urgent': '#ff5c5c', 'high': '#ff5c5c', 'medium': '#ffc247', 'low': '#34d399', 'none': '#9296b8' };
    const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];

    const priorityContainer = document.getElementById('priority-list');
    PRIORITY_ORDER.forEach(p => {
      const found = (statusBreakdown.priority || []).find(r => r.priority === p);
      if (found && found.total > 0) {
        const el = renderKpiRow(prioMap[p], found.total, prioColors[p], 
            () => openKpiModal('breakdown', `/monitor/api/today/conversations/priority/${p}`, `Prioridade: ${prioMap[p]}`));
        priorityContainer.appendChild(el);
      }
    });
    if (priorityContainer.innerHTML === '') priorityContainer.innerHTML = '<div class="empty-state" style="width: 100%; padding: 10px;"><i class="bi bi-inbox" style="font-size: 1.5rem;"></i><span>Nenhum chamado aberto</span></div>';

    const labelColors = {
      'aberto': '#00FFD3',
      'andamento': '#FFFB00',
      'cancelado': '#FF0000',
      'cliente-cadastrado': '#29a3ff',
      'concluído': '#12FF00',
      'depto-pessoal': '#a679ff',
      'pendente-cliente': '#5606EE',
      'pendente-terceiro': '#23B382',
      'resolvido': '#12FF00',
    };

    const labelContainer = document.getElementById('label-list');
    if (!statusBreakdown.labels || statusBreakdown.labels.length === 0) {
      labelContainer.innerHTML = '<div class="empty-state" style="width: 100%; padding: 10px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Nenhuma etiqueta em uso</span></div>';
    } else {
      statusBreakdown.labels.forEach(l => {
        const color = labelColors[l.label.toLowerCase()] || '#9296b8';
        const el = renderKpiRow(l.label, l.total, color, 
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

    const renderCompare = (elId, current, previous) => {
      const el = document.getElementById(elId);
      const diff = current - previous;
      if (diff === 0) { el.textContent = '— igual à semana passada'; return; }
      const arrow = diff > 0 ? '▲' : '▼';
      el.textContent = `${arrow} ${Math.abs(diff)} vs semana passada`;
      el.classList.toggle('compare-up', diff > 0);
      el.classList.toggle('compare-down', diff < 0);
    };
    renderCompare('kpi-open-compare', open.length || 0, comparison.open_last_week ?? 0);
    renderCompare('kpi-unassigned-compare', unassigned.length || 0, comparison.unassigned_last_week ?? 0);

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
          { label: 'Criadas WhatsApp', data: fullDayData.map(r => r.created_whatsapp), backgroundColor: '#34d399', stack: 'created', borderRadius: 4 },
          { label: 'Criadas E-mail', data: fullDayData.map(r => r.created_email), backgroundColor: '#29a3ff', stack: 'created', borderRadius: 4 },
          { label: 'Outros', data: fullDayData.map(r => r.created_other), backgroundColor: '#9296b8', stack: 'created', borderRadius: 4 },
          { label: 'Resolvidas', data: fullDayData.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: 4 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: 'Conversas por hora', color: '#e8e8ea' }, legend: { labels: { color: '#e8e8ea' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9599a6', maxTicksLimit: 12 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } }
        },
      },
    });

    const attentionTbody = document.querySelector('#attention-table tbody');
    if (attention.length === 0) {
      attentionTbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green);"></i><span>Tudo tranquilo! Nenhum chamado precisando de atenção.</span></div></td></tr>`;
    } else {
      const chatwootBase = settings.chatwoot_base_url || '';
      const accountId = currentUser.account_id;

      attentionTbody.innerHTML = attention.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        
        return `<tr>
          <td>${r.conversation_id}</td>
          <td>${r.contact_name ?? '-'}</td>
          <td>${r.subject ?? '-'}</td>
          <td>${r.assignee_name ?? '-'}</td>
          <td>${todayPriorityBadge(r.priority)}</td>
          <td>${todayChannelBadge(r.channel)}</td>
          <td>${todaySlaBadge(r.minutes_remaining)}</td>
          <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="window.open('${url}', '_blank')"></i></td>
        </tr>`;
      }).join('');
    }

    renderChart('chart-assignees', {
      type: 'bar',
      data: { labels: assignees.map(r => r.assignee_name), datasets: [{ label: 'Conversas', data: assignees.map(r => r.total), backgroundColor: '#29a3ff', borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } },
          y: { grid: { display: false }, ticks: { color: '#9599a6' } }
        }
      },
    });

    renderChart('chart-top-solvers', {
      type: 'bar',
      data: { labels: solvers.map(r => r.assignee_name), datasets: [{ label: 'Resolvidas', data: solvers.map(r => r.resolved_count), backgroundColor: '#34d399', borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } },
          y: { grid: { display: false }, ticks: { color: '#9599a6' } }
        }
      },
    });
  },
};
