const CLIENT_DAYS_OPTIONS = [7, 14, 30, 90, 180];
const CLIENT_CHANNEL_MAP = { 
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

function clientChannelBadge(val) {
  const info = CLIENT_CHANNEL_MAP[val] || CLIENT_CHANNEL_MAP.other;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

// Layout mais limpo e condensado para as barras de progresso (Bullet Chart inline)
function buildProgressTableHTML(data, labelFn, valFn, formatFn = null) {
  const sorted = [...data].sort((a, b) => valFn(b) - valFn(a));
  const total = sorted.reduce((sum, r) => sum + valFn(r), 0);
  if (sorted.length === 0) return '<tr><td colspan="2"><div class="empty-state" style="padding: 16px;"><i class="bi bi-inbox" style="font-size: 1.5rem;"></i><span>Sem dados</span></div></td></tr>';
  
  return sorted.map(r => {
    const val = valFn(r);
    const displayVal = formatFn ? formatFn(val) : val;
    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
    const label = labelFn(r);
    return `
      <tr>
        <td style="font-weight: 500; width: 40%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${label}">${label}</td>
        <td style="width: 60%; vertical-align: middle; padding-right: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.75rem;">
            <span style="font-weight: 600; color: var(--text);">${displayVal}</span>
            <span style="color: var(--muted);">${pct}%</span>
          </div>
          <div style="width: 100%; background: var(--bg); border-radius: 3px; height: 6px; overflow: hidden; border: 1px solid var(--border);">
            <div style="width: ${pct}%; background: var(--accent); height: 100%; border-radius: 3px; transition: width 1s ease-in-out;"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function openClientDetailModal(clientKey, days) {
  const detail = await fetch(`/monitor/api/clients/${encodeURIComponent(clientKey)}/detail?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const settings = window.__monitorSettings || {};
  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.getElementById('client-detail-title').innerHTML = `<i class="bi bi-building" style="color: var(--accent-green); margin-right: 8px;"></i>${detail.client_name || 'Detalhes do Cliente'}`;
  document.getElementById('client-detail-meta').innerHTML = 
    `<span style="background: var(--bg); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border);"><i class="bi bi-info-circle"></i> ${detail.regime_tributario || 'Regime não informado'}</span>
     <span style="background: var(--bg); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border);"><i class="bi bi-check-circle"></i> ${detail.status_contrato || 'Status não informado'}</span>`;
  
  document.getElementById('client-detail-total').textContent = detail.total || 0;

  document.querySelector('#client-detail-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `<tr><td style="font-weight: 500;">${r.subject}</td><td style="text-align: right;"><span class="badge badge-neutral">${r.total}</span></td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state" style="padding: 10px;"><i class="bi bi-folder2-open" style="font-size: 1.2rem;"></i><span>Sem dados</span></div></td></tr>';

  document.querySelector('#client-detail-team-table tbody').innerHTML = (detail.by_team || []).length
    ? detail.by_team.map(t => `
        <tr>
          <td style="font-weight: 500;">${t.team_name}</td>
          <td style="text-align: right;"><span class="badge badge-neutral">${t.total}</span></td>
          <td style="text-align: right;">${formatDetailedDuration(t.avg_resolution)}</td>
          <td style="text-align: right; color: var(--accent-blue); font-weight: 600;">${formatDetailedDuration(t.total_minutes)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 10px;"><i class="bi bi-diagram-3" style="font-size: 1.2rem;"></i><span>Sem dados</span></div></td></tr>';

  const ch = detail.by_channel || {};
  document.getElementById('client-detail-channels').innerHTML = Object.entries(ch)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const info = CLIENT_CHANNEL_MAP[k] || CLIENT_CHANNEL_MAP.other;
      return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:6px; padding: 6px 12px; font-size: 0.85rem;"><i class="bi ${info.icon}"></i> ${info.label}: ${v}</span>`;
    }).join('') || '<span class="muted-text">Sem dados</span>';

  document.querySelector('#client-detail-conv-table tbody').innerHTML = (detail.conversations || []).length
    ? detail.conversations.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const late = r.resolution_minutes !== null && r.target_resolution_minutes !== null && r.resolution_minutes > r.target_resolution_minutes;
        
        let slaTag = '<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Aberto</span>';
        if (r.resolution_minutes !== null) {
          const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
          slaTag = `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="display:inline-flex; align-items:center; gap:4px; white-space:nowrap;"><i class="bi ${icon}"></i> ${late ? 'Atrasado' : 'No prazo'}</span>`;
        }

        return `
          <tr>
            <td style="font-weight: 500;">${r.conversation_id}</td>
            <td>${r.subject || 'Não categorizado'}</td>
            <td class="muted-text">${new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
            <td>${slaTag}</td>
            <td style="text-align: right;">
              <button class="topbar-btn" style="padding: 4px 8px;" data-tooltip="Visualizar" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="5"><div class="empty-state" style="padding: 20px;"><i class="bi bi-inbox" style="font-size: 1.8rem; margin-bottom: 8px;"></i><span>Nenhuma conversa no período</span></div></td></tr>';

  document.getElementById('client-detail-modal').classList.remove('hidden');
}

function closeClientDetailModal() {
  document.getElementById('client-detail-modal').classList.add('hidden');
}

async function renderClientsData(days) {
  const [clients, subjects, newVsReturning, settings, deptTime, demandaAvulsa, byRegime, byStatusContrato] = await Promise.all([
    fetch(`/monitor/api/clients/summary?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/subjects/summary?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/new-vs-returning?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/departments/client-time?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/demanda-avulsa?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/by-regime?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/clients/by-status-contrato?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  window.__monitorSettings = settings;

  document.getElementById('clients-total').textContent = clients.length || 0;
  document.getElementById('clients-new').textContent = newVsReturning.new_clients ?? 0;
  document.getElementById('clients-returning').textContent = newVsReturning.returning_clients ?? 0;

  const totalConvs = clients.reduce((sum, c) => sum + (c.total || 0), 0);
  document.getElementById('clients-total-convs').textContent = totalConvs;

  // Canais
  const totalChannels = { whatsapp: 0, email: 0, other: 0 };
  clients.forEach(c => {
    if(c.channels) {
      totalChannels.whatsapp += (c.channels.whatsapp || 0);
      totalChannels.email += (c.channels.email || 0);
      totalChannels.other += (c.channels.other || 0);
    }
  });
  const channelsData = [
    { label: 'WhatsApp', value: totalChannels.whatsapp },
    { label: 'E-mail', value: totalChannels.email },
    { label: 'Outros', value: totalChannels.other }
  ].filter(c => c.value > 0);
  document.querySelector('#table-client-channels tbody').innerHTML = buildProgressTableHTML(channelsData, d => d.label, d => d.value);

  // Clientes - Volume
  const topVolume = [...clients].sort((a, b) => b.total - a.total).slice(0, 10);
  document.querySelector('#table-clients-volume tbody').innerHTML = topVolume.length
    ? topVolume.map(c => `
      <tr>
        <td style="font-weight: 500; white-space: nowrap; cursor: pointer; color: var(--text);" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">${c.client_name}</td>
        <td style="text-align: right;"><span class="badge badge-neutral" style="font-size: 0.8rem;">${c.total}</span></td>
        <td style="text-align: right; width: 40px;">
          <button class="topbar-btn" style="padding: 4px;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">
            <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  // Clientes - Tempo
  const topTime = [...clients].filter(c => c.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 10);
  document.querySelector('#table-clients-time tbody').innerHTML = topTime.length
    ? topTime.map(c => `
      <tr>
        <td style="font-weight: 500; white-space: nowrap; cursor: pointer; color: var(--text);" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">${c.client_name}</td>
        <td style="text-align: right; font-weight: 600; color: var(--accent-yellow);">${formatDetailedDuration(c.avg_resolution)}</td>
        <td style="text-align: right; width: 40px;">
          <button class="topbar-btn" style="padding: 4px;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">
            <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  // Clientes - SLA
  const topBreach = [...clients].filter(c => c.breach_count > 0).sort((a, b) => b.breach_count - a.breach_count).slice(0, 10);
  document.querySelector('#table-clients-breach tbody').innerHTML = topBreach.length
    ? topBreach.map(c => `
      <tr>
        <td style="font-weight: 500; white-space: nowrap; cursor: pointer; color: var(--text);" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">${c.client_name}</td>
        <td style="text-align: right;"><span class="badge badge-red" style="font-size: 0.8rem;"><i class="bi bi-exclamation-circle"></i> ${c.breach_count}x</span></td>
        <td style="text-align: right; width: 40px;">
          <button class="topbar-btn" style="padding: 4px;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})">
            <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3"><div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green); font-size: 1.8rem; margin-bottom: 8px;"></i><span>Nenhum SLA perdido</span></div></td></tr>';

  // Assuntos - Volume (Progress Bar)
  const topSubjectVolume = [...subjects].sort((a, b) => b.total - a.total).slice(0, 10);
  document.querySelector('#table-subjects-volume tbody').innerHTML = buildProgressTableHTML(topSubjectVolume, d => d.subject, d => d.total);

  // Assuntos - Tempo
  const topSubjectTime = [...subjects].filter(s => s.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 10);
  document.querySelector('#table-subjects-time tbody').innerHTML = topSubjectTime.length
    ? topSubjectTime.map(s => `<tr><td style="font-weight: 500;">${s.subject}</td><td style="text-align: right; font-weight: 600; color: var(--accent-yellow);">${formatDetailedDuration(s.avg_resolution)}</td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  // Depto - Tempo (Progress Bar)
  document.querySelector('#table-dept-time tbody').innerHTML = buildProgressTableHTML(deptTime, d => d.team_name, d => Math.round(d.total_minutes), val => formatDetailedDuration(val));

  // Demanda Avulsa (Progress Bar)
  const demandaAvulsaTop = demandaAvulsa.slice(0, 10);
  document.querySelector('#table-demanda-avulsa tbody').innerHTML = buildProgressTableHTML(demandaAvulsaTop, d => d.client_name, d => d.total);

  // Regime Tributário (Progress Bar)
  document.querySelector('#table-regime tbody').innerHTML = buildProgressTableHTML(byRegime, d => d.regime, d => d.total);

  // Status Contrato (Progress Bar)
  document.querySelector('#table-status-contrato tbody').innerHTML = buildProgressTableHTML(byStatusContrato, d => d.status_contrato, d => d.total);
}

Screens.clients = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent-green);">
        <i class="bi bi-buildings"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Visão Clientes</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Métricas e análises da sua carteira de clientes</p>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 24px;">
      ${CLIENT_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="cards" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <i class="bi bi-building card-icon" style="color: var(--accent-blue);"></i>
        <span class="card-label">Clientes Atendidos</span>
        <span class="card-value" id="clients-total">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-chat-dots card-icon" style="color: var(--accent-yellow);"></i>
        <span class="card-label">Total de Conversas</span>
        <span class="card-value" id="clients-total-convs">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-person-plus card-icon" style="color: var(--accent-green);"></i>
        <span class="card-label">Novos Clientes</span>
        <span class="card-value" id="clients-new">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-people card-icon" style="color: var(--muted);"></i>
        <span class="card-label">Clientes Recorrentes</span>
        <span class="card-value" id="clients-returning">-</span>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-arrow-repeat"></i> Mais Recorrentes</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-clients-volume" class="sortable">
            <thead><tr><th data-sort="string">Cliente</th><th data-sort="number" style="text-align: right;">Total</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-hourglass-bottom"></i> Demandam Mais Tempo</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-clients-time" class="sortable">
            <thead><tr><th data-sort="string">Cliente</th><th data-sort="time" style="text-align: right;">Tempo Médio</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-shield-exclamation"></i> SLA Perdido</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-clients-breach" class="sortable">
            <thead><tr><th data-sort="string">Cliente</th><th data-sort="number" style="text-align: right;">Atrasos</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-folder-fill"></i> Assuntos Recorrentes</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-subjects-volume" class="sortable">
            <thead><tr><th>Assunto</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-clock-history"></i> Assuntos (Tempo Médio)</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-subjects-time" class="sortable">
            <thead><tr><th data-sort="string">Assunto</th><th data-sort="time" style="text-align: right;">Tempo Médio</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Tempo por Departamento</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-dept-time" class="sortable">
            <thead><tr><th>Depto</th><th style="width: 100%;">Tempo / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-3-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-chat-square-dots"></i> Canais Usados</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-client-channels" class="sortable">
            <thead><tr><th>Canal</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-receipt"></i> Por Regime Tributário</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-regime" class="sortable">
            <thead><tr><th>Regime</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-file-earmark-check"></i> Status do Contrato</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-status-contrato" class="sortable">
            <thead><tr><th>Status</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="grid-3-cols">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-cash-coin"></i> Demanda Avulsa / Extra</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 280px;">
          <table id="table-demanda-avulsa" class="sortable">
            <thead><tr><th>Cliente</th><th style="width: 100%;">Volume / Proporção</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Detalhe Cliente -->
    <div id="client-detail-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 1000px; min-width: 0;">
        <button class="modal-close" onclick="closeClientDetailModal()">&times;</button>
        
        <h3 id="client-detail-title" style="margin-bottom: 8px; font-size: 1.4rem; display: flex; align-items: center; border-bottom: none; padding-bottom: 0;"></h3>
        <div id="client-detail-meta" style="display: flex; gap: 8px; font-size: 0.85rem; color: var(--muted); margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px;"></div>

        <div class="cards" style="margin-bottom: 24px;">
          <div class="card" style="flex-direction: row; justify-content: flex-start; gap: 16px; padding: 16px 24px; min-width: 250px; flex: none; background: linear-gradient(135deg, rgba(41,163,255,0.05), var(--panel) 60%); border-color: rgba(41,163,255,0.3);">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(41, 163, 255, 0.1); color: var(--accent-blue); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
              <i class="bi bi-chat-left-text"></i>
            </div>
            <div style="text-align: left;">
              <span class="card-label" style="margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase;">Conversas (Período)</span>
              <span class="card-value" id="client-detail-total" style="font-size: 1.8rem;">-</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; justify-content: center; padding-left: 12px;">
             <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">Canais Utilizados</span>
             <div id="client-detail-channels" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; margin-bottom: 24px;">
          <div style="display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
            <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 0.9rem;"><i class="bi bi-folder2-open" style="margin-right: 6px;"></i> Assuntos</h3>
            <div class="table-responsive" style="flex: 1; max-height: 220px;">
              <table id="client-detail-subject-table" style="background: transparent;">
                <thead><tr><th>Assunto</th><th style="text-align: right;">Total</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
            <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 0.9rem;"><i class="bi bi-diagram-3" style="margin-right: 6px;"></i> Tempo por Departamento</h3>
            <div class="table-responsive" style="flex: 1; max-height: 220px;">
              <table id="client-detail-team-table" style="background: transparent;">
                <thead><tr><th>Departamento</th><th style="text-align: right;">Total</th><th style="text-align: right;">Tempo Médio</th><th style="text-align: right;">Tempo Total</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <h3 style="margin-bottom: 12px; font-size: 1.1rem;"><i class="bi bi-chat-dots" style="margin-right: 6px;"></i> Histórico de Conversas</h3>
        <div class="table-responsive" style="max-height: 350px;">
          <table id="client-detail-conv-table" class="sortable">
            <thead><tr><th data-sort="number">Código</th><th data-sort="string">Assunto</th><th data-sort="string">Criação</th><th data-sort="string">SLA</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
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

    let selectedDays = Number(localStorage.getItem('monitor-filter-days')) || 30;

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
        
        await renderClientsData(selectedDays); 
        
        content.classList.remove('loading');
      });
    });

    await renderClientsData(selectedDays); 
  }
};
