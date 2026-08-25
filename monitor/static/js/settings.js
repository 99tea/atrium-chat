async function saveSettings() {
  await fetch('/monitor/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      chatwoot_base_url: document.getElementById('chatwoot-base-url').value,
      cancellation_label: document.getElementById('cancellation-label').value || 'cancelado'
    })
  });
  showToast('Configurações salvas', 'success');
}

async function loadChannels() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  const tbody = document.querySelector('#channels-table tbody');
  tbody.innerHTML = channels.map(c => `
    <tr data-channel-key="${c.channel_key}" data-is-default="${c.is_default}" class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-4 py-2.5">
        <input type="text" class="channel-name w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="${c.channel_name}">
      </td>
      <td class="px-4 py-2.5">
        <input type="text" class="channel-inbox-ids w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="${c.inbox_ids.join(', ')}" placeholder="Ex: 1, 2">
      </td>
      <td class="px-4 py-2.5 text-right w-[60px]">
        ${c.is_default ? '' : `
        <button type="button" class="channel-remove-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-tooltip="Remover">
          <i class="bi bi-trash pointer-events-none"></i>
        </button>`}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.channel-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      await fetch(`/monitor/api/channels/${tr.dataset.channelKey}`, { method: 'DELETE' });
      tr.remove();
    });
  });
}

function addChannelRow() {
  const tbody = document.querySelector('#channels-table tbody');
  const tr = document.createElement('tr');
  tr.className = "border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors";
  tr.dataset.channelKey = 'custom_' + Date.now();
  tr.dataset.isDefault = 'false';
  tr.innerHTML = `
    <td class="px-4 py-2.5">
      <input type="text" class="channel-name w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="" placeholder="Nome do canal">
    </td>
    <td class="px-4 py-2.5">
      <input type="text" class="channel-inbox-ids w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="" placeholder="Ex: 4, 7">
    </td>
    <td class="px-4 py-2.5 text-right w-[60px]">
      <button type="button" class="channel-remove-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-tooltip="Remover">
        <i class="bi bi-trash pointer-events-none"></i>
      </button>
    </td>
  `;
  tr.querySelector('.channel-remove-btn').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

async function saveChannels() {
  const payload = [...document.querySelectorAll('#channels-table tbody tr')].map(tr => ({
    channel_key: tr.dataset.channelKey,
    channel_name: tr.querySelector('.channel-name').value.trim(),
    inbox_ids: tr.querySelector('.channel-inbox-ids').value.split(',').map(s => s.trim()).filter(s => s).map(Number),
  })).filter(c => c.channel_name);

  await fetch('/monitor/api/channels', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  await loadChannels();
  showToast('Canais salvos com sucesso', 'success');
}

const SETTINGS_WEEKDAY_LABELS = [
  { key: 0, label: 'Dom' }, { key: 1, label: 'Seg' }, { key: 2, label: 'Ter' },
  { key: 3, label: 'Qua' }, { key: 4, label: 'Qui' }, { key: 5, label: 'Sex' }, { key: 6, label: 'Sáb' },
];

async function loadBusinessHours() {
  const cfg = await (await fetch('/monitor/api/business-hours')).json();
  document.getElementById('bh-enabled').checked = cfg.enabled;
  document.getElementById('bh-start').value = cfg.hour_start;
  document.getElementById('bh-end').value = cfg.hour_end;
  document.querySelectorAll('.bh-day').forEach(cb => {
    cb.checked = cfg.business_days.includes(Number(cb.dataset.day));
  });
  toggleBusinessHoursFields();
}

function toggleBusinessHoursFields() {
  const enabled = document.getElementById('bh-enabled').checked;
  const fields = document.getElementById('bh-fields');
  if(enabled) { fields.classList.remove('opacity-40', 'pointer-events-none'); fields.classList.add('opacity-100'); }
  else { fields.classList.add('opacity-40', 'pointer-events-none'); fields.classList.remove('opacity-100'); }
}

async function saveBusinessHours() {
  const business_days = [...document.querySelectorAll('.bh-day:checked')].map(cb => Number(cb.dataset.day));
  await fetch('/monitor/api/business-hours', {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      enabled: document.getElementById('bh-enabled').checked,
      business_days, hour_start: document.getElementById('bh-start').value, hour_end: document.getElementById('bh-end').value,
    })
  });
  showToast('Horário comercial salvo', 'success');
}

const SLA_PRIORITIES = [
  { key: 'low', label: 'Baixa' }, { key: 'medium', label: 'Média' },
  { key: 'high', label: 'Alta' }, { key: 'urgent', label: 'Urgente' },
];

async function loadSlaPriorityTargets() {
  const rows = await (await fetch('/monitor/api/sla-priority-targets')).json();
  const byPriority = Object.fromEntries(rows.map(r => [r.priority, r]));

  document.querySelector('#sla-priority-table tbody').innerHTML = SLA_PRIORITIES.map(p => {
    const existing = byPriority[p.key];
    const frt = existing ? existing.first_response_minutes : 0;
    const res = existing ? (existing.resolution_minutes / 60).toFixed(1) : '0.0';
    return `
      <tr data-priority="${p.key}" class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
        <td class="px-4 py-2.5 font-medium text-[0.85rem] flex items-center gap-2 text-text">
          <i class="bi bi-circle-fill text-[0.4rem] text-muted"></i> ${p.label}
        </td>
        <td class="px-4 py-2.5">
          <input type="number" class="sla-frt w-full max-w-[100px] px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent text-right shadow-inner" value="${frt}" min="0">
        </td>
        <td class="px-4 py-2.5">
          <input type="number" step="0.5" class="sla-res w-full max-w-[100px] px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent text-right shadow-inner" value="${res}" min="0">
        </td>
      </tr>
    `;
  }).join('');
}

async function saveSlaPriorityTargets() {
  const payload = [...document.querySelectorAll('#sla-priority-table tbody tr')].map(tr => ({
    priority: tr.dataset.priority,
    first_response_minutes: Number(tr.querySelector('.sla-frt').value),
    resolution_minutes: Math.round(Number(tr.querySelector('.sla-res').value) * 60),
  }));
  await fetch('/monitor/api/sla-priority-targets', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });

  await fetch('/monitor/api/settings', {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ sla_target_percent: document.getElementById('sla-target-percent').value })
  });
  showToast('SLA salvo com sucesso', 'success');
}

function teamRow(teamId, teamName) {
  const tr = document.createElement('tr');
  tr.className = "border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors";
  tr.dataset.teamId = teamId || '';
  tr.dataset.originalId = teamId || '';
  tr.innerHTML = `
    <td class="px-4 py-2.5 w-[120px]">
      <input type="number" class="team-id w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="${teamId !== undefined && teamId !== null ? teamId : ''}" placeholder="ID" min="1">
    </td>
    <td class="px-4 py-2.5 w-full">
      <input type="text" class="team-name w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="${teamName || ''}" placeholder="Nome do departamento...">
    </td>
    <td class="px-4 py-2.5 text-right w-[60px]">
      <button type="button" class="team-remove-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-tooltip="Remover">
        <i class="bi bi-trash pointer-events-none"></i>
      </button>
    </td>
  `;
  tr.querySelector('.team-remove-btn').addEventListener('click', async () => {
    const originalId = tr.dataset.originalId;
    if (originalId) await fetch(`/monitor/api/teams/${originalId}`, { method: 'DELETE' });
    tr.remove();
  });
  return tr;
}

async function loadTeams() {
  const teams = await (await fetch('/monitor/api/teams')).json();
  const tbody = document.querySelector('#teams-table tbody');
  tbody.innerHTML = '';
  teams.forEach(t => tbody.appendChild(teamRow(t.team_id, t.team_name)));
}

function addTeamRow() { document.querySelector('#teams-table tbody').appendChild(teamRow('', '')); }

async function saveTeams() {
  const payload = [...document.querySelectorAll('#teams-table tbody tr')]
    .map(tr => ({ team_id: Number(tr.querySelector('.team-id').value), team_name: tr.querySelector('.team-name').value.trim() }))
    .filter(t => t.team_id && t.team_name);

  await fetch('/monitor/api/teams', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  await loadTeams();
  await loadGlobalConfig();
  showToast('Times salvos com sucesso', 'success');
}

function renderLabelColorsTable(colors) {
  document.querySelector('#label-colors-table tbody').innerHTML = Object.entries(colors).map(([label, color]) => `
    <tr data-label="${label}" class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
      <td class="px-4 py-2.5 w-[50%]">
        <input type="text" class="label-name w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="${label}">
      </td>
      <td class="px-4 py-2.5 w-[50%]">
        <div class="flex items-center gap-3">
          <input type="color" class="label-color w-10 h-8 rounded-md border border-border cursor-pointer bg-transparent p-1" value="${color}">
          <span class="text-[0.75rem] font-mono bg-bg px-2.5 py-1 rounded border border-border text-muted uppercase shadow-inner">${color}</span>
        </div>
      </td>
      <td class="px-4 py-2.5 text-right w-[60px]">
        <button type="button" class="label-remove-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-tooltip="Remover">
          <i class="bi bi-trash pointer-events-none"></i>
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.label-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const label = tr.dataset.label;
      if (label) await fetch(`/monitor/api/label-colors/${encodeURIComponent(label)}`, { method: 'DELETE' });
      tr.remove();
    });
  });
}

async function loadLabelColors() {
  const colors = await (await fetch('/monitor/api/label-colors')).json();
  renderLabelColorsTable(colors);
}

function addLabelColorRow() {
  const tbody = document.querySelector('#label-colors-table tbody');
  const tr = document.createElement('tr');
  tr.className = "border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors";
  tr.dataset.label = '';
  tr.innerHTML = `
    <td class="px-4 py-2.5 w-[50%]">
      <input type="text" class="label-name w-full px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent shadow-inner" value="" placeholder="nome-da-etiqueta">
    </td>
    <td class="px-4 py-2.5 w-[50%]">
      <div class="flex items-center gap-3">
        <input type="color" class="label-color w-10 h-8 rounded-md border border-border cursor-pointer bg-transparent p-1" value="#9296b8">
      </div>
    </td>
    <td class="px-4 py-2.5 text-right w-[60px]">
      <button type="button" class="label-remove-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-tooltip="Remover">
        <i class="bi bi-trash pointer-events-none"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('.label-remove-btn').addEventListener('click', () => tr.remove());
}

async function saveLabelColors() {
  const payload = {};
  document.querySelectorAll('#label-colors-table tbody tr').forEach(tr => {
    const label = tr.querySelector('.label-name').value.trim();
    const color = tr.querySelector('.label-color').value;
    if (label) payload[label] = color;
  });
  await fetch('/monitor/api/label-colors', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  await loadGlobalConfig();
  showToast('Cores de etiquetas salvas', 'success');
}

const BUG_STATUS_MAP = {
  novo: { label: 'Novo', badge: 'badge-blue' },
  andamento: { label: 'Andamento', badge: 'badge-yellow' },
  finalizado: { label: 'Finalizado', badge: 'badge-green' },
};

let bugStatusFilter = '';

function bugStatusSelect(bug) {
  return `<select class="bug-status-select bg-bg border border-border rounded-md px-2.5 py-1 text-xs text-text focus:outline-none focus:border-accent cursor-pointer shadow-inner" data-bug-id="${bug.id}">
    ${Object.entries(BUG_STATUS_MAP).map(([key, info]) => `<option value="${key}" ${bug.status === key ? 'selected' : ''}>${info.label}</option>`).join('')}
  </select>`;
}

async function loadBugReports() {
  const params = bugStatusFilter ? `?status=${bugStatusFilter}` : '';
  const bugs = await fetch(`/monitor/api/bugs${params}`).then(r => r.ok ? r.json() : []).catch(() => []);

  const tbody = document.querySelector('#bug-reports-table tbody');
  if (bugs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="py-12 text-center flex flex-col items-center"><i class="bi bi-emoji-smile text-3xl text-accent-green mb-2"></i><span class="text-sm text-muted">Nenhum report por aqui</span></div></td></tr>';
    return;
  }

  tbody.innerHTML = bugs.map(b => {
    const d = new Date(b.created_at);
    const dateStr = `${d.toLocaleDateString('pt-BR')} <span class="opacity-60 ml-1">${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>`;
    return `
      <tr data-bug-id="${b.id}" class="border-b border-border/50 last:border-0 hover:bg-panel-light transition-colors">
        <td class="px-4 py-3 text-[0.8rem] whitespace-nowrap text-text">${dateStr}</td>
        <td class="px-4 py-3 text-[0.8rem] font-medium truncate" title="${b.user_name}">
          <div class="flex items-center gap-2 text-text">
            <div class="w-6 h-6 rounded-full bg-bg border border-border flex items-center justify-center text-[0.7rem]"><i class="bi bi-person"></i></div>
            <span class="truncate">${b.user_name}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-[0.8rem] truncate text-muted">${b.route || '-'}</td>
        <td class="px-4 py-3 text-[0.85rem] truncate text-text" title="${b.description}">${b.description}</td>
        <td class="px-4 py-3 whitespace-nowrap">${bugStatusSelect(b)}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button class="bug-view-btn p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors mr-1" data-bug-id="${b.id}" data-tooltip="Ver detalhes">
            <i class="bi bi-eye pointer-events-none"></i>
          </button>
          <button class="bug-delete-btn p-1.5 text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md hover:bg-accent-red hover:text-white transition-colors" data-bug-id="${b.id}" data-tooltip="Excluir">
            <i class="bi bi-trash pointer-events-none"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  window.__bugReportsCache = bugs;

  tbody.querySelectorAll('.bug-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const bug = window.__bugReportsCache.find(b => b.id === Number(e.currentTarget.dataset.bugId));
      if (bug) openBugDetailModal(bug);
    });
  });

  tbody.querySelectorAll('.bug-status-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      await fetch(`/monitor/api/bugs/${e.target.dataset.bugId}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status: e.target.value }),
      });
      showToast('Status atualizado', 'success');
    });
  });

  tbody.querySelectorAll('.bug-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      await fetch(`/monitor/api/bugs/${e.currentTarget.dataset.bugId}`, { method: 'DELETE' });
      await loadBugReports();
      showToast('Report excluído', 'success');
    });
  });
}

function openBugDetailModal(bug) {
  const d = new Date(bug.created_at);
  const dateStr = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;

  document.getElementById('bug-detail-user').textContent = bug.user_name;
  document.getElementById('bug-detail-date').textContent = dateStr;
  document.getElementById('bug-detail-route').textContent = bug.route || '-';
  document.getElementById('bug-detail-description').textContent = bug.description;

  const wrap = document.getElementById('bug-detail-screenshot-wrap');
  const img = document.getElementById('bug-detail-screenshot');
  const clickArea = document.getElementById('bug-detail-screenshot-area');

  if (bug.screenshot) {
    img.src = bug.screenshot;
    clickArea.onclick = () => window.open(bug.screenshot, '_blank');
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }

  document.getElementById('bug-detail-modal').classList.remove('hidden');
}

function closeBugDetailModal() { document.getElementById('bug-detail-modal').classList.add('hidden'); }

Screens.settings = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <div class="flex items-center gap-4 pb-4 border-b border-border">
        <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent text-white shadow-sm glow-border"><i class="bi bi-gear"></i></div>
        <div>
          <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Configurações</h2>
          <p class="m-0 text-[0.9rem] text-muted">Ajustes globais do sistema e painéis</p>
        </div>
      </div>

      <!-- Sistema de Abas Polido -->
      <div class="flex gap-2 border-b border-border pb-3 overflow-x-auto no-scrollbar" id="settings-tabs">
        <button id="btn-tab-geral" class="settings-tab-btn active px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-accent bg-panel shadow-sm text-text glow-border" data-target="tab-geral"><i class="bi bi-sliders mr-2 text-accent"></i>Geral</button>
        <button id="btn-tab-canais" class="settings-tab-btn px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-transparent text-muted hover:bg-panel-light hover:text-text" data-target="tab-canais"><i class="bi bi-broadcast mr-2 text-accent-blue"></i>Canais</button>
        <button id="btn-tab-sla" class="settings-tab-btn px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-transparent text-muted hover:bg-panel-light hover:text-text" data-target="tab-sla"><i class="bi bi-shield-check mr-2 text-accent-green"></i>SLA</button>
        <button id="btn-tab-dept" class="settings-tab-btn px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-transparent text-muted hover:bg-panel-light hover:text-text" data-target="tab-dept"><i class="bi bi-diagram-3 mr-2 text-accent-yellow"></i>Departamentos</button>
        <button id="btn-tab-labels" class="settings-tab-btn px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-transparent text-muted hover:bg-panel-light hover:text-text" data-target="tab-labels"><i class="bi bi-palette mr-2 text-purple-400"></i>Etiquetas</button>
        <button id="btn-tab-bugs" class="settings-tab-btn px-4 py-2 text-sm font-semibold rounded-lg transition-colors border border-transparent text-muted hover:bg-panel-light hover:text-text" data-target="tab-bugs" id="tab-btn-bugs" style="display:none;"><i class="bi bi-bug mr-2 text-accent-red"></i>Feedbacks</button>
      </div>

      <!-- 1. GERAL -->
      <div id="tab-geral" class="settings-tab-pane flex flex-col gap-6">
        <div id="settings-panel-gerais" class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6 max-w-2xl">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-sliders text-accent-blue"></i> Configuração Geral</h3>
          </div>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <label for="chatwoot-base-url" class="text-xs text-muted font-bold uppercase tracking-wider">URL base</label>
              <input id="chatwoot-base-url" type="text" placeholder="https://chat.seusite.com.br" class="w-full px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.95rem] focus:outline-none focus:border-accent shadow-inner">
            </div>
          </div>
          <div class="pt-5 border-t border-border flex justify-end mt-6">
            <button onclick="saveSettings()" class="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold flex items-center gap-2 transition-colors shadow-md"><i class="bi bi-cloud-check"></i> Salvar Gerais</button>
          </div>
        </div>
      </div>

      <!-- 2. CANAIS -->
      <div id="tab-canais" class="settings-tab-pane hidden flex flex-col gap-6">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6 max-w-4xl">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-broadcast text-accent-blue"></i> Canais de Atendimento</h3>
          </div>
          <div class="overflow-x-auto border border-border rounded-lg mb-4 no-scrollbar max-h-[350px]">
            <table id="channels-table" class="w-full text-left table-fixed whitespace-nowrap">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[40%] bg-panel">Nome do Canal</th>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-full bg-panel">Inbox IDs (separados por vírgula)</th>
                  <th class="w-[60px] bg-panel"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="flex gap-3 pt-3 border-t border-border">
            <button type="button" onclick="addChannelRow()" class="px-4 py-2 rounded-lg bg-transparent text-text border border-dashed border-muted hover:border-text font-semibold flex items-center gap-2 transition-colors text-sm"><i class="bi bi-plus-lg"></i> Novo Canal</button>
            <button onclick="saveChannels()" class="px-5 py-2 rounded-lg bg-panel text-text border border-border hover:bg-panel-light font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm"><i class="bi bi-check2-circle"></i> Salvar Canais</button>
          </div>
        </div>
      </div>

      <!-- 3. SLA -->
      <div id="tab-sla" class="settings-tab-pane hidden flex flex-col gap-6">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6 flex flex-col max-w-4xl">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-shield-check text-accent-green"></i> SLA por Prioridade e Metas</h3>
          </div>
          <div class="flex flex-col gap-2 mb-5">
            <label for="sla-target-percent" class="text-xs text-muted font-bold uppercase tracking-wider">Meta Geral de Atingimento (%)</label>
            <div class="relative max-w-[160px]">
              <input id="sla-target-percent" type="number" min="0" max="100" class="w-full px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.95rem] font-bold focus:outline-none focus:border-accent shadow-inner">
              <i class="bi bi-percent absolute right-4 top-1/2 -translate-y-1/2 text-muted"></i>
            </div>
          </div>
          <div class="overflow-x-auto border border-border rounded-lg mb-5 max-w-2xl no-scrollbar">
            <table id="sla-priority-table" class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[40%] bg-panel">Prioridade</th>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[30%] bg-panel">1ª Resposta (min)</th>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[30%] bg-panel">Resolução (horas)</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="pt-4 border-t border-border mb-8">
            <button onclick="saveSlaPriorityTargets()" class="px-5 py-2.5 rounded-lg bg-panel border border-border text-text hover:bg-panel-light font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm"><i class="bi bi-check2-circle"></i> Salvar Tempos de SLA</button>
          </div>

          <div class="pt-6 border-t border-border">
            <div class="flex items-center gap-3 mb-4">
              <input type="checkbox" id="bh-enabled" onchange="toggleBusinessHoursFields()" class="w-4 h-4 cursor-pointer accent-accent">
              <label for="bh-enabled" class="font-semibold text-text cursor-pointer select-none text-sm">Contar SLA apenas em horário comercial</label>
            </div>
            <div id="bh-fields" class="transition-opacity duration-200">
              <div class="mb-4">
                <label class="block text-xs text-muted font-bold uppercase tracking-wider mb-2">Dias úteis</label>
                <div class="flex gap-3 flex-wrap">
                  ${SETTINGS_WEEKDAY_LABELS.map(d => `
                    <label class="flex items-center gap-1.5 cursor-pointer text-text text-xs bg-bg border border-border px-3 py-1.5 rounded-lg shadow-inner">
                      <input type="checkbox" class="bh-day w-3.5 h-3.5 cursor-pointer accent-accent" data-day="${d.key}">
                      ${d.label}
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xs mb-4">
                <div class="flex flex-col gap-1">
                  <label for="bh-start" class="text-[0.7rem] text-muted font-bold uppercase tracking-wider">Início</label>
                  <input id="bh-start" type="time" class="w-full px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm focus:outline-none focus:border-accent shadow-inner">
                </div>
                <div class="flex flex-col gap-1">
                  <label for="bh-end" class="text-[0.7rem] text-muted font-bold uppercase tracking-wider">Fim</label>
                  <input id="bh-end" type="time" class="w-full px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm focus:outline-none focus:border-accent shadow-inner">
                </div>
              </div>
            </div>
            <div class="pt-4 border-t border-border flex justify-end">
              <button onclick="saveBusinessHours()" class="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold flex items-center gap-2 transition-colors text-sm shadow-md"><i class="bi bi-cloud-check"></i> Salvar Horário Comercial</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. DEPARTAMENTOS -->
      <div id="tab-dept" class="settings-tab-pane hidden flex flex-col gap-6">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6 max-w-3xl flex flex-col">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-diagram-3 text-accent-yellow"></i> Departamentos / Times</h3>
          </div>
          <div class="overflow-y-auto max-h-[350px] border border-border rounded-lg mb-4 no-scrollbar">
            <table id="teams-table" class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[120px] bg-panel">ID Atrium Chat</th>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-full bg-panel">Nome no Monitor</th>
                  <th class="w-[60px] bg-panel"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="flex gap-3 pt-3 border-t border-border">
            <button type="button" onclick="addTeamRow()" class="px-4 py-2 rounded-lg bg-transparent text-text border border-dashed border-muted hover:border-text font-semibold flex items-center gap-2 transition-colors text-sm"><i class="bi bi-plus-lg"></i> Novo</button>
            <button onclick="saveTeams()" class="px-5 py-2 rounded-lg bg-panel text-text border border-border hover:bg-panel-light font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm"><i class="bi bi-check2-circle"></i> Salvar Times</button>
          </div>
        </div>
      </div>

      <!-- 5. ETIQUETAS (Movido o campo de cancelamento para cá) -->
      <div id="tab-labels" class="settings-tab-pane hidden flex flex-col gap-6 max-w-3xl">
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-slash-circle text-accent-red"></i> Etiqueta de Cancelamento</h3>
          </div>
          <div class="flex flex-col gap-2">
            <label for="cancellation-label" class="text-xs text-muted font-bold uppercase tracking-wider">Etiqueta que exclui conversas das métricas</label>
            <input id="cancellation-label" type="text" placeholder="cancelado" class="w-full px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.95rem] focus:outline-none focus:border-accent shadow-inner">
          </div>
          <div class="pt-4 border-t border-border flex justify-end mt-4">
            <button onclick="saveSettings()" class="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold flex items-center gap-2 transition-colors text-sm shadow-md"><i class="bi bi-cloud-check"></i> Salvar Etiqueta</button>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-6">
          <div class="mb-5 pb-3 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-palette text-accent"></i> Cores de Etiquetas</h3>
          </div>
          <div class="overflow-y-auto max-h-[350px] border border-border rounded-lg mb-4 no-scrollbar">
            <table id="label-colors-table" class="w-full text-left table-fixed">
              <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
                <tr>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[50%] bg-panel">Nome Exato da Etiqueta</th>
                  <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[50%] bg-panel">Cor Visual</th>
                  <th class="w-[60px] bg-panel"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="flex gap-3 pt-3 border-t border-border">
            <button type="button" onclick="addLabelColorRow()" class="px-4 py-2 rounded-lg bg-transparent text-text border border-dashed border-muted hover:border-text font-semibold flex items-center gap-2 transition-colors text-sm"><i class="bi bi-plus-lg"></i> Adicionar Regra</button>
            <button onclick="saveLabelColors()" class="px-5 py-2 rounded-lg bg-panel text-text border border-border hover:bg-panel-light font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm"><i class="bi bi-check2-circle"></i> Salvar Cores</button>
          </div>
        </div>
      </div>

      <!-- 6. FEEDBACKS -->
      <div id="tab-bugs" class="settings-tab-pane hidden panel-card bg-panel border border-border rounded-xl shadow-sm p-6">
        <div class="mb-5 pb-3 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 class="m-0 text-base font-semibold text-text flex items-center gap-2"><i class="bi bi-bug text-accent-red"></i> Gestão de Feedbacks</h3>
          <div id="bug-status-tabs" class="flex p-1 bg-bg border border-border rounded-lg gap-1 overflow-x-auto no-scrollbar">
            <button id="btn-bug-all" class="filter-btn active px-3.5 py-1.5 rounded-md text-[0.8rem] font-medium transition-colors border border-accent bg-panel text-text glow-border whitespace-nowrap shadow-sm" data-status="">Todos</button>
            <button id="btn-bug-novo" class="filter-btn px-3.5 py-1.5 rounded-md text-[0.8rem] font-medium transition-colors border border-transparent text-muted bg-transparent hover:text-text whitespace-nowrap" data-status="novo">Novo</button>
            <button id="btn-bug-andamento" class="filter-btn px-3.5 py-1.5 rounded-md text-[0.8rem] font-medium transition-colors border border-transparent text-muted bg-transparent hover:text-text whitespace-nowrap" data-status="andamento">Andamento</button>
            <button id="btn-bug-finalizado" class="filter-btn px-3.5 py-1.5 rounded-md text-[0.8rem] font-medium transition-colors border border-transparent text-muted bg-transparent hover:text-text whitespace-nowrap" data-status="finalizado">Finalizado</button>
          </div>
        </div>
        <div class="overflow-x-auto overflow-y-auto max-h-[500px] border border-border rounded-lg no-scrollbar">
          <table id="bug-reports-table" class="w-full text-left table-fixed min-w-[700px]">
            <thead class="sticky top-0 bg-panel shadow-[0_1px_0_var(--border)] z-10">
              <tr>
                <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[16%] bg-panel">Data</th>
                <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[16%] bg-panel">Usuário</th>
                <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[12%] bg-panel">Tela</th>
                <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[34%] bg-panel">Descrição</th>
                <th class="px-4 py-3 text-[0.75rem] font-bold text-muted w-[14%] bg-panel">Status</th>
                <th class="w-[80px] bg-panel"></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Bug Detail Modal -->
    <div id="bug-detail-modal" class="hidden fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-5">
      <div class="panel-card bg-panel border border-border rounded-2xl w-full max-w-2xl flex flex-col relative shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        <div class="p-6 border-b border-border bg-panel-light/50 flex justify-between items-center">
          <h3 class="m-0 text-lg font-bold flex items-center gap-3 text-text">
            <div class="w-8 h-8 rounded-lg bg-accent-red/10 text-accent-red flex items-center justify-center"><i class="bi bi-bug-fill"></i></div>
            Detalhes do Report
          </h3>
          <button class="bg-transparent border-none text-muted hover:text-text text-2xl cursor-pointer transition-colors" onclick="closeBugDetailModal()">&times;</button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[75vh] no-scrollbar">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-bg border border-border rounded-xl shadow-inner">
            <div class="flex flex-col gap-1">
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider flex items-center gap-1.5"><i class="bi bi-person"></i> Reportado por</span>
              <div id="bug-detail-user" class="font-medium text-text text-sm truncate"></div>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider flex items-center gap-1.5"><i class="bi bi-clock"></i> Data e Hora</span>
              <div id="bug-detail-date" class="font-medium text-text text-sm"></div>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[0.7rem] text-muted font-bold uppercase tracking-wider flex items-center gap-1.5"><i class="bi bi-signpost-2"></i> Rota / Tela</span>
              <div id="bug-detail-route" class="font-medium text-text text-sm truncate"></div>
            </div>
          </div>
          <div class="mb-6">
            <span class="block text-[0.75rem] text-muted font-bold uppercase tracking-wider mb-2">Descrição do Problema</span>
            <div id="bug-detail-description" class="bg-bg border border-border rounded-xl p-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-text shadow-inner"></div>
          </div>
          <div id="bug-detail-screenshot-wrap" class="hidden">
            <span class="block text-[0.75rem] text-muted font-bold uppercase tracking-wider mb-2"><i class="bi bi-image"></i> Captura de Tela</span>
            <div id="bug-detail-screenshot-area" class="relative w-full max-w-[280px] h-[160px] rounded-xl overflow-hidden border border-border cursor-zoom-in group shadow-sm">
              <img id="bug-detail-screenshot" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 block">
              <div class="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none">
                <i class="bi bi-arrows-fullscreen text-2xl"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    const oldBugModal = document.querySelector('body > #bug-detail-modal');
    if (oldBugModal) oldBugModal.remove();

    const bugDetailModal = document.getElementById('bug-detail-modal');
    if (bugDetailModal) {
      document.body.appendChild(bugDetailModal);
      bugDetailModal.addEventListener('click', function (e) {
        if (e.target === this) closeBugDetailModal();
      });
    }

    // Configuração das Abas com remoção correta da borda dos botões anteriores
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const tabPanes = document.querySelectorAll('.settings-tab-pane');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => {
          b.classList.remove('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
          b.classList.add('text-muted', 'border-transparent', 'bg-transparent');
        });
        btn.classList.add('active', 'bg-panel', 'shadow-sm', 'text-text', 'border-accent', 'glow-border');
        btn.classList.remove('text-muted', 'border-transparent', 'bg-transparent');

        const targetId = btn.dataset.target;
        tabPanes.forEach(pane => {
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

    const isAdmin = currentUser.role === 'administrator';
    const isDeveloper = !!currentUser.is_developer;

    const tabGeral = document.querySelector('[data-target="tab-geral"]');
    const tabCanais = document.querySelector('[data-target="tab-canais"]');
    const tabBugsBtn = document.getElementById('tab-btn-bugs');

    if (tabGeral) tabGeral.style.display = isAdmin ? '' : 'none';
    if (tabCanais) tabCanais.style.display = isAdmin ? '' : 'none';
    if (tabBugsBtn) tabBugsBtn.style.display = isDeveloper ? '' : 'none';

    const settings = await (await fetch('/monitor/api/settings')).json();
    document.getElementById('sla-target-percent').value = settings.sla_target_percent || 95;
    await loadSlaPriorityTargets();
    await loadTeams();
    await loadLabelColors();

    if (isAdmin) {
      document.getElementById('chatwoot-base-url').value = settings.chatwoot_base_url || '';
      document.getElementById('cancellation-label').value = settings.cancellation_label || 'cancelado';
      await loadChannels();
      await loadBusinessHours();
    }

    if (isDeveloper) {
      bugStatusFilter = '';
      
      const initialBugBtn = document.getElementById('btn-bug-all');
      if(initialBugBtn) window.handleDateFilterClick('bug-status-tabs', initialBugBtn.id, null);

      document.querySelectorAll('#bug-status-tabs .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          window.handleDateFilterClick('bug-status-tabs', btn.id, null);
          bugStatusFilter = btn.dataset.status;
          loadBugReports();
        });
      });

      await loadBugReports();
    }
  },
};
