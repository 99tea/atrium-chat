const CLIENT_DAYS_OPTIONS = [7, 14, 30, 90, 180];
const CLIENT_CHANNEL_MAP = { 
  whatsapp: { label: 'WhatsApp', badge: 'badge-green', icon: 'bi-whatsapp' }, 
  email: { label: 'E-mail', badge: 'badge-blue', icon: 'bi-envelope' }, 
  other: { label: 'Outros', badge: 'badge-neutral', icon: 'bi-chat-dots' } 
};

function clientRankItem(label, value, suffix = '') {
  return `<div class="sla-list-item"><span>${label}</span><span class="badge badge-neutral">${value}${suffix}</span></div>`;
}

function clientChannelBadge(val) {
  const info = CLIENT_CHANNEL_MAP[val] || CLIENT_CHANNEL_MAP.other;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

async function openClientDetailModal(clientKey, days) {
  const detail = await fetch(`/monitor/api/clients/${encodeURIComponent(clientKey)}/detail?days=${days}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const settings = window.__monitorSettings || {};
  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.getElementById('client-detail-title').textContent = detail.client_name || 'Detalhes do Cliente';
  document.getElementById('client-detail-meta').innerHTML = 
    `<i class="bi bi-info-circle"></i> ${detail.regime_tributario || 'Regime não informado'} &nbsp;&middot;&nbsp; <i class="bi bi-check-circle"></i> ${detail.status_contrato || 'Status não informado'}`;
  document.getElementById('client-detail-total').textContent = detail.total || 0;

  document.querySelector('#client-detail-subject-table tbody').innerHTML = (detail.by_subject || []).length
    ? detail.by_subject.map(r => `<tr><td>${r.subject}</td><td>${r.total}</td></tr>`).join('')
    : '<tr><td colspan="2"><div class="empty-state" style="padding: 10px;"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  document.querySelector('#client-detail-team-table tbody').innerHTML = (detail.by_team || []).length
    ? detail.by_team.map(t => `
        <tr>
          <td>${t.team_name}</td>
          <td>${t.total}</td>
          <td>${formatDuration(t.avg_resolution)}</td>
          <td>${formatDuration(t.total_minutes)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state" style="padding: 10px;"><i class="bi bi-inbox"></i><span>Sem dados</span></div></td></tr>';

  const ch = detail.by_channel || {};
  document.getElementById('client-detail-channels').innerHTML = Object.entries(ch)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const info = CLIENT_CHANNEL_MAP[k] || CLIENT_CHANNEL_MAP.other;
      return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; font-size: 0.8rem; margin-right: 6px;"><i class="bi ${info.icon}"></i> ${info.label}: ${v}</span>`;
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
            <td>${r.conversation_id}</td>
            <td>${r.subject || 'Não categorizado'}</td>
            <td>${new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
            <td>${slaTag}</td>
            <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="window.open('${url}', '_blank')"></i></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="5"><div class="empty-state" style="padding: 15px;"><i class="bi bi-inbox"></i><span>Nenhuma conversa no período</span></div></td></tr>';

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

  const totalChannels = { whatsapp: 0, email: 0, other: 0 };
  clients.forEach(c => {
    if(c.channels) {
      totalChannels.whatsapp += (c.channels.whatsapp || 0);
      totalChannels.email += (c.channels.email || 0);
      totalChannels.other += (c.channels.other || 0);
    }
  });

  renderChart('chart-client-channels', {
    type: 'doughnut',
    data: {
      labels: ['WhatsApp', 'E-mail', 'Outros'],
      datasets: [{ data: [totalChannels.whatsapp, totalChannels.email, totalChannels.other], backgroundColor: ['#34d399', '#29a3ff', '#9296b8'] }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#e8e8ea', boxWidth: 12 } } } },
  });

  const topVolume = [...clients].sort((a, b) => b.total - a.total).slice(0, 10);
  document.getElementById('list-clients-volume').innerHTML = topVolume.length
    ? topVolume.map(c => `<div class="sla-list-item" style="cursor:pointer;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})"><span>${c.client_name} <i class="bi bi-box-arrow-up-right" style="font-size:0.8em;color:var(--accent);"></i></span><span class="badge badge-neutral">${c.total}</span></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div>';

  const topTime = [...clients].filter(c => c.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 10);
  document.getElementById('list-clients-time').innerHTML = topTime.length
    ? topTime.map(c => `<div class="sla-list-item" style="cursor:pointer;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})"><span>${c.client_name} <i class="bi bi-box-arrow-up-right" style="font-size:0.8em;color:var(--accent);"></i></span><span class="badge badge-neutral">${formatDuration(c.avg_resolution)}</span></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-inbox"></i><span>Sem dados</span></div>';

  const topBreach = [...clients].filter(c => c.breach_count > 0).sort((a, b) => b.breach_count - a.breach_count).slice(0, 10);
  document.getElementById('list-clients-breach').innerHTML = topBreach.length
    ? topBreach.map(c => `<div class="sla-list-item" style="cursor:pointer;" onclick="openClientDetailModal('${c.client_key.replace(/'/g, "\\'")}', ${days})"><span>${c.client_name} <i class="bi bi-box-arrow-up-right" style="font-size:0.8em;color:var(--accent);"></i></span><span class="badge badge-red">${c.breach_count}x</span></div>`).join('')
    : '<div class="empty-state"><i class="bi bi-emoji-smile" style="color: var(--accent-green);"></i><span>Nenhum SLA perdido</span></div>';
  const topSubjectVolume = [...subjects].sort((a, b) => b.total - a.total).slice(0, 10);
  document.getElementById('list-subjects-volume').innerHTML = topSubjectVolume.length
    ? topSubjectVolume.map(s => clientRankItem(s.subject, s.total)).join('')
    : '<div class="empty-state" style="padding: 10px;"><i class="bi bi-inbox"></i><span>Sem dados</span></div>';

  const topSubjectTime = [...subjects].filter(s => s.avg_resolution !== null).sort((a, b) => b.avg_resolution - a.avg_resolution).slice(0, 10);
  document.getElementById('list-subjects-time').innerHTML = topSubjectTime.length
    ? topSubjectTime.map(s => `<div class="sla-list-item"><span>${s.subject}</span><span class="badge badge-neutral">${formatDuration(s.avg_resolution)}</span></div>`).join('')
    : '<div class="empty-state" style="padding: 10px;"><i class="bi bi-inbox"></i><span>Sem dados</span></div>';

  document.getElementById('list-dept-time').innerHTML = deptTime.length
    ? deptTime.map(d => clientRankItem(d.team_name, formatDuration(d.total_minutes), ` · ${d.clients} clientes`)).join('')
    : '<div class="empty-state" style="padding: 10px;"><i class="bi bi-inbox"></i><span>Sem dados</span></div>';

  document.getElementById('list-demanda-avulsa').innerHTML = demandaAvulsa.length
    ? demandaAvulsa.slice(0, 10).map(c => clientRankItem(c.client_name, c.total, 'x')).join('')
    : '<div class="empty-state" style="padding: 10px;"><i class="bi bi-emoji-smile" style="color: var(--accent-green);"></i><span>Nenhuma demanda avulsa</span></div>';

  const regimeColors = ['#29a3ff', '#34d399', '#ffc247', '#ff5c5c', '#a679ff', '#9296b8'];
  renderChart('chart-regime', {
    type: 'doughnut',
    data: {
      labels: byRegime.map(r => r.regime),
      datasets: [{ data: byRegime.map(r => r.total), backgroundColor: byRegime.map((_, i) => regimeColors[i % regimeColors.length]) }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e8e8ea', boxWidth: 12 } } } },
  });

  renderChart('chart-status-contrato', {
    type: 'doughnut',
    data: {
      labels: byStatusContrato.map(r => r.status_contrato),
      datasets: [{ data: byStatusContrato.map(r => r.total), backgroundColor: byStatusContrato.map((_, i) => regimeColors[i % regimeColors.length]) }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e8e8ea', boxWidth: 12 } } } },
  });
}

Screens.clients = {
  template: `
    <h2>Visão Clientes</h2>

    <div class="filter-bar" style="margin-bottom: 20px;">
      ${CLIENT_DAYS_OPTIONS.map(d => `<button class="filter-btn${d === 30 ? ' active' : ''}" data-days="${d}">${d}D</button>`).join('')}
    </div>

    <div class="cards" style="margin-bottom: 24px;">
      <div class="card">
        <i class="bi bi-building card-icon"></i>
        <span class="card-label">Clientes atendidos</span>
        <span class="card-value" id="clients-total">-</span>
      </div>
      <div class="card">
        <i class="bi bi-chat-dots card-icon"></i>
        <span class="card-label">Total de conversas</span>
        <span class="card-value" id="clients-total-convs">-</span>
      </div>
      <div class="card">
        <i class="bi bi-person-plus card-icon"></i>
        <span class="card-label">Novos clientes</span>
        <span class="card-value" id="clients-new">-</span>
      </div>
      <div class="card">
        <i class="bi bi-people card-icon"></i>
        <span class="card-label">Clientes recorrentes</span>
        <span class="card-value" id="clients-returning">-</span>
      </div>
    </div>

    <div class="grid-4-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Clientes mais recorrentes</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-clients-volume" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Demanda mais tempo</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-clients-time" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>SLA Perdido</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-clients-breach" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Canais Usados</h3>
        <div class="canvas-container" style="flex: 1; min-height: 200px; position: relative;">
          <canvas id="chart-client-channels"></canvas>
        </div>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Assuntos mais recorrentes</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-subjects-volume" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Assuntos que demandam mais tempo</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-subjects-time" class="sla-list"></div>
        </div>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Tempo por departamento (todos os clientes)</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-dept-time" class="sla-list"></div>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Demanda avulsa / cobrança extra</h3>
        <div class="table-responsive" style="flex: 1; max-height: 250px;">
          <div id="list-demanda-avulsa" class="sla-list"></div>
        </div>
      </div>
    </div>

    <div class="grid-2-cols">
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Por regime tributário</h3>
        <div class="canvas-container" style="flex: 1; min-height: 220px; position: relative;">
          <canvas id="chart-regime"></canvas>
        </div>
      </div>
      
      <div class="panel" style="display: flex; flex-direction: column;">
        <h3>Por status do contrato</h3>
        <div class="canvas-container" style="flex: 1; min-height: 220px; position: relative;">
          <canvas id="chart-status-contrato"></canvas>
        </div>
      </div>
    </div>

    <div id="client-detail-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 950px;">
        <button class="modal-close" onclick="closeClientDetailModal()">&times;</button>
        <h3 id="client-detail-title" style="margin-bottom: 4px;"></h3>
        <p class="muted-text" id="client-detail-meta" style="margin-top:0; font-size: 0.9em;"></p>

        <div class="cards" style="margin-bottom: 20px;">
          <div class="card" style="flex-direction: row; justify-content: flex-start; gap: 16px; padding: 14px 20px; min-width: 200px; flex: none;">
            <i class="bi bi-chat-left-text" style="font-size: 2rem; color: var(--accent);"></i>
            <div style="text-align: left;">
              <span class="card-label" style="margin-bottom: 2px;">Conversas no período</span>
              <span class="card-value" id="client-detail-total" style="font-size: 1.6rem;">-</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; justify-content: center;">
             <span class="card-label" style="margin-bottom: 6px;">Canais Utilizados</span>
             <div id="client-detail-channels" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px;">
          <div style="display: flex; flex-direction: column;">
            <h3>Assuntos</h3>
            <div class="table-responsive" style="flex: 1; max-height: 250px;">
              <table id="client-detail-subject-table">
                <thead><tr><th>Assunto</th><th>Total</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; flex-direction: column;">
            <h3>Tempo por departamento</h3>
            <div class="table-responsive" style="flex: 1; max-height: 250px;">
              <table id="client-detail-team-table">
                <thead><tr><th>Departamento</th><th>Total</th><th style="white-space: nowrap;">Tempo médio</th><th style="white-space: nowrap;">Tempo total</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <h3>Conversas</h3>
        <div class="table-responsive" style="max-height: 350px;">
          <table id="client-detail-conv-table">
            <thead><tr><th>Código</th><th>Assunto</th><th>Criação</th><th>SLA</th><th></th></tr></thead>
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

    let selectedDays = 30;

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDays = Number(btn.dataset.days);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderClientsData(selectedDays);
      });
    });

    await renderClientsData(selectedDays);
  },
};
