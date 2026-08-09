const ME_DAYS_OPTIONS = [7, 14, 30, 90, 180];

const ME_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

const ME_LABEL_COLORS = {
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

function meSlaBadge(row) {
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return `<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  
  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i class="bi ${icon}"></i> ${late ? 'Atrasado ' : 'Em '}${formatDuration(absMinutes)}
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
  const hex = ME_LABEL_COLORS[label.toLowerCase()] || '#9296b8';
  return `<span class="badge badge-neutral" style="margin-right:4px; display:inline-flex; align-items:center; gap:6px; padding-left:8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
            ${label}
          </span>`;
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
  document.getElementById('me-frt').textContent = formatDuration(s.avg_first_response);
  document.getElementById('me-res').textContent = formatDuration(s.avg_resolution);

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

  const PRIORITY_ORDER_ME = ['urgent', 'high', 'medium', 'low', 'none'];
  const orderedPriority = PRIORITY_ORDER_ME.map(p => detail.by_priority?.find(r => r.priority === p) || { priority: p, total: 0, avg_resolution: null, avg_first_response: null });

  document.querySelector('#me-priority-table tbody').innerHTML = orderedPriority.map(r => {
    return `
      <tr>
        <td>${mePriorityBadge(r.priority)}</td>
        <td>${r.total}</td>
        <td>${formatDuration(r.avg_first_response)}</td>
        <td>${formatDuration(r.avg_resolution)}</td>
      </tr>
    `;
  }).join('');

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
            <td>${r.total}</td>
            <td>${formatDuration(r.avg_first_response)}</td>
            <td>${formatDuration(r.avg_resolution)}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 15px;"><i class="bi bi-chat-dots" style="font-size: 1.5rem;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#me-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `
        <tr>
          <td>${r.subject}</td>
          <td>${r.total}</td>
          <td>${formatDuration(r.avg_first_response)}</td>
          <td>${formatDuration(r.avg_resolution)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 15px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Sem dados no período</span></div></td></tr>';

  document.querySelector('#me-labels-table tbody').innerHTML = (detail.open_labels || []).length
    ? detail.open_labels.map(r => `<tr><td>${meLabelBadge(r.label)}</td><td>${r.total}</td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state" style="padding: 15px;"><i class="bi bi-tag" style="font-size: 1.5rem;"></i><span>Nenhuma etiqueta</span></div></td></tr>';

  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.querySelector('#me-open-table tbody').innerHTML = status.length
    ? status.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const chInfo = ME_CHANNEL_MAP[r.channel] || ME_CHANNEL_MAP.other;
        return `
          <tr>
            <td>${r.conversation_id}</td>
            <td>${mePriorityBadge(r.priority)}</td>
            <td>${r.subject || '-'}</td>
            <td>${r.contact_name || '-'}</td>
            <td>
              <span class="badge ${chInfo.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
                <i class="bi ${chInfo.icon}"></i> ${chInfo.label}
              </span>
            </td>
            <td>${meSlaBadge(r)}</td>
            <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="window.open('${url}', '_blank')"></i></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7"><div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green);"></i><span>Nenhuma conversa aberta no momento</span></div></td></tr>';
}

Screens.me = {
  template: `
    <h2>Meus Dados</h2>

    <div class="filter-bar" style="margin-bottom: 20px;">
      ${ME_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="cards" style="margin-bottom: 24px;">
      <div class="card">
        <i class="bi bi-stopwatch card-icon"></i>
        <span class="card-label">1ª Resposta</span>
        <span class="card-value" id="me-frt">-</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-all card-icon"></i>
        <span class="card-label">Resolução</span>
        <span class="card-value" id="me-res">-</span>
      </div>
      <div class="card">
        <i class="bi bi-shield-check card-icon"></i>
        <span class="card-label">SLA Atingido</span>
        <span class="card-value" id="me-sla">-</span>
      </div>
      <div class="card" style="border-color: rgba(41,163,255,0.3); background: linear-gradient(135deg, rgba(41,163,255,0.05), var(--panel) 60%);">
        <i class="bi bi-hourglass-split card-icon" style="color: var(--accent);"></i>
        <span class="card-label">Aguardando minha resposta</span>
        <span class="card-value" id="me-awaiting">-</span>
      </div>
      <div class="card" style="border-color: rgba(255,194,71,0.3); background: linear-gradient(135deg, rgba(255,194,71,0.05), var(--panel) 60%);">
        <i class="bi bi-arrow-repeat card-icon" style="color: var(--accent-yellow);"></i>
        <span class="card-label">Reaberturas</span>
        <span class="card-value" id="me-reopened">-</span>
      </div>
    </div>

    <div class="attention-assignees-row" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Resolução por prioridade</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <table id="me-priority-table">
            <thead><tr><th>Prioridade</th><th>Total</th><th style="white-space: nowrap;">1ª Resposta</th><th>Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Resolução por canal</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <table id="me-channel-table">
            <thead><tr><th>Canal</th><th>Total</th><th style="white-space: nowrap;">1ª Resposta</th><th>Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Resolução por assunto</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <table id="me-subject-table">
            <thead><tr><th>Assunto</th><th>Total</th><th style="white-space: nowrap;">1ª Resposta</th><th>Resolução</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Abertas por etiqueta</h3>
        <div class="table-responsive" style="flex: 1; max-height: none; overflow-y: auto;">
          <table id="me-labels-table">
            <thead><tr><th>Etiqueta</th><th>Total</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <h2 style="margin-top: 32px;">Minhas conversas abertas</h2>
    <div class="panel">
      <div class="table-responsive" style="max-height: 50vh;">
        <table id="me-open-table">
          <thead>
            <tr>
              <th>Código</th>
              <th style="white-space: nowrap;">Pr.</th>
              <th>Assunto</th>
              <th>Cliente</th>
              <th>Canal</th>
              <th style="white-space: nowrap;">SLA</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `,
  load: async function () {
    let selectedDays = 30;

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDays = Number(btn.dataset.days);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMeData(selectedDays);
      });
    });

    await renderMeData(selectedDays);
  },
};
