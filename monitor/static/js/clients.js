let CLIENT_CHANNEL_INFO = {};

async function loadClientChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  CLIENT_CHANNEL_INFO = {};
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') {
      CLIENT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-accent-green bg-accent-green/10 border border-accent-green/20', icon: 'bi-whatsapp' };
    } else if (c.channel_key === 'email') {
      CLIENT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-blue-400 bg-blue-400/10 border border-blue-400/20', icon: 'bi-envelope' };
    } else {
      CLIENT_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, classes: 'text-muted bg-border/30 border border-border', icon: 'bi-chat-dots' };
    }
  });
  CLIENT_CHANNEL_INFO.other = { label: 'Outros', classes: 'text-muted bg-border/30 border border-border', icon: 'bi-chat-dots' };
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

function clientChannelBadge(val) {
  const info = CLIENT_CHANNEL_INFO[val] || CLIENT_CHANNEL_INFO.other;
  return `<span class="inline-flex items-center gap-1.5 px-2 py-1 text-[0.65rem] font-semibold rounded-md whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

function buildProgressTableHTML(data, labelFn, valFn, formatFn = null) {
  const sorted = [...data].sort((a, b) => valFn(b) - valFn(a));
  const total = sorted.reduce((sum, r) => sum + valFn(r), 0);
  if (sorted.length === 0) return '<tr><td colspan="2"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-sm">Sem dados</span></div></td></tr>';
  
  return sorted.map(r => {
    const val = valFn(r);
    const displayVal = formatFn ? formatFn(val) : val;
    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
    const label = labelFn(r);
    return `
      <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
        <td class="px-3 py-2 font-medium truncate text-[0.75rem] text-text max-w-[130px]" title="${label}">${label}</td>
        <td class="px-3 py-2 w-full align-middle pl-3">
          <div class="flex justify-between items-center mb-1 text-[0.65rem]">
            <span class="font-semibold text-text">${displayVal}</span>
            <span class="text-muted font-bold">${pct}%</span>
          </div>
          <div class="w-full bg-panel-light rounded-full h-[4px] overflow-hidden border border-border/50">
            <div style="width: ${pct}%; background-color: #8f161b; box-shadow: 0 0 5px #8f161b80;" class="h-full rounded-full transition-all duration-1000"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInconsistencyBlock(inconsistencias) {
  if (!inconsistencias) return '';
  const sections = [];
  if (inconsistencias.regime_tributario?.length) {
    sections.push(`
      <div class="mb-2">
        <span class="text-[0.7rem] font-bold text-accent-yellow uppercase tracking-wider">Regime Tributário divergente:</span>
        <ul class="mt-1 pl-4 list-disc text-[0.75rem] text-text">
          ${inconsistencias.regime_tributario.map(i => `<li>${i.contact_name || 'Contato #' + i.contact_id}: <strong>${i.valor}</strong></li>`).join('')}
        </ul>
      </div>`);
  }
  if (inconsistencias.status_contrato?.length) {
    sections.push(`
      <div class="mb-2">
        <span class="text-[0.7rem] font-bold text-accent-yellow uppercase tracking-wider">Status do Contrato divergente:</span>
        <ul class="mt-1 pl-4 list-disc text-[0.75rem] text-text">
          ${inconsistencias.status_contrato.map(i => `<li>${i.contact_name || 'Contato #' + i.contact_id}: <strong>${i.valor}</strong></li>`).join('')}
        </ul>
      </div>`);
  }
  if (!sections.length) return '';
  return `
    <div class="bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg p-3 mb-4">
      <div class="flex items-center gap-1.5 mb-2 text-accent-yellow font-semibold text-[0.8rem]">
        <i class="bi bi-exclamation-triangle-fill"></i> Cadastro inconsistente — corrija no Chatwoot
      </div>
      ${sections.join('')}
    </div>`;
}

async function openClientDetailModal(clientKey, range) {
  const qs = `start_date=${range.startDate}&end_date=${range.endDate}`;
  const detail = await fetch(`/monitor/api/clients/${encodeURIComponent(clientKey)}/detail?${qs}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const settings = window.__monitorSettings || {};
  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.getElementById('client-detail-title').innerHTML = `<i class="bi bi-building text-accent-green mr-2 glow-text"></i>${detail.client_name || 'Detalhes do Cliente'}`;
  document.getElementById('client-detail-meta').innerHTML = 
    `<span class="inline-flex items-center gap-1.5 bg-bg px-2.5 py-1 rounded-md border border-border text-text text-[0.75rem]"><i class="bi bi-info-circle text-muted"></i> ${detail.regime_tributario || 'Regime não informado'}</span>
     <span class="inline-flex items-center gap-1.5 bg-bg px-2.5 py-1 rounded-md border border-border text-text text-[0.75rem]"><i class="bi bi-check-circle text-muted"></i> ${detail.status_contrato || 'Status não informado'}</span>
     ${detail.cadastro_inconsistente ? `<span class="inline-flex items-center gap-1.5 bg-accent-yellow/10 px-2.5 py-1 rounded-md border border-accent-yellow/30 text-accent-yellow text-[0.75rem] font-semibold"><i class="bi bi-exclamation-triangle-fill"></i> Cadastro inconsistente</span>` : ''}`;

  document.getElementById('client-detail-inconsistency').innerHTML = renderInconsistencyBlock(detail.inconsistencias);

  document.getElementById('client-detail-total').textContent = detail.total || 0;

  document.querySelector('#client-detail-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light"><td class="px-3 py-2 text-[0.75rem] font-medium text-text truncate">${r.subject}</td><td class="px-3 py-2 text-right"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${r.total}</span></td></tr>`).join('')
    : '<tr><td colspan="2"><div class="p-4 text-center text-muted"><i class="bi bi-folder2-open text-xl block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>';

  document.querySelector('#client-detail-team-table tbody').innerHTML = (detail.by_team || []).length
    ? detail.by_team.map(t => `
        <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light">
          <td class="px-3 py-2 font-medium text-[0.75rem] text-text truncate max-w-[100px]" title="${t.team_name}">${t.team_name}</td>
          <td class="px-3 py-2 text-right"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${t.total}</span></td>
          <td class="px-3 py-2 text-right text-[0.75rem] text-muted">${formatDetailedDuration(t.avg_resolution)}</td>
          <td class="px-3 py-2 text-right text-[0.75rem] text-[#29a3ff] font-semibold">${formatDetailedDuration(t.total_minutes)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="p-4 text-center text-muted"><i class="bi bi-diagram-3 text-xl block mb-1"></i><span class="text-xs">Sem dados</span></div></td></tr>';

  const ch = detail.by_channel || {};
  document.getElementById('client-detail-channels').innerHTML = Object.entries(ch)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const info = CLIENT_CHANNEL_INFO[k] || CLIENT_CHANNEL_INFO.other;
      return `<span class="inline-flex items-center gap-1.5 px-2 py-1 text-[0.7rem] font-semibold rounded-md border ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}: <span class="ml-1 opacity-80">${v}</span></span>`;
    }).join('') || '<span class="text-muted text-sm">Sem dados</span>';

  document.querySelector('#client-detail-conv-list').innerHTML = (detail.conversations || []).length
    ? detail.conversations.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const late = r.resolution_minutes !== null && r.target_resolution_minutes !== null && r.resolution_minutes > r.target_resolution_minutes;
        
        let slaTag = '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6rem] font-semibold rounded-md bg-panel-light text-muted border border-border"><i class="bi bi-clock-history"></i> Aberto</span>';
        if (r.resolution_minutes !== null) {
          const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
          const color = late ? 'text-accent-red bg-accent-red/10 border-accent-red/20' : 'text-accent-green bg-accent-green/10 border-accent-green/20';
          slaTag = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6rem] font-semibold rounded-md border ${color}"><i class="bi ${icon}"></i> ${late ? 'Atraso' : 'No prazo'}</span>`;
        }

        return `
          <div class="flex flex-col gap-1 bg-bg border border-border rounded-lg p-2.5 hover:border-muted transition-colors group">
            <div class="flex justify-between items-start gap-2">
              <span class="font-semibold text-[0.75rem] text-text leading-snug line-clamp-2">
                <span class="text-muted mr-1">#${r.conversation_id}</span>
                ${r.subject || 'Sem Assunto'}
              </span>
              <button class="w-6 h-6 flex items-center justify-center rounded-md bg-transparent text-muted hover:bg-panel-light hover:text-text border border-transparent transition-colors shrink-0" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right text-[0.7rem]"></i>
              </button>
            </div>
            <div class="flex justify-between items-center mt-0.5">
              <span class="text-muted text-[0.65rem] flex items-center gap-1"><i class="bi bi-calendar-event"></i> ${new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
              ${slaTag}
            </div>
          </div>`;
      }).join('')
    : '<div class="p-8 text-center text-muted"><i class="bi bi-inbox text-3xl block mb-2"></i><span class="text-sm">Nenhuma conversa no período</span></div>';

  document.getElementById('client-detail-modal').classList.remove('hidden');
}

function closeClientDetailModal() {
  document.getElementById('client-detail-modal').classList.add('hidden');
}

async function renderClientsData(range) {
  window.__clientsCurrentRange = range;
  const qs = `start_date=${range.startDate}&end_date=${range.endDate}`;

  const [clients, subjects, newVsReturning, settings, deptTime, demandaAvulsa, byRegime, byStatusContrato] = await Promise.all([
    fetch(`/monitor/api/clients/summary?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/subjects/summary?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/new-vs-returning?${qs}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/departments/client-time?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/demanda-avulsa?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/by-regime?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/by-status-contrato?${qs}`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  window.__monitorSettings = settings;

  document.getElementById('clients-total').textContent = clients.length || 0;
  document.getElementById('clients-new').textContent = newVsReturning.new_clients ?? 0;
  document.getElementById('clients-returning').textContent = newVsReturning.returning_clients ?? 0;

  const totalConvs = clients.reduce((sum, c) => sum + (c.total || 0), 0);
  document.getElementById('clients-total-convs').textContent = totalConvs;

  const totalChannels = {};
  clients.forEach(c => {
    if (c.channels) {
      Object.entries(c.channels).forEach(([key, val]) => {
        totalChannels[key] = (totalChannels[key] || 0) + (val || 0);
      });
    }
  });
  const channelsData = Object.entries(totalChannels)
    .map(([key, value]) => ({ label: (CLIENT_CHANNEL_INFO[key] || CLIENT_CHANNEL_INFO.other).label, value }))
    .filter(c => c.value > 0);
  document.querySelector('#table-client-channels tbody').innerHTML = buildProgressTableHTML(channelsData, d => d.label, d => d.value);

  const topVolume = [...clients].sort((a, b) => b.total - a.total).slice(0, 30);
  document.querySelector('#table-clients-volume tbody').innerHTML = topVolume.length
    ? topVolume.map(c => `
      <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors group">
        <td class="px-3 py-2 font-medium truncate text-[0.75rem] text-text cursor-pointer hover:text-accent transition-colors max-w-[150px]" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)" title="${c.client_name}">
          ${c.cadastro_inconsistente ? '<i class="bi bi-exclamation-triangle-fill text-accent-yellow mr-1" title="Cadastro inconsistente entre contatos — veja detalhes ao abrir"></i>' : ''}${c.client_name}
        </td>
        <td class="px-3 py-2 text-right"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold rounded-md bg-border/30 text-muted border border-border">${c.total}</span></td>
        <td class="px-3 py-2 text-right w-10">
          <button class="w-6 h-6 flex items-center justify-center rounded bg-transparent text-muted hover:bg-panel-light hover:text-text border border-transparent transition-colors" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)">
            <i class="bi bi-box-arrow-up-right text-[0.7rem]"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-[0.7rem]">Sem dados</span></div></td></tr>';

  const topTime = [...clients].filter(c => c.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 30);
  document.querySelector('#table-clients-time tbody').innerHTML = topTime.length
    ? topTime.map(c => `
      <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors group">
        <td class="px-3 py-2 font-medium truncate text-[0.75rem] text-text cursor-pointer hover:text-accent-yellow transition-colors max-w-[150px]" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)" title="${c.client_name}">${c.client_name}</td>
        <td class="px-3 py-2 text-right font-semibold text-[0.75rem] text-accent-yellow">${formatDetailedDuration(c.avg_resolution)}</td>
        <td class="px-3 py-2 text-right w-10">
          <button class="w-6 h-6 flex items-center justify-center rounded bg-transparent text-muted hover:bg-panel-light hover:text-text border border-transparent transition-colors" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)">
            <i class="bi bi-box-arrow-up-right text-[0.7rem]"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-[0.7rem]">Sem dados</span></div></td></tr>';

  const topBreach = [...clients].filter(c => c.breach_count > 0).sort((a, b) => b.breach_count - a.breach_count).slice(0, 30);
  document.querySelector('#table-clients-breach tbody').innerHTML = topBreach.length
    ? topBreach.map(c => `
      <tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors group">
        <td class="px-3 py-2 font-medium truncate text-[0.75rem] text-text cursor-pointer hover:text-accent-red transition-colors max-w-[150px]" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)" title="${c.client_name}">${c.client_name}</td>
        <td class="px-3 py-2 text-right"><span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-bold rounded-md text-accent-red bg-accent-red/10 border border-accent-red/20"><i class="bi bi-exclamation-circle text-[0.6rem]"></i> ${c.breach_count}x</span></td>
        <td class="px-3 py-2 text-right w-10">
          <button class="w-6 h-6 flex items-center justify-center rounded bg-transparent text-muted hover:bg-panel-light hover:text-text border border-transparent transition-colors" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', window.__clientsCurrentRange)">
            <i class="bi bi-box-arrow-up-right text-[0.7rem]"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="p-8 text-center text-muted"><i class="bi bi-emoji-smile text-3xl text-accent-green block mb-2"></i><span class="text-[0.7rem] font-medium">Nenhum SLA perdido</span></div></td></tr>';

  const topSubjectVolume = [...subjects].sort((a, b) => b.total - a.total).slice(0, 20);
  document.querySelector('#table-subjects-volume tbody').innerHTML = buildProgressTableHTML(topSubjectVolume, d => d.subject, d => d.total);

  const topSubjectTime = [...subjects].filter(s => s.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 20);
  document.querySelector('#table-subjects-time tbody').innerHTML = topSubjectTime.length
    ? topSubjectTime.map(s => `<tr class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors"><td class="px-3 py-2 font-medium truncate text-[0.75rem] text-text">${s.subject}</td><td class="px-3 py-2 text-right font-semibold text-[0.75rem] text-accent-yellow">${formatDetailedDuration(s.avg_resolution)}</td></tr>`).join('')
    : '<tr><td colspan="2"><div class="p-6 text-center text-muted"><i class="bi bi-inbox text-2xl block mb-2"></i><span class="text-[0.7rem]">Sem dados</span></div></td></tr>';

  document.querySelector('#table-dept-time tbody').innerHTML = buildProgressTableHTML(deptTime, d => d.team_name, d => Math.round(d.total_minutes), val => formatDetailedDuration(val));

  const demandaAvulsaTop = demandaAvulsa.slice(0, 20);
  document.querySelector('#table-demanda-avulsa tbody').innerHTML = buildProgressTableHTML(demandaAvulsaTop, d => d.client_name, d => d.total);

  document.querySelector('#table-regime tbody').innerHTML = buildProgressTableHTML(byRegime, d => d.regime, d => d.total);

  document.querySelector('#table-status-contrato tbody').innerHTML = buildProgressTableHTML(byStatusContrato, d => d.status_contrato, d => d.total);
}

Screens.clients = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent-green text-white shadow-sm glow-border"><i class="bi bi-buildings"></i></div>
          <div>
            <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Visão Clientes</h2>
            <p class="m-0 text-[0.9rem] text-muted">Métricas e análises da sua carteira de clientes</p>
          </div>
        </div>
        
        <div class="flex items-center gap-4">
          <!-- Abas Superiores Polidas (Estilo Cyberpunk / Clean) -->
          <div id="clients-main-tabs" class="flex p-1 bg-bg border border-border rounded-xl gap-1.5 shadow-inner">
            <button class="main-tab-btn active px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-all border border-accent bg-panel text-text glow-border shadow-sm whitespace-nowrap" data-target="tab-desempenho">
              <i class="bi bi-star mr-1.5 text-accent-yellow"></i> Desempenho & Atrasos
            </button>
            <button class="main-tab-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-all border border-transparent bg-transparent text-muted hover:text-text hover:bg-panel-light whitespace-nowrap" data-target="tab-perfil">
              <i class="bi bi-pie-chart mr-1.5 text-accent-blue"></i> Perfil & Canais
            </button>
          </div>

          <div id="clients-date-picker"></div>
        </div>
      </div>

      <!-- Cards Principais KPI -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-blue/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-building text-[4rem] text-accent-blue"></i></div>
          <i class="bi bi-building text-2xl text-accent-blue mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Clientes Atendidos</span>
          <span class="text-2xl font-bold text-text relative z-10" id="clients-total">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-yellow/50 transition-colors group relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-chat-dots text-[4rem] text-accent-yellow"></i></div>
          <i class="bi bi-chat-dots text-2xl text-accent-yellow mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Total de Conversas</span>
          <span class="text-2xl font-bold text-text relative z-10" id="clients-total-convs">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-accent-green/50 transition-colors group relative overflow-hidden bg-gradient-to-br from-accent-green/5 to-panel">
          <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-person-plus text-[4rem] text-accent-green"></i></div>
          <i class="bi bi-person-plus text-2xl text-accent-green mb-2 relative z-10 glow-text"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Novos Clientes</span>
          <span class="text-2xl font-bold text-text relative z-10" id="clients-new">-</span>
        </div>
        <div class="panel-card bg-panel border border-border rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-muted/50 transition-colors group relative overflow-hidden">
           <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-300"><i class="bi bi-people text-[4rem] text-muted"></i></div>
          <i class="bi bi-people text-2xl text-muted mb-2 relative z-10"></i>
          <span class="text-[0.65rem] text-muted font-bold uppercase tracking-wider mb-1 relative z-10">Clientes Recorrentes</span>
          <span class="text-2xl font-bold text-text relative z-10" id="clients-returning">-</span>
        </div>
      </div>

      <!-- ABA 1: Desempenho & Atrasos -->
      <div id="tab-desempenho" class="main-tab-content block">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-start">
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-arrow-repeat text-muted"></i> Mais Recorrentes</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-clients-volume" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[65%] bg-panel">Cliente</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel">Total</th><th class="w-[40px] bg-panel"></th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-hourglass-bottom text-muted"></i> Demandam Mais Tempo</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-clients-time" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[55%] bg-panel">Cliente</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel">Tempo Médio</th><th class="w-[40px] bg-panel"></th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          
          <div class="panel-card bg-panel border border-border border-t-2 border-t-accent-red rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-shield-exclamation text-accent-red glow-text"></i> SLA Perdido</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-clients-breach" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[60%] bg-panel">Cliente</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel">Atrasos</th><th class="w-[40px] bg-panel"></th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-start">
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-folder-fill text-muted"></i> Assuntos Recorrentes</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-subjects-volume" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Assunto</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Volume</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-clock-history text-muted"></i> Assuntos (T. Médio)</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-subjects-time" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[65%] bg-panel">Assunto</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right bg-panel">Tempo</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-muted"></i> Tempo por Departamento</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-dept-time" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[100px] bg-panel">Depto</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Tempo</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ABA 2: Perfil & Canais -->
      <div id="tab-perfil" class="main-tab-content hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-chat-square-dots text-muted"></i> Canais Usados</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-client-channels" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Canal</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Volume</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-receipt text-muted"></i> Regime Tributário</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-regime" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Regime</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Volume</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-file-earmark-check text-muted"></i> Status do Contrato</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-status-contrato" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Status</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Volume</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden h-[340px]">
            <div class="px-4 py-3 border-b border-border flex justify-between items-center cursor-pointer select-none shrink-0" onclick="togglePanel(this)">
              <h3 class="m-0 text-[0.85rem] font-semibold text-text flex items-center gap-2"><i class="bi bi-cash-coin text-muted"></i> Demanda Avulsa</h3>
              <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
            </div>
            <div class="panel-content flex-1 overflow-y-auto relative no-scrollbar">
              <table id="table-demanda-avulsa" class="w-full text-left table-fixed">
                <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
                  <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[120px] bg-panel">Cliente</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full pl-3 bg-panel">Volume</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal Detalhe Cliente -->
    <div id="client-detail-modal" class="hidden fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-5">
      <div class="bg-panel border border-border rounded-2xl w-full max-w-[1100px] flex flex-col relative shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        <div class="p-6 border-b border-border bg-panel-light/50 flex justify-between items-start">
          <div>
            <h3 id="client-detail-title" class="m-0 mb-3 text-[1.4rem] font-bold flex items-center text-text"></h3>
            <div id="client-detail-meta" class="flex flex-wrap gap-2"></div>
          </div>
          <button class="bg-transparent border-none text-muted hover:text-text text-2xl cursor-pointer transition-colors" onclick="closeClientDetailModal()">&times;</button>
        </div>
        
        <div class="p-6 overflow-y-auto max-h-[75vh] no-scrollbar">
          <div id="client-detail-inconsistency"></div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            <div class="lg:col-span-3 flex flex-col gap-6">
              <div class="flex flex-col sm:flex-row gap-5">
                <div class="bg-gradient-to-br from-accent-blue/5 to-panel border border-accent-blue/30 rounded-xl p-5 flex items-center gap-4 flex-1 glow-border">
                  <div class="w-12 h-12 rounded-xl bg-accent-blue/10 text-accent-blue flex items-center justify-center text-2xl shrink-0"><i class="bi bi-chat-left-text"></i></div>
                  <div>
                    <span class="block text-xs text-muted font-bold uppercase tracking-wider mb-1">Conversas (Período)</span>
                    <span id="client-detail-total" class="block text-3xl font-bold leading-none text-text">-</span>
                  </div>
                </div>
                
                <div class="bg-panel border border-border rounded-xl p-4 flex flex-col justify-center flex-1 shadow-inner">
                   <span class="text-[0.75rem] text-muted font-bold uppercase tracking-wider mb-2.5 flex items-center"><i class="bi bi-broadcast mr-1.5"></i> Canais Utilizados</span>
                   <div id="client-detail-channels" class="flex flex-wrap gap-2"></div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div class="bg-panel border border-border rounded-xl flex flex-col overflow-hidden shadow-inner">
                  <div class="p-4 border-b border-border/50 bg-panel-light/50">
                    <h3 class="m-0 text-[0.9rem] font-semibold text-text flex items-center"><i class="bi bi-folder2-open text-muted mr-2"></i> Assuntos</h3>
                  </div>
                  <div class="flex-1 overflow-y-auto max-h-[250px] no-scrollbar">
                    <table id="client-detail-subject-table" class="w-full text-left">
                      <thead class="sticky top-0 bg-panel-light z-10 shadow-[0_1px_0_var(--border)]">
                        <tr><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider">Assunto</th><th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right">Total</th></tr>
                      </thead>
                      <tbody></tbody>
                    </table>
                  </div>
                </div>

                <div class="bg-panel border border-border rounded-xl flex flex-col overflow-hidden shadow-inner">
                  <div class="p-4 border-b border-border/50 bg-panel-light/50">
                    <h3 class="m-0 text-[0.9rem] font-semibold text-text flex items-center"><i class="bi bi-diagram-3 text-muted mr-2"></i> Tempo por Depto</h3>
                  </div>
                  <div class="flex-1 overflow-y-auto max-h-[250px] no-scrollbar">
                    <table id="client-detail-team-table" class="w-full text-left table-fixed">
                      <thead class="sticky top-0 bg-panel-light z-10 shadow-[0_1px_0_var(--border)]">
                        <tr>
                          <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-[35%]">Depto</th>
                          <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[15%]">Qtd</th>
                          <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[25%]">T.Médio</th>
                          <th class="px-3 py-2 text-[0.65rem] font-bold text-muted uppercase tracking-wider text-right w-[25%]">T.Total</th>
                        </tr>
                      </thead>
                      <tbody></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div class="lg:col-span-2 bg-panel border border-border rounded-xl flex flex-col overflow-hidden max-h-[520px] shadow-sm">
              <div class="p-4 border-b border-border bg-panel-light/50">
                <h3 class="m-0 text-[0.95rem] font-semibold text-text flex items-center"><i class="bi bi-chat-dots text-muted mr-2"></i> Histórico de Conversas</h3>
              </div>
              <div id="client-detail-conv-list" class="flex-1 overflow-y-auto p-4 flex flex-col gap-2 no-scrollbar"></div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    const oldModal = document.querySelector('body > #client-detail-modal');
    if (oldModal) oldModal.remove();

    const modalEl = document.getElementById('client-detail-modal');
    if (modalEl) {
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', function (e) {
        if (e.target === this) closeClientDetailModal();
      });
    }

    // Configuração das Abas (Cyberpunk Clean Style)
    const mainTabBtns = document.querySelectorAll('.main-tab-btn');
    const mainTabPanes = document.querySelectorAll('.main-tab-content');
    
    mainTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        mainTabBtns.forEach(b => {
          b.classList.remove('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
          b.classList.add('text-muted', 'border-transparent', 'bg-transparent');
        });
        btn.classList.add('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
        btn.classList.remove('text-muted', 'border-transparent', 'bg-transparent');

        const targetId = btn.dataset.target;
        mainTabPanes.forEach(pane => {
          if (pane.id === targetId) {
            pane.classList.remove('hidden');
            pane.classList.add('block');
          } else {
            pane.classList.add('hidden');
            pane.classList.remove('block');
          }
        });
      });
    });

    DateRangePicker.mount('#clients-date-picker', {
      onChange: async (range) => {
        const content = document.getElementById('content');
        content.classList.add('opacity-50', 'pointer-events-none');
        await renderClientsData(range);
        content.classList.remove('opacity-50', 'pointer-events-none');
      },
    });

    await loadClientChannelInfo();
    await renderClientsData(DateRangePicker.getSelectedRange());
  }
};
