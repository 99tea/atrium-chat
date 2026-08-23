const SLA_DAYS_OPTIONS = [7, 14, 30, 90, 180];

const SLA_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

const SLA_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill', order: 1 }, 
  high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill', order: 2 }, 
  medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill', order: 3 }, 
  low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill', order: 4 }, 
  none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill', order: 5 } 
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

// Layout mais limpo e condensado para as barras de progresso
function buildSlaRow(labelHtml, data, targetSla) {
  if (data.resolution_breach_rate == null) {
    return `<tr><td colspan="3"><div class="empty-state" style="padding: 16px;"><i class="bi bi-inbox" style="font-size: 1.5rem;"></i><span>Sem dados</span></div></td></tr>`;
  }

  const attained = (1 - data.resolution_breach_rate) * 100;
  const isBreached = attained < targetSla;
  const barColor = isBreached ? 'var(--accent-red)' : 'var(--accent-green)';
  
  return `
    <tr>
      <td style="width: 35%; vertical-align: middle;">
        <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
          ${labelHtml}
        </div>
        <div class="muted-text" style="font-size: 0.75rem; margin-top: 6px; font-weight: 600;">VOL: ${data.total || 0}</div>
      </td>
      <td style="width: 25%; vertical-align: middle;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 0.8rem; display: flex; align-items: center; gap: 6px;"><i class="bi bi-stopwatch muted-text" style="font-size: 0.9rem;"></i> <span style="font-weight: 500;">${formatDetailedDuration(data.avg_first_response)}</span></span>
          <span style="font-size: 0.8rem; display: flex; align-items: center; gap: 6px;"><i class="bi bi-check2-all muted-text" style="font-size: 0.9rem;"></i> <span style="font-weight: 500;">${formatDetailedDuration(data.avg_resolution)}</span></span>
        </div>
      </td>
      <td style="width: 40%; vertical-align: middle; padding-right: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.75rem;">
          <span style="font-weight: 600; color: var(--muted);">Meta: ${targetSla}%</span>
          <span style="color: ${barColor}; font-weight: 700; font-size: 0.85rem;">${attained.toFixed(1)}%</span>
        </div>
        <div style="width: 100%; background: var(--bg); border-radius: 3px; height: 6px; overflow: hidden; border: 1px solid var(--border);">
          <div style="width: ${attained}%; background: ${barColor}; height: 100%; border-radius: 3px; transition: width 1s ease-in-out; box-shadow: 0 0 4px ${barColor}80;"></div>
        </div>
      </td>
    </tr>
  `;
}

async function renderSlaData(days) {
  const [summary, byPriority, byChannel, bySubject, byTeam, byClient, settings] = await Promise.all([
    fetch(`/monitor/api/sla/summary?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`/monitor/api/sla/by-priority?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-channel?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-subject?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-team?days=${days}`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`/monitor/api/sla/by-client?days=${days}`).then(r => r.ok ? r.json() : {best: [], worst: []}).catch(() => ({best: [], worst: []})),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  ]);

  document.getElementById('sla-frt').textContent = formatDetailedDuration(summary.avg_first_response);
  document.getElementById('sla-res').textContent = formatDetailedDuration(summary.avg_resolution);

  const target = settings.sla_target_percent || 95;
  const attained = summary.resolution_breach_rate != null ? ((1 - summary.resolution_breach_rate) * 100).toFixed(1) : null;
  const slaEl = document.getElementById('sla-attained');

  if (attained !== null) {
    slaEl.textContent = `${attained}% / ${target}%`;
    slaEl.style.color = Number(attained) >= Number(target) ? 'var(--accent-green)' : 'var(--accent-red)';
  } else {
    slaEl.textContent = '-';
    slaEl.style.color = '';
  }

  const totalInSla = summary.total && attained !== null ? Math.round(summary.total * (attained / 100)) : 0;
  document.getElementById('sla-total').textContent = `${totalInSla} / ${summary.total || 0}`;

  const emptyRow = '<tr><td colspan="3"><div class="empty-state" style="padding: 24px;"><i class="bi bi-inbox" style="font-size: 1.8rem; margin-bottom: 8px;"></i><span>Sem dados no período</span></div></td></tr>';

  // Prioridade
  const sortedPriority = [...byPriority].sort((a, b) => {
    const oa = (SLA_PRIORITY_MAP[String(a.priority).toLowerCase()] || SLA_PRIORITY_MAP.none).order;
    const ob = (SLA_PRIORITY_MAP[String(b.priority).toLowerCase()] || SLA_PRIORITY_MAP.none).order;
    return oa - ob;
  });
  document.getElementById('tb-sla-priority').innerHTML = sortedPriority.length ? sortedPriority.map(p => {
    const info = SLA_PRIORITY_MAP[String(p.priority).toLowerCase()] || SLA_PRIORITY_MAP.none;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildSlaRow(label, p, target);
  }).join('') : emptyRow;

  // Canal
  document.getElementById('tb-sla-channel').innerHTML = byChannel.length ? byChannel.sort((a, b) => b.total - a.total).map(c => {
    const info = SLA_CHANNEL_MAP[String(c.channel).toLowerCase()] || SLA_CHANNEL_MAP.other;
    const label = `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
    return buildSlaRow(label, c, target);
  }).join('') : emptyRow;

  // Assunto
  document.getElementById('tb-sla-subject').innerHTML = bySubject.length ? bySubject.sort((a, b) => b.total - a.total).map(s => 
    buildSlaRow(`<span style="color: var(--text);">${s.subject || 'Não categorizado'}</span>`, s, target)
  ).join('') : emptyRow;

  // Time
  document.getElementById('tb-sla-team').innerHTML = byTeam.length ? byTeam.sort((a, b) => b.total - a.total).map(t => 
    buildSlaRow(`<span style="color: var(--text);"><i class="bi bi-people" style="margin-right: 6px; color: var(--muted);"></i>${t.team_name}</span>`, t, target)
  ).join('') : emptyRow;

  // Clientes (Piores)
  document.getElementById('tb-sla-client-worst').innerHTML = (byClient.worst || []).length ? byClient.worst.map(c => 
    buildSlaRow(`<span style="color: var(--text);"><i class="bi bi-building" style="margin-right: 6px; color: var(--muted);"></i>${c.client_name}</span>`, c, target)
  ).join('') : emptyRow;

  // Clientes (Melhores)
  document.getElementById('tb-sla-client-best').innerHTML = (byClient.best || []).length ? byClient.best.map(c => 
    buildSlaRow(`<span style="color: var(--text);"><i class="bi bi-building" style="margin-right: 6px; color: var(--muted);"></i>${c.client_name}</span>`, c, target)
  ).join('') : emptyRow;
}

Screens.sla = {
  template: `
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent-yellow);">
        <i class="bi bi-shield-check"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Visão SLA</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Análise de conformidade e tempos de resposta</p>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 24px;">
      ${SLA_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="cards" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <i class="bi bi-stopwatch card-icon" style="color: var(--accent-blue);"></i>
        <span class="card-label">1ª Resposta (Média)</span>
        <span class="card-value" id="sla-frt">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-check2-all card-icon" style="color: var(--accent-green);"></i>
        <span class="card-label">Resolução (Média)</span>
        <span class="card-value" id="sla-res">-</span>
      </div>
      <div class="card" style="padding: 20px; border-color: rgba(255,194,71,0.3); background: linear-gradient(135deg, rgba(255,194,71,0.05), var(--panel) 60%);">
        <i class="bi bi-shield-check card-icon" style="color: var(--accent-yellow);"></i>
        <span class="card-label">% SLA Atingido vs Meta</span>
        <span class="card-value" id="sla-attained" style="white-space: nowrap;">-</span>
      </div>
      <div class="card" style="padding: 20px;">
        <i class="bi bi-envelope-check card-icon" style="color: var(--muted);"></i>
        <span class="card-label">Conversas no SLA / Total</span>
        <span class="card-value" id="sla-total">-</span>
      </div>
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-flag"></i> SLA por Prioridade</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-priority">
            <thead>
              <tr>
                <th>Prioridade / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-priority"></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-chat-square-dots"></i> SLA por Canal</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-channel">
            <thead>
              <tr>
                <th>Canal / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-channel"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-folder-fill"></i> SLA por Assunto</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-subject">
            <thead>
              <tr>
                <th>Assunto / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-subject"></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> SLA por Departamento</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-team">
            <thead>
              <tr>
                <th>Departamento / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-team"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-2-cols" style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-shield-exclamation"></i> Clientes (SLA Perdidos)</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-client-worst">
            <thead>
              <tr>
                <th>Cliente / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-client-worst"></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0;"><i class="bi bi-shield-check"></i> Clientes (Melhores SLAs)</h3>
        </div>
        <div class="table-responsive" style="flex: 1; max-height: 400px;">
          <table id="table-sla-client-best">
            <thead>
              <tr>
                <th>Cliente / Vol.</th>
                <th>Tempos Médios</th>
                <th style="width: 100%;">Atingimento</th>
              </tr>
            </thead>
            <tbody id="tb-sla-client-best"></tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    let selectedDays = Number(localStorage.getItem('monitor-sla-filter-days')) || 30;

    document.querySelectorAll('#content .filter-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.days) === selectedDays);
    });

    document.querySelectorAll('#content .filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedDays = Number(btn.dataset.days);
        localStorage.setItem('monitor-sla-filter-days', selectedDays);
        
        document.querySelectorAll('#content .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const content = document.getElementById('content');
        content.classList.add('loading');
        
        await renderSlaData(selectedDays); 
        
        content.classList.remove('loading');
      });
    });

    await renderSlaData(selectedDays); 
  }
};
