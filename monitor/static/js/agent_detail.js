const AGENT_DETAIL_DAYS_OPTIONS = [7, 14, 30, 90, 180];

let AGENT_DETAIL_CHANNEL_INFO = {};

async function loadAgentDetailChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  AGENT_DETAIL_CHANNEL_INFO = {};
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      AGENT_DETAIL_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-whatsapp' };
    } else if (c.channel_key === 'email') {
      AGENT_DETAIL_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: 'bi-envelope' };
    } else {
      AGENT_DETAIL_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
    }
  });
  AGENT_DETAIL_CHANNEL_INFO.other = { label: 'Outros', classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
}

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

function agentDetailSlaBadge(row) {
  const baseCls = "inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap";
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return `<span class="${baseCls} bg-border/30 text-muted border-border"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  const color = late ? 'text-accent-red bg-accent-red/10 border-accent-red/20' : 'text-accent-green bg-accent-green/10 border-accent-green/20';
  
  return `<span class="${baseCls} ${color}"><i class="bi ${icon}"></i> ${late ? 'Atraso ' : 'Em '}${formatDetailedDuration(absMinutes)}</span>`;
}

function agentDetailPriorityBadge(priority) {
  const prioMap = { 
    urgent: { label: 'Urgente', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-exclamation-triangle-fill' }, 
    high: { label: 'Alta', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-arrow-up-circle-fill' }, 
    medium: { label: 'Média', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill' }, 
    low: { label: 'Baixa', classes: 'text-muted bg-border/30 border-border', icon: 'bi-arrow-down-circle-fill' }, 
    none: { label: 'Nenhuma', classes: 'text-muted bg-border/30 border-border', icon: 'bi-info-circle-fill' } 
  };
  const prio = String(priority || 'none').toLowerCase();
  const info = prioMap[prio] || prioMap.none;
  
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}">
            <i class="bi ${info.icon}"></i> ${info.label}
          </span>`;
}

function agentDetailLabelBadge(label) {
  const hex = getLabelColor(label);
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md bg-border/30 text-muted border border-border whitespace-nowrap">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
            ${label}
          </span>`;
}

function agentDetailCompareValue(agentVal, teamVal) {
  if (agentVal === null || agentVal === undefined || teamVal === null || teamVal === undefined) {
    return `<span class="text-muted text-sm">-</span>`;
  }
  const better = agentVal <= teamVal;
  const diffPct = teamVal ? Math.abs(((agentVal - teamVal) / teamVal) * 100).toFixed(0) : 0;
  const color = better ? 'text-accent-green' : 'text-accent-red';
  const icon = better ? 'bi-arrow-down-short' : 'bi-arrow-up-short';
  return `<div class="flex flex-col text-right">
            <span class="text-lg font-bold text-text">${formatDetailedDuration(agentVal)}</span>
            <span class="text-[0.7rem] font-semibold ${color}"><i class="bi ${icon}"></i>${diffPct}% vs time</span>
          </div>`;
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
  document.getElementById('agent-page-frt').textContent = formatDetailedDuration(s.avg_first_response);
  document.getElementById('agent-page-res').textContent = formatDetailedDuration(s.avg_resolution);
  document.getElementById('agent-page-resolved').textContent = s.total ?? 0;

  const slaEl = document.getElementById('agent-page-sla');
  if (s.total) {
    const current = ((1 - s.resolution_breach_rate) * 100).toFixed(0);
    const target = settings.sla_target_percent || 95;
    slaEl.textContent = `${current}% / ${target}%`;
    slaEl.className = `text-2xl font-bold leading-none ${Number(current) >= Number(target) ? 'text-accent-green glow-text' : 'text-accent-red glow-text'}`;
  } else {
    slaEl.textContent = '-';
    slaEl.className = 'text-2xl font-bold leading-none text-text';
  }

  document.getElementById('agent-page-awaiting').textContent = awaiting.length;
  document.getElementById('agent-page-reopened').textContent = reopened.reopened ?? 0;

  const teamAvg = detail.team_avg;
  const compareEl = document.getElementById('agent-page-team-compare');
  if (teamAvg && teamAvg.resolved_count > 0) {
    compareEl.classList.remove('hidden');
    compareEl.classList.add('flex');
    document.getElementById('agent-page-team-name').innerHTML = `Comparativo: <span class="text-accent-blue">${TEAM_NAMES[teamAvg.team_id] || `Time ${teamAvg.team_id}`}</span>`;
    document.getElementById('agent-page-cmp-frt').classList.remove('hidden');
    document.getElementById('agent-page-cmp-frt').innerHTML = agentDetailCompareValue(s.avg_first_response, teamAvg.avg_first_response);
    document.getElementById('agent-page-cmp-res').classList.remove('hidden');
    document.getElementById('agent-page-cmp-res').innerHTML = agentDetailCompareValue(s.avg_resolution, teamAvg.avg_resolution);
  } else {
    compareEl.classList.add('hidden');
    compareEl.classList.remove('flex');
  }

  const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];
  const orderedPriority = PRIORITY_ORDER.map(p => detail.by_priority?.find(r => r.priority === p) || { priority: p, total: 0, avg_resolution: null, avg_first_response: null });

  document.querySelector('#agent-page-priority-table tbody').innerHTML = orderedPriority.map(r => `
    <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-3 py-2.5 truncate w-[130px]">${agentDetailPriorityBadge(r.priority)}</td>
      <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-muted">${r.total}</td>
      <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_first_response)}</td>
      <td class="px-3 py-2.5 text-right font-bold text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_resolution)}</td>
    </tr>
  `).join('');

  document.querySelector('#agent-page-channel-table tbody').innerHTML = (detail.by_channel || []).length
    ? detail.by_channel.map(r => {
        const info = AGENT_DETAIL_CHANNEL_INFO[r.channel] || AGENT_DETAIL_CHANNEL_INFO.other;
        return `
          <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-3 py-2.5 truncate w-[130px]">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}">
                <i class="bi ${info.icon}"></i> ${info.label}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-muted">${r.total}</td>
            <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_first_response)}</td>
            <td class="px-3 py-2.5 text-right font-bold text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_resolution)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4"><div class="p-4 text-center text-muted"><i class="bi bi-chat-dots text-xl block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>';

  document.querySelector('#agent-page-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `
        <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
          <td class="px-3 py-2.5 font-medium text-[0.8rem] text-text truncate max-w-[120px]" title="${r.subject}">${r.subject}</td>
          <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-muted">${r.total}</td>
          <td class="px-3 py-2.5 text-right font-medium text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_first_response)}</td>
          <td class="px-3 py-2.5 text-right font-bold text-[0.8rem] text-text whitespace-nowrap">${formatDetailedDuration(r.avg_resolution)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="p-4 text-center text-muted"><i class="bi bi-folder2-open text-xl block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>';

  document.querySelector('#agent-page-labels-table tbody').innerHTML = (detail.open_labels || []).length
    ? detail.open_labels.map(r => `
        <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
          <td class="px-4 py-3 truncate max-w-[200px]" title="${r.label}">${agentDetailLabelBadge(r.label)}</td>
          <td class="px-4 py-3 text-right"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.75rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${r.total}</span></td>
        </tr>`).join('')
    : '<tr><td colspan="2"><div class="p-6 text-center text-muted"><i class="bi bi-tags text-2xl block mb-2"></i><span class="text-sm">Nenhuma etiqueta</span></div></td></tr>';

  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.querySelector('#agent-page-open-table tbody').innerHTML = openConvs.length
    ? openConvs.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const chInfo = AGENT_DETAIL_CHANNEL_INFO[r.channel] || AGENT_DETAIL_CHANNEL_INFO.other;
        return `
          <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-3 py-3 font-semibold text-[0.75rem] text-text whitespace-nowrap">${r.conversation_id}</td>
            <td class="px-3 py-3 truncate">${agentDetailPriorityBadge(r.priority)}</td>
            <td class="px-3 py-3 font-medium text-[0.75rem] text-text truncate max-w-[150px]" title="${r.subject || ''}">${r.subject || '-'}</td>
            <td class="px-3 py-3 font-medium text-[0.75rem] text-text truncate max-w-[120px]" title="${r.contact_name || ''}">${r.contact_name || '-'}</td>
            <td class="px-3 py-3 truncate">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${chInfo.classes}"><i class="bi ${chInfo.icon}"></i> ${chInfo.label}</span>
            </td>
            <td class="px-3 py-3 truncate">${agentDetailSlaBadge(r)}</td>
            <td class="px-3 py-3 text-right w-[40px]">
              <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right text-[0.8rem]"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7"><div class="py-12 text-center flex flex-col items-center"><i class="bi bi-emoji-smile text-[2.5rem] text-accent-green mb-3"></i><span class="text-[1.1rem] text-text font-medium">Caixa limpa!</span><span class="text-[0.9rem] text-muted">Nenhuma conversa aberta no momento.</span></div></td></tr>';
}

Screens.agent = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div id="agent-page-avatar" class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0 bg-accent text-white shadow-sm glow-border"></div>
          <div>
            <h2 id="agent-page-title" class="m-0 mb-1 text-[1.4rem] font-bold text-text">Detalhes do Agente</h2>
            <p class="m-0 text-[0.9rem] text-muted">Visão individual de desempenho</p>
          </div>
        </div>

        <div id="agent-date-filters" class="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
          ${AGENT_DETAIL_DAYS_OPTIONS.map(d => `<button id="btn-ag-${d}" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-days="${d}">${d}D</button>`).join('')}
        </div>
      </div>

      <!-- Linha Superior: Cards e Comparativo -->
      <div class="grid grid-cols-1 xl:grid-cols-[1fr_minmax(350px,auto)] gap-6 mb-2">
        
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-yellow/50 transition-colors group relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-check2-circle text-[4rem] text-accent-yellow"></i></div>
            <i class="bi bi-check2-circle text-2xl text-accent-yellow mb-2 relative z-10"></i>
            <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Resolvidas</span>
            <span class="text-2xl font-bold text-text leading-none relative z-10" id="agent-page-resolved">-</span>
          </div>
          <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-green/50 transition-colors group relative overflow-hidden">
            <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-shield-check text-[4rem] text-accent-green"></i></div>
            <i class="bi bi-shield-check text-2xl text-accent-green mb-2 relative z-10"></i>
            <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">SLA Atingido</span>
            <span class="text-2xl font-bold text-text leading-none relative z-10" id="agent-page-sla">-</span>
          </div>
          <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-blue/50 transition-colors group relative overflow-hidden bg-gradient-to-br from-accent-blue/5 to-panel">
            <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-hourglass-split text-[4rem] text-accent-blue"></i></div>
            <i class="bi bi-hourglass-split text-2xl text-accent-blue mb-2 relative z-10"></i>
            <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Aguardando</span>
            <span class="text-2xl font-bold text-text leading-none relative z-10" id="agent-page-awaiting">-</span>
          </div>
          <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-red/50 transition-colors group relative overflow-hidden bg-gradient-to-br from-accent-red/5 to-panel">
            <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-arrow-repeat text-[4rem] text-accent-red"></i></div>
            <i class="bi bi-arrow-repeat text-2xl text-accent-red mb-2 relative z-10"></i>
            <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Reaberturas</span>
            <span class="text-2xl font-bold text-text leading-none relative z-10" id="agent-page-reopened">-</span>
          </div>
        </div>

        <div id="agent-page-team-compare" class="panel-card hidden relative overflow-hidden bg-panel border border-border rounded-xl shadow-sm p-6 flex-col justify-center min-w-0">
          <div class="absolute -right-6 -top-6 opacity-5 pointer-events-none">
            <i class="bi bi-people-fill text-[12rem]"></i>
          </div>
          <div class="mb-4 z-10">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-muted"></i> <span id="agent-page-team-name">Tempos Médios</span></h3>
          </div>
          <div class="flex flex-col gap-3 z-10">
            <div class="bg-bg border border-border rounded-xl p-3 flex justify-between items-center shadow-inner">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center text-xl shrink-0"><i class="bi bi-stopwatch"></i></div>
                <div class="flex flex-col">
                  <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-0.5">1ª Resposta</span>
                  <span id="agent-page-frt" class="text-[1.15rem] font-bold text-text leading-none">-</span>
                </div>
              </div>
              <div id="agent-page-cmp-frt" class="hidden"></div>
            </div>
            <div class="bg-bg border border-border rounded-xl p-3 flex justify-between items-center shadow-inner">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center text-xl shrink-0"><i class="bi bi-check2-all"></i></div>
                <div class="flex flex-col">
                  <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-0.5">Resolução</span>
                  <span id="agent-page-res" class="text-[1.15rem] font-bold text-text leading-none">-</span>
                </div>
              </div>
              <div id="agent-page-cmp-res" class="hidden"></div>
            </div>
          </div>
        </div>

      </div>

      <!-- Linha do Meio: 3 Tabelas -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-flag text-muted"></i> Resolução por Prioridade</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <table id="agent-page-priority-table" class="sortable w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string" style="width: 120px;">Prioridade</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="number" style="width: 60px;">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text whitespace-nowrap bg-panel" data-sort="time">1ª Resp.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="time">Resol.</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-chat-square-dots text-muted"></i> Resolução por Canal</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <table id="agent-page-channel-table" class="sortable w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string" style="width: 120px;">Canal</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="number" style="width: 60px;">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text whitespace-nowrap bg-panel" data-sort="time">1ª Resp.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="time">Resol.</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-folder2-open text-muted"></i> Resolução por Assunto</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <table id="agent-page-subject-table" class="sortable w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Assunto</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="number" style="width: 60px;">Total</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text whitespace-nowrap bg-panel" data-sort="time" style="width: 70px;">1ª Resp.</th>
                  <th class="px-3 py-2.5 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="time" style="width: 70px;">Resol.</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Linha Inferior -->
      <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-6 items-start">
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[380px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-inbox text-accent-blue glow-text"></i> Conversas Abertas</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-x-auto overflow-y-auto relative no-scrollbar">
            <table id="agent-page-open-table" class="sortable w-full text-left table-auto min-w-[700px]">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="number">ID</th>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Pr.</th>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Assunto</th>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Cliente</th>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Canal</th>
                  <th class="px-3 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="time">SLA</th>
                  <th class="px-3 py-3 w-[40px] bg-panel"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[380px]">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-tags text-muted"></i> Abertas por Etiqueta</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
            <table id="agent-page-labels-table" class="sortable w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text w-full bg-panel" data-sort="string">Etiqueta</th>
                  <th class="px-4 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text w-[80px] bg-panel" data-sort="number">Total</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
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

    const initialBtnId = `btn-ag-${selectedDays}`;
    if (document.getElementById(initialBtnId)) {
        window.handleDateFilterClick('agent-date-filters', initialBtnId, null);
    }

    document.querySelectorAll('#agent-date-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedDays = Number(btn.dataset.days);
        
        window.handleDateFilterClick('agent-date-filters', btn.id, null);
        
        const content = document.getElementById('content');
        content.classList.add('opacity-50', 'pointer-events-none');
        
        await renderAgentDetailPage(agentId, selectedDays);
        
        content.classList.remove('opacity-50', 'pointer-events-none');
      });
    });

    await loadAgentDetailChannelInfo();
    await renderAgentDetailPage(agentId, selectedDays);
  },
};
