const KPI_COLUMNS = {
  'created-today': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'open': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'unassigned': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'awaiting-agent': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
  'breakdown': [['conversation_id', 'ID'], ['contact_name', 'Cliente'], ['assignee_name', 'Agente'], ['status', 'Status'], ['priority', 'Prioridade'], ['channel', 'Canal'], ['age_minutes', 'Aberta há']],
};

const TODAY_CHANNEL_PALETTE = ['#a78bfa', '#fb923c', '#38bdf8', '#f472b6', '#4ade80', '#facc15'];

let TODAY_CHANNEL_INFO = {};

async function loadTodayChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  TODAY_CHANNEL_INFO = {};
  let paletteIdx = 0;
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      TODAY_CHANNEL_INFO[c.channel_key] = { label: 'WPP', color: '#34d399', classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-whatsapp' };
    } else if (c.channel_key === 'email') {
      TODAY_CHANNEL_INFO[c.channel_key] = { label: 'E-mail', color: '#29a3ff', classes: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: 'bi-envelope' };
    } else {
      const shortLabel = c.channel_name.length > 6 ? c.channel_name.slice(0, 6) : c.channel_name;
      TODAY_CHANNEL_INFO[c.channel_key] = {
        label: shortLabel,
        color: TODAY_CHANNEL_PALETTE[paletteIdx % TODAY_CHANNEL_PALETTE.length],
        classes: 'text-muted bg-border/30 border-border',
        icon: 'bi-chat-dots',
      };
      paletteIdx++;
    }
  });
  TODAY_CHANNEL_INFO.other = { label: 'Out', color: '#9296b8', classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
}

const TODAY_PRIORITY_MAP = { 
  urgent: { label: 'Urg', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alt', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Med', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Bxa', classes: 'text-muted bg-border/30 border-border', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nen', classes: 'text-muted bg-border/30 border-border', icon: 'bi-info-circle-fill' } 
};

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

function todayPriorityBadge(val) {
  const prio = String(val ?? 'none').toLowerCase();
  const info = TODAY_PRIORITY_MAP[prio] || TODAY_PRIORITY_MAP.none;
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todayChannelBadge(val) {
  const info = TODAY_CHANNEL_INFO[val] || TODAY_CHANNEL_INFO.other;
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function todaySlaBadge(minutesRemaining) {
  const baseCls = "inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap";
  if (minutesRemaining === null || minutesRemaining === undefined) {
    return `<span class="${baseCls} bg-border/30 text-muted border-border"><i class="bi bi-clock-history"></i> -</span>`;
  }
  const late = minutesRemaining < 0;
  const absMinutes = Math.abs(minutesRemaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  const color = late ? 'text-accent-red bg-accent-red/10 border-accent-red/20' : 'text-accent-green bg-accent-green/10 border-accent-green/20';
  return `<span class="${baseCls} ${color}"><i class="bi ${icon}"></i> ${formatDetailedDuration(absMinutes)}</span>`;
}

function rankTableRow(name, valueText, highlightClass = 'text-text') {
  return `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
            <td class="px-4 py-3 text-[0.85rem] font-medium truncate max-w-[150px] text-text" title="${name}">${name}</td>
            <td class="px-4 py-3 text-[0.85rem] font-bold text-right ${highlightClass}">${valueText}</td>
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
  
  const defaultTitle = document.querySelector(`[data-kpi="${kpi}"] .kpi-title`)?.textContent || 'Detalhes';
  
  document.getElementById('kpi-modal-title').innerHTML = `<i class="bi bi-table text-accent-blue mr-2"></i> ${titleOverride || defaultTitle}`;  
  document.querySelector('#kpi-modal-table thead').innerHTML = '<tr>' + cols.map(c => `<th class="px-3 py-3 text-[0.75rem] font-bold text-muted uppercase tracking-wider sticky top-0 bg-panel shadow-[0_1px_0_var(--border)]">${c[1]}</th>`).join('') + '<th class="px-3 py-3 text-[0.75rem] font-bold text-muted uppercase tracking-wider text-right sticky top-0 bg-panel shadow-[0_1px_0_var(--border)]">Ação</th></tr>';
  
  document.querySelector('#kpi-modal-table tbody').innerHTML = rows.length > 0 
  ? rows.map(r => {
    const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
    
    const rowContent = cols.map(c => {
      let val = r[c[0]];
      if (c[0] === 'priority') val = todayPriorityBadge(val);
      else if (c[0] === 'channel') val = todayChannelBadge(val);
      else if (c[0] === 'status') {
        const status = String(val ?? '-').toLowerCase();
        const color = status === 'open' ? 'text-accent-green bg-accent-green/10 border-accent-green/20' : 'text-muted bg-border/30 border-border';
        val = `<span class="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${color}">${val}</span>`;
      } else if (c[0] === 'age_minutes') val = formatDetailedDuration(val);
      else val = val ?? '-';
      
      return `<td class="px-3 py-3 text-[0.8rem] text-text border-b border-border/50 truncate">${val}</td>`;
    }).join('');

    return `<tr class="hover:bg-panel-light transition-colors">${rowContent}<td class="px-3 py-3 border-b border-border/50 text-right"><button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')"><i class="bi bi-box-arrow-up-right text-[0.85rem]"></i></button></td></tr>`;
  }).join('')
  : `<tr><td colspan="${cols.length + 1}"><div class="py-10 text-center"><i class="bi bi-inbox text-3xl text-border mb-2 block"></i><span class="text-sm text-muted">Sem dados para exibir</span></div></td></tr>`;
  
  document.getElementById('kpi-modal').classList.remove('hidden');
}

function closeKpiModal() { document.getElementById('kpi-modal').classList.add('hidden'); }

Screens.today = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">
      
      <!-- Top Row: Title & Quick KPIs -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Title Widget -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex items-center p-5 gap-4 col-span-1 lg:col-span-1">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent-blue text-white shadow-sm glow-border"><i class="bi bi-calendar2-day"></i></div>
          <div class="flex-1 min-w-0">
            <h2 class="m-0 mb-1 text-base font-bold text-text truncate">Visão Hoje</h2>
            <p class="m-0 text-xs text-muted truncate">Acompanhamento do dia</p>
          </div>
        </div>

        <!-- KPIs Clicáveis -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:border-accent-blue/50 transition-colors group relative overflow-hidden col-span-1" data-kpi="created-today" onclick="openKpiModal('created-today')">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-inbox text-[5rem] text-accent-blue"></i></div>
          <div class="w-12 h-12 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center text-xl shrink-0 relative z-10"><i class="bi bi-inbox"></i></div>
          <div class="relative z-10">
            <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider kpi-title">Criadas Hoje</span>
            <span id="kpi-created-today" class="block text-2xl font-bold text-text">-</span>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-4 flex flex-col justify-center cursor-pointer hover:border-accent-yellow/50 transition-colors group relative overflow-hidden col-span-1" data-kpi="open" onclick="openKpiModal('open')">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-envelope-open text-[5rem] text-accent-yellow"></i></div>
          <div class="flex justify-between items-center mb-1 relative z-10">
            <div class="flex items-center gap-2">
              <i class="bi bi-envelope-open text-accent-yellow text-sm"></i>
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider kpi-title">Abertas</span>
            </div>
            <div id="kpi-open-badge"></div>
          </div>
          <span id="kpi-open" class="block text-2xl font-bold text-text relative z-10 mb-2">-</span>
          <div id="kpi-open-bars" class="w-full flex flex-col gap-1 relative z-10"></div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-4 flex flex-col justify-center cursor-pointer hover:border-accent-red/50 transition-colors group relative overflow-hidden col-span-1" data-kpi="unassigned" onclick="openKpiModal('unassigned')">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-exclamation-octagon text-[5rem] text-accent-red"></i></div>
          <div class="flex justify-between items-center mb-1 relative z-10">
            <div class="flex items-center gap-2">
              <i class="bi bi-exclamation-octagon text-accent-red text-sm"></i>
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider kpi-title">Não Atribuídas</span>
            </div>
            <div id="kpi-unassigned-badge"></div>
          </div>
          <span id="kpi-unassigned" class="block text-2xl font-bold text-accent-red relative z-10 mb-2">-</span>
          <div id="kpi-unassigned-bars" class="w-full flex flex-col gap-1 relative z-10"></div>
        </div>
      </div>

      <!-- Main Row: Chart & Performance -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Chart Panel -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col lg:col-span-2">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-bar-chart-fill text-accent-blue"></i> Conversas por Hora</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 w-full">
            <div class="relative w-full h-[250px]">
              <canvas id="chart-hourly"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance / SLA Panel -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col lg:col-span-1">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-speedometer2 text-accent-green"></i> Desempenho e SLA</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 flex flex-col gap-4 flex-1 justify-center">
            
            <div class="flex items-center justify-between p-3 bg-panel-light border border-border rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center text-lg"><i class="bi bi-stopwatch"></i></div>
                <span class="text-xs text-muted font-bold uppercase tracking-wider">1ª Resposta (Média)</span>
              </div>
              <span id="card-frt" class="text-lg font-bold text-text">-</span>
            </div>

            <div class="flex items-center justify-between p-3 bg-panel-light border border-border rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center text-lg"><i class="bi bi-check2-all"></i></div>
                <span class="text-xs text-muted font-bold uppercase tracking-wider">Resolução (Média)</span>
              </div>
              <span id="card-res" class="text-lg font-bold text-text">-</span>
            </div>

            <div class="flex items-center justify-between p-3 bg-panel-light border border-border rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-accent-yellow/10 text-accent-yellow flex items-center justify-center text-lg"><i class="bi bi-shield-check"></i></div>
                <span class="text-xs text-muted font-bold uppercase tracking-wider">SLA Atingido</span>
              </div>
              <span id="card-sla-met" class="text-lg font-bold text-text">-</span>
            </div>

          </div>
        </div>

      </div>

      <!-- Breakdown Row -->
      <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col mb-2">
        <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
          <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-diagram-3-fill text-muted"></i> Detalhamento de Fila</h3>
          <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
        </div>
        
        <div class="panel-content p-5">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div class="bg-gradient-to-br from-accent-blue/5 to-bg border border-accent-blue/20 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:border-accent-blue hover:shadow-md transition-all glow-border" data-kpi="awaiting-agent" onclick="openKpiModal('awaiting-agent')">
              <i class="bi bi-hourglass-split text-2xl text-accent-blue mb-2"></i>
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-1 kpi-title">Aguardando Agente</span>
              <span id="kpi-awaiting-agent" class="text-3xl font-bold text-text leading-none">-</span>
            </div>

            <div class="bg-panel-light border border-border rounded-xl p-4 flex flex-col">
              <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-3">Por Prioridade</span>
              <div id="priority-list" class="flex flex-wrap gap-2 content-start overflow-y-auto max-h-[120px] no-scrollbar"></div>
            </div>

            <div class="bg-panel-light border border-border rounded-xl p-4 flex flex-col">
              <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider mb-3">Por Etiqueta</span>
              <div id="label-list" class="flex flex-wrap gap-2 content-start overflow-y-auto max-h-[120px] no-scrollbar"></div>
            </div>

          </div>
        </div>
      </div>

      <!-- Bottom Tables Row -->
      <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-6 items-start">
        
        <!-- Attention Table -->
        <div class="panel-card bg-panel border border-border border-t-2 border-t-accent-red rounded-xl shadow-sm flex flex-col overflow-hidden max-h-[400px]">
           <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-exclamation-triangle-fill text-accent-red glow-text"></i> Precisam de Atenção</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto no-scrollbar relative">
            <table id="attention-table" class="w-full text-left min-w-[700px]">
              <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th class="px-4 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider bg-panel">ID</th>
                  <th class="px-4 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider bg-panel">Cliente / Assunto</th>
                  <th class="px-4 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider bg-panel">Agente</th>
                  <th class="px-4 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider bg-panel">Pr. / Canal</th>
                  <th class="px-4 py-3 text-[0.7rem] font-bold text-muted uppercase tracking-wider bg-panel">SLA</th>
                  <th class="px-4 py-3 w-[50px] bg-panel"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        
        <!-- Rankings -->
        <div class="flex flex-col gap-6 min-w-0">
          
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 flex-1 max-h-[200px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-person-lines-fill text-muted"></i> Atribuições Hoje</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-0.5"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto no-scrollbar relative">
              <table id="table-today-assignees" class="sortable w-full text-left">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Agente</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="number">Qtd</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 flex-1 max-h-[200px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-trophy-fill text-accent-yellow"></i> Resoluções Hoje</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-0.5"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto no-scrollbar relative">
              <table id="table-today-solvers" class="sortable w-full text-left">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider cursor-pointer hover:text-text bg-panel" data-sort="string">Agente</th>
                    <th class="px-4 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right cursor-pointer hover:text-text bg-panel" data-sort="number">Qtd</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    </div>

    <!-- Modal KPIs (Mantido igual) -->
    <div id="kpi-modal" class="hidden fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-5">
      <div class="bg-panel border border-border rounded-2xl w-full max-w-[1000px] flex flex-col relative shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        <button class="absolute top-4 right-5 bg-transparent border-none text-muted hover:text-text text-2xl cursor-pointer z-10 transition-colors" onclick="closeKpiModal()">&times;</button>
        <div class="p-5 border-b border-border bg-panel-light/50">
           <h3 id="kpi-modal-title" class="m-0 text-lg font-bold flex items-center"></h3>
        </div>
        <div class="p-0 max-h-[65vh] overflow-y-auto w-full table-wrapper">
           <table id="kpi-modal-table" class="w-full text-left min-w-[700px]">
             <thead class="bg-panel shadow-[0_1px_0_var(--border)]"></thead>
             <tbody></tbody>
           </table>
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
      modalEl.addEventListener('click', function(e) { if (e.target === this) closeKpiModal(); });
    }

    await loadTodayChannelInfo();

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
      div.className = 'w-[76px] h-[76px] flex flex-col justify-center items-center p-2 gap-1.5 text-center cursor-pointer shrink-0 bg-panel border border-border rounded-xl hover:-translate-y-0.5 hover:shadow-md transition-all group';
      div.innerHTML = `
        <div class="flex items-center justify-center gap-1 w-full">
          <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${color}; box-shadow: 0 0 4px ${color}80;"></span>
          <span class="font-semibold text-[0.65rem] whitespace-nowrap overflow-hidden text-ellipsis text-muted uppercase" title="${label}">${label}</span>
        </div>
        <span class="text-[1.4rem] font-bold leading-none text-text group-hover:text-[${color}] transition-colors">${total}</span>`;
      div.onclick = onClick;
      return div;
    };

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
    if (priorityContainer.innerHTML === '') priorityContainer.innerHTML = '<div class="w-full p-3 text-center text-muted"><i class="bi bi-inbox text-lg block mb-1"></i><span class="text-xs">Nenhum chamado aberto</span></div>';

    const labelContainer = document.getElementById('label-list');
    if (!statusBreakdown.labels || statusBreakdown.labels.length === 0) {
      labelContainer.innerHTML = '<div class="w-full p-3 text-center text-muted"><i class="bi bi-tag text-lg block mb-1"></i><span class="text-xs">Nenhuma etiqueta em uso</span></div>';
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
      cardSlaMet.className = `block text-[1.5rem] font-bold leading-none ${Number(currentSla) >= Number(targetSla) ? 'text-accent-green' : 'text-accent-red'}`;
    } else {
      cardSlaMet.textContent = '-';
    }

    const renderCompareBars = (elId, current, previous, themeColorClass, themeColorHex) => {
      const badgeEl = document.getElementById(`${elId}-badge`);
      const barsEl = document.getElementById(`${elId}-bars`);
      if (!badgeEl || !barsEl) return;
      
      const diff = current - previous;
      const maxVal = Math.max(current, previous, 1);
      const prevPct = (previous / maxVal) * 100;
      const currPct = (current / maxVal) * 100;
      
      if (diff === 0) {
        badgeEl.innerHTML = `<span class="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md uppercase bg-panel-light text-muted border border-border">= Igual</span>`;
      } else {
        const isGood = diff < 0; 
        const colorClass = isGood ? 'text-accent-green bg-accent-green/10 border border-accent-green/20' : 'text-accent-red bg-accent-red/10 border border-accent-red/20';
        const icon = isGood ? 'bi-graph-down-arrow' : 'bi-graph-up-arrow';
        badgeEl.innerHTML = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md ${colorClass}"><i class="bi ${icon}"></i> ${Math.abs(diff)} vs Sem. Pass.</span>`;
      }
      
      // Changed bg-bg to bg-panel-light to avoid white lines in dark theme
      barsEl.innerHTML = `
        <div class="flex items-center gap-2">
           <span class="text-[0.65rem] text-muted w-[30px] text-right">${previous}</span>
           <div class="flex-1 h-1.5 bg-panel-light rounded-full overflow-hidden border border-border/50">
              <div style="width: ${prevPct}%;" class="h-full bg-muted/50"></div>
           </div>
         </div>
         <div class="flex items-center gap-2">
           <span class="text-[0.65rem] text-text font-bold w-[30px] text-right">${current}</span>
           <div class="flex-1 h-1.5 bg-panel-light rounded-full overflow-hidden border border-border/50">
              <div style="width: ${currPct}%; box-shadow: 0 0 5px ${themeColorHex}80;" class="h-full ${themeColorClass}"></div>
           </div>
         </div>
      `;
    };

    renderCompareBars('kpi-open', open.length || 0, comparison.open_last_week ?? 0, 'bg-accent-yellow', '#ffc247');
    renderCompareBars('kpi-unassigned', unassigned.length || 0, comparison.unassigned_last_week ?? 0, 'bg-accent-red', '#ff5c5c');

    const channelKeys = Object.keys(TODAY_CHANNEL_INFO);
    const fullDayData = Array.from({length: 24}, (_, i) => {
      const hrStr = i.toString().padStart(2, '0') + ':00';
      const found = hourly.find(r => new Date(r.hour).getHours() === i);
      const row = { hour: hrStr, resolved: found ? found.resolved : 0 };
      channelKeys.forEach(k => row[k] = found ? (found[`created_${k}`] || 0) : 0);
      return row;
    });

    const createdDatasets = channelKeys.map(k => ({
      label: TODAY_CHANNEL_INFO[k].label,
      data: fullDayData.map(r => r[k]),
      backgroundColor: TODAY_CHANNEL_INFO[k].color,
      stack: 'created',
      borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      barPercentage: 0.7,
      categoryPercentage: 0.8,
    }));

    renderChart('chart-hourly', {
      type: 'bar',
      data: {
        labels: fullDayData.map(r => r.hour),
        datasets: [
          ...createdDatasets,
          { label: 'Resolvidas', data: fullDayData.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true, padding: 16, font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } } }
        },
      },
    });

    const attentionTbody = document.querySelector('#attention-table tbody');
    if (attention.length === 0) {
      attentionTbody.innerHTML = `<tr><td colspan="6"><div class="py-10 text-center flex flex-col items-center"><i class="bi bi-emoji-smile text-3xl text-accent-green mb-2 block"></i><span class="text-sm text-text font-medium">Tudo tranquilo!</span></div></td></tr>`;
    } else {
      const chatwootBase = settings.chatwoot_base_url || '';
      const accountId = currentUser.account_id;
      attentionTbody.innerHTML = attention.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        return `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
          <td class="px-4 py-3 font-semibold text-[0.75rem] text-text">${r.conversation_id}</td>
          <td class="px-4 py-3 text-[0.75rem] max-w-[200px] truncate text-text">
             <span class="block font-medium truncate" title="${r.contact_name ?? '-'}">${r.contact_name ?? '-'}</span>
             <span class="block text-[0.65rem] text-muted truncate" title="${r.subject ?? '-'}">${r.subject ?? '-'}</span>
          </td>
          <td class="px-4 py-3 text-[0.75rem] truncate text-text" title="${r.assignee_name ?? '-'}">${r.assignee_name ?? '-'}</td>
          <td class="px-4 py-3">
            <div class="flex flex-col items-start gap-1">
              ${todayPriorityBadge(r.priority)}
              ${todayChannelBadge(r.channel)}
            </div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">${todaySlaBadge(r.minutes_remaining)}</td>
          <td class="px-4 py-3 text-right">
            <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Abrir no Atrium Chat" onclick="window.open('${url}', '_blank')">
              <i class="bi bi-box-arrow-up-right text-[0.8rem]"></i>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    document.querySelector('#table-today-assignees tbody').innerHTML = assignees.length > 0 
      ? assignees.sort((a,b) => b.total - a.total).map(a => rankTableRow(a.assignee_name, a.total, 'text-blue-400')).join('')
      : '<tr><td colspan="2"><div class="p-4 text-center"><i class="bi bi-inbox text-xl text-border mb-1 block"></i><span class="text-xs text-muted">Sem dados</span></div></td></tr>';

    document.querySelector('#table-today-solvers tbody').innerHTML = solvers.length > 0
      ? solvers.sort((a,b) => b.resolved_count - a.resolved_count).map(s => rankTableRow(s.assignee_name, s.resolved_count, 'text-accent-green')).join('')
      : '<tr><td colspan="2"><div class="p-4 text-center"><i class="bi bi-inbox text-xl text-border mb-1 block"></i><span class="text-xs text-muted">Sem dados</span></div></td></tr>';

  },
};
