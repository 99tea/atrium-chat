const SLA_DAYS_OPTIONS = [7, 14, 30, 90, 180];

let SLA_CHANNEL_INFO = {};

async function loadChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  SLA_CHANNEL_INFO = {};
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      SLA_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-accent-green bg-accent-green/10 border-accent-green/20', icon: 'bi-whatsapp' };
    } else if (c.channel_key === 'email') {
      SLA_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: 'bi-envelope' };
    } else {
      SLA_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
    }
  });
  SLA_CHANNEL_INFO.other = { label: 'Outros', classes: 'text-muted bg-border/30 border-border', icon: 'bi-chat-dots' };
}

const SLA_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-exclamation-triangle-fill', order: 1 }, 
  high: { label: 'Alta', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-arrow-up-circle-fill', order: 2 }, 
  medium: { label: 'Média', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill', order: 3 }, 
  low: { label: 'Baixa', classes: 'text-muted bg-border/30 border-border', icon: 'bi-arrow-down-circle-fill', order: 4 }, 
  none: { label: 'Nenhuma', classes: 'text-muted bg-border/30 border-border', icon: 'bi-info-circle-fill', order: 5 } 
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

function buildSlaRow(labelHtml, data, targetSla) {
  if (data.resolution_breach_rate == null) {
    return `<tr><td colspan="3"><div class="p-3 text-center text-muted"><i class="bi bi-inbox text-lg block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>`;
  }

  const attained = (1 - data.resolution_breach_rate) * 100;
  const isBreached = attained < targetSla;
  const barColorClass = isBreached ? 'bg-accent-red' : 'bg-accent-green';
  const textClass = isBreached ? 'text-accent-red' : 'text-accent-green';
  const hexColor = isBreached ? '#ff5c5c' : '#34d399';
  
  return `
    <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-3 py-2 align-middle">
        <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis text-[0.8rem] max-w-[160px]">${labelHtml}</div>
        <div class="text-[0.65rem] text-muted font-bold tracking-wider mt-0.5 uppercase">VOL: ${data.total || 0}</div>
      </td>
      <td class="px-3 py-2 align-middle w-[120px]">
        <div class="flex flex-col gap-1">
          <span class="text-[0.7rem] text-text font-medium flex items-center gap-1.5"><i class="bi bi-stopwatch text-muted text-[0.75rem]"></i> ${formatDetailedDuration(data.avg_first_response)}</span>
          <span class="text-[0.7rem] text-text font-medium flex items-center gap-1.5"><i class="bi bi-check2-all text-muted text-[0.75rem]"></i> ${formatDetailedDuration(data.avg_resolution)}</span>
        </div>
      </td>
      <td class="px-3 py-2 align-middle w-full pl-4">
        <div class="flex justify-between items-center mb-1 text-[0.65rem]">
          <span class="font-semibold text-muted">Meta: ${targetSla}%</span>
          <span class="font-bold ${textClass}">${attained.toFixed(1)}%</span>
        </div>
        <div class="w-full bg-panel-light rounded-full h-1.5 overflow-hidden border border-border/50">
          <div style="width: ${attained}%; box-shadow: 0 0 5px ${hexColor}80;" class="h-full rounded-full transition-all duration-1000 ${barColorClass}"></div>
        </div>
      </td>
    </tr>
  `;
}

async function renderSlaData(range) {
  const query = range
    ? `days=${range.days}&start_date=${range.startDate}&end_date=${range.endDate}`
    : (window.DateRangePicker ? window.DateRangePicker.getQueryString() : 'days=30');

  const [summary, byPriority, byChannel, bySubject, byTeam, byClient, settings] = await Promise.all([
    fetch(`/monitor/api/sla/summary?${query}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/sla/by-priority?${query}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-channel?${query}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-subject?${query}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-team?${query}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-client?${query}`).then(r => r.ok ? r.json() : {best: [], worst: []}).catch(() => ({best: [], worst: []})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  ]);

  document.getElementById('sla-frt').textContent = formatDetailedDuration(summary.avg_first_response);
  document.getElementById('sla-res').textContent = formatDetailedDuration(summary.avg_resolution);

  const target = settings.sla_target_percent || 95;
  const attained = summary.resolution_breach_rate != null ? ((1 - summary.resolution_breach_rate) * 100).toFixed(1) : null;
  const slaEl = document.getElementById('sla-attained');

  if (attained !== null) {
    slaEl.textContent = `${attained}% / ${target}%`;
    slaEl.className = `text-[1.5rem] font-bold leading-none ${Number(attained) >= Number(target) ? 'text-accent-green glow-text' : 'text-accent-red glow-text'}`;
  } else {
    slaEl.textContent = '-';
    slaEl.className = 'text-[1.5rem] font-bold leading-none text-text';
  }

  const totalInSla = summary.total && attained !== null ? Math.round(summary.total * (attained / 100)) : 0;
  document.getElementById('sla-total').textContent = `${totalInSla} / ${summary.total || 0}`;

  const emptyRow = '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados no período</span></div></td></tr>';

  const sortedPriority = [...byPriority].sort((a, b) => {
    const oa = (SLA_PRIORITY_MAP[String(a.priority).toLowerCase()] || SLA_PRIORITY_MAP.none).order;
    const ob = (SLA_PRIORITY_MAP[String(b.priority).toLowerCase()] || SLA_PRIORITY_MAP.none).order;
    return oa - ob;
  });
  document.getElementById('tb-sla-priority').innerHTML = sortedPriority.length ? sortedPriority.map(p => {
    const info = SLA_PRIORITY_MAP[String(p.priority).toLowerCase()] || SLA_PRIORITY_MAP.none;
    const label = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildSlaRow(label, p, target);
  }).join('') : emptyRow;

  document.getElementById('tb-sla-channel').innerHTML = byChannel.length ? byChannel.sort((a, b) => b.total - a.total).map(c => {
    const info = SLA_CHANNEL_INFO[String(c.channel).toLowerCase()] || SLA_CHANNEL_INFO.other;
    const label = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildSlaRow(label, c, target);
  }).join('') : emptyRow;

  document.getElementById('tb-sla-subject').innerHTML = bySubject.length ? bySubject.sort((a, b) => b.total - a.total).map(s => 
    buildSlaRow(`<span class="text-text">${s.subject || 'Não categorizado'}</span>`, s, target)
  ).join('') : emptyRow;

  document.getElementById('tb-sla-team').innerHTML = byTeam.length ? byTeam.sort((a, b) => b.total - a.total).map(t => 
    buildSlaRow(`<span class="text-text flex items-center"><i class="bi bi-people mr-1.5 text-muted"></i>${t.team_name}</span>`, t, target)
  ).join('') : emptyRow;

  document.getElementById('tb-sla-client-worst').innerHTML = (byClient.worst || []).length ? byClient.worst.map(c => 
    buildSlaRow(`<span class="text-text flex items-center"><i class="bi bi-building mr-1.5 text-muted"></i>${c.client_name}</span>`, c, target)
  ).join('') : emptyRow;

  document.getElementById('tb-sla-client-best').innerHTML = (byClient.best || []).length ? byClient.best.map(c => 
    buildSlaRow(`<span class="text-text flex items-center"><i class="bi bi-building mr-1.5 text-muted"></i>${c.client_name}</span>`, c, target)
  ).join('') : emptyRow;
}

Screens.sla = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <!-- Header & Date Filters -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent-yellow text-white shadow-sm glow-border"><i class="bi bi-shield-check"></i></div>
          <div>
            <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Visão SLA</h2>
            <p class="m-0 text-[0.9rem] text-muted">Análise de conformidade e tempos de resposta</p>
          </div>
        </div>

        <div id="sla-date-picker-container" class="shrink-0"></div>
      </div>

      <!-- Quick KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-blue/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-stopwatch text-[4rem] text-accent-blue"></i></div>
          <i class="bi bi-stopwatch text-2xl text-accent-blue mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">1ª Resposta (Média)</span>
          <span class="text-[1.5rem] font-bold text-text leading-none relative z-10" id="sla-frt">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-green/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-check2-all text-[4rem] text-accent-green"></i></div>
          <i class="bi bi-check2-all text-2xl text-accent-green mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Resolução (Média)</span>
          <span class="text-[1.5rem] font-bold text-text leading-none relative z-10" id="sla-res">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm border-accent-yellow/30 bg-gradient-to-br from-accent-yellow/5 to-panel group relative overflow-hidden">
          <i class="bi bi-shield-check text-2xl text-accent-yellow mb-2 relative z-10 glow-text"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">SLA Atingido vs Meta</span>
          <span class="text-[1.5rem] font-bold text-text leading-none whitespace-nowrap relative z-10" id="sla-attained">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm group relative overflow-hidden">
          <i class="bi bi-envelope-check text-2xl text-muted mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">SLA Atingido / Vol.</span>
          <span class="text-[1.5rem] font-bold text-text leading-none relative z-10" id="sla-total">-</span>
        </div>
      </div>

	<!-- Main Tables (Row 1) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-flag text-muted"></i> SLA por Prioridade</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[280px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Prioridade / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-priority"></tbody>
            </table>
          </div>
        </div>
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-chat-square-dots text-muted"></i> SLA por Canal</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[280px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Canal / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-channel"></tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Main Tables (Row 2) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-folder-fill text-muted"></i> SLA por Assunto</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[280px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Assunto / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-subject"></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-muted"></i> SLA por Departamento</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[280px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Depto / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-team"></tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Bottom Tables (Worst/Best Clients) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        <div class="panel-card bg-panel border border-border border-t-2 border-t-accent-red rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-shield-exclamation text-accent-red glow-text"></i> Clientes (SLA Perdidos)</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[300px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Cliente / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-client-worst"></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border border-t-2 border-t-accent-green rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
            <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-shield-check text-accent-green glow-text"></i> Clientes (Melhores SLAs)</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex-1 overflow-y-auto max-h-[300px] relative no-scrollbar">
            <table class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%] bg-panel">Cliente / Vol.</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Tempos Médios</th>
                  <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-4 bg-panel">Atingimento</th>
                </tr>
              </thead>
              <tbody id="tb-sla-client-best"></tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  `,
  load: async function () {
    const container = document.getElementById('sla-date-picker-container');
    if (container && window.DateRangePicker) {
      window.DateRangePicker.mount(container, {
        align: 'right',
        onChange: async (range) => {
          const content = document.getElementById('content');
          if (content) content.classList.add('opacity-50', 'pointer-events-none');
          await renderSlaData(range);
          if (content) content.classList.remove('opacity-50', 'pointer-events-none');
        }
      });
    }

    await loadChannelInfo();
    await renderSlaData(); 
  }
};
