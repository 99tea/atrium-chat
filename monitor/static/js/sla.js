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

function buildSlaRow(labelHtml, data, targetSla) {
  if (data.resolution_breach_rate == null) {
    return `<tr>
              <td style="font-weight: 500; white-space: nowrap;">${labelHtml}</td>
              <td colspan="5"><div class="empty-state" style="padding: 4px;"><span style="font-size: 0.8rem;">Sem dados</span></div></td>
            </tr>`;
  }

  const attained = (1 - data.resolution_breach_rate) * 100;
  const isBreached = attained < targetSla;
  const barColor = isBreached ? 'var(--accent-red)' : 'var(--accent-green)';
  
  return `
    <tr>
      <td style="font-weight: 500; white-space: nowrap;">${labelHtml}</td>
      <td>${data.total || 0}</td>
      <td style="white-space: nowrap;">${formatDuration(data.avg_first_response)}</td>
      <td style="white-space: nowrap;">${formatDuration(data.avg_resolution)}</td>
      <td style="min-width: 80px; vertical-align: middle;">
        <div style="width: 100%; background: var(--bg); border-radius: 4px; height: 8px; overflow: hidden; border: 1px solid var(--border);">
          <div style="width: ${attained}%; background: ${barColor}; height: 100%; border-radius: 4px; transition: width 1s ease-in-out;"></div>
        </div>
      </td>
      <td style="text-align: right; font-weight: 600; color: ${barColor};">${attained.toFixed(1)}%</td>
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

  document.getElementById('sla-frt').textContent = formatDuration(summary.avg_first_response);
  document.getElementById('sla-res').textContent = formatDuration(summary.avg_resolution);

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

  const emptyRow = '<tr><td colspan="6"><div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  // Prioridade (Ordenada pelo mapa)
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
    buildSlaRow(s.subject || 'Não categorizado', s, target)
  ).join('') : emptyRow;

  // Time
  document.getElementById('tb-sla-team').innerHTML = byTeam.length ? byTeam.sort((a, b) => b.total - a.total).map(t => 
    buildSlaRow(t.team_name, t, target)
  ).join('') : emptyRow;

  // Clientes (Piores)
  document.getElementById('tb-sla-client-worst').innerHTML = (byClient.worst || []).length ? byClient.worst.map(c => 
    buildSlaRow(c.client_name, c, target)
  ).join('') : emptyRow;

  // Clientes (Melhores)
  document.getElementById('tb-sla-client-best').innerHTML = (byClient.best || []).length ? byClient.best.map(c => 
    buildSlaRow(c.client_name, c, target)
  ).join('') : emptyRow;
}

Screens.sla = {
  template: `
    <h2>Visão SLA</h2>
    <div class="filter-bar" style="margin-bottom: 20px;">
      <button class="filter-btn" data-days="7">7D</button>
      <button class="filter-btn" data-days="14">14D</button>
      <button class="filter-btn active" data-days="30">30D</button>
      <button class="filter-btn" data-days="90">90D</button>
      <button class="filter-btn" data-days="180">180D</button>
    </div>

    <div class="cards" style="margin-bottom: 24px;">
      <div class="card">
        <i class="bi bi-stopwatch card-icon"></i>
        <span class="card-label">1ª Resposta (Média)</span>
        <span class="card-value" id="sla-frt">-</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-all card-icon"></i>
        <span class="card-label">Resolução (Média)</span>
        <span class="card-value" id="sla-res">-</span>
      </div>
      <div class="card">
        <i class="bi bi-shield-check card-icon"></i>
        <span class="card-label">% SLA Atingido vs Meta</span>
        <span class="card-value" id="sla-attained" style="white-space: nowrap;">-</span>
      </div>
      <div class="card">
        <i class="bi bi-envelope-check card-icon"></i>
        <span class="card-label">Conversas no SLA / Total</span>
        <span class="card-value" id="sla-total">-</span>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>SLA por Prioridade</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Prioridade</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-sla-priority"></tbody>
          </table>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>SLA por Canal</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Canal</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-sla-channel"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>SLA por Assunto</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Assunto</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-sla-subject"></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>SLA por Departamento</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Time</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-sla-team"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Clientes (Maiores Ofensores)</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Cliente</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
              </tr>
            </thead>
            <tbody id="tb-sla-client-worst"></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Clientes (Melhores SLAs)</h3>
        <div class="table-responsive" style="flex: 1;">
          <table class="sortable">
            <thead>
              <tr>
                <th data-sort="string">Cliente</th>
                <th data-sort="number">Total</th>
                <th data-sort="time">1ª Resp.</th>
                <th data-sort="time">Resolução</th>
                <th style="width: 100%;">Progresso</th>
                <th data-sort="number">%</th>
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
