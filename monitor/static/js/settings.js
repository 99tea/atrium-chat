async function saveSettings() {
  await fetch('/monitor/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      chatwoot_base_url: document.getElementById('chatwoot-base-url').value,
      whatsapp_inbox_ids: document.getElementById('whatsapp-inbox-ids').value,
      email_inbox_ids: document.getElementById('email-inbox-ids').value,
      cancellation_label: document.getElementById('cancellation-label').value
    })
  });
  showToast('Configurações salvas');
}

const SETTINGS_PRIORITY_ORDER = ['none', 'low', 'medium', 'urgent'];

async function loadSlaPriorityTargets() {
  const rows = await (await fetch('/monitor/api/sla-priority-targets')).json();
  const prioMap = { 'urgent': 'Urgente', 'high': 'Alta', 'medium': 'Média', 'low': 'Baixa', 'none': 'Nenhuma' };

  const ordered = SETTINGS_PRIORITY_ORDER.map(p => rows.find(r => r.priority === p)).filter(Boolean);

  document.querySelector('#sla-priority-table tbody').innerHTML = ordered.map(r => `
    <tr data-priority="${r.priority}">
      <td style="font-weight: 500;">${prioMap[r.priority] || r.priority}</td>
      <td><input type="number" class="sla-frt" value="${r.first_response_minutes}" style="width: 100px; margin: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"></td>
      <td><input type="number" step="0.5" class="sla-res" value="${(r.resolution_minutes / 60).toFixed(1)}" style="width: 100px; margin: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"></td>
    </tr>
  `).join('');
}

async function saveSlaPriorityTargets() {
  const payload = [...document.querySelectorAll('#sla-priority-table tbody tr')].map(tr => ({
    priority: tr.dataset.priority,
    first_response_minutes: Number(tr.querySelector('.sla-frt').value),
    resolution_minutes: Math.round(Number(tr.querySelector('.sla-res').value) * 60),
  }));
  await fetch('/monitor/api/sla-priority-targets', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });

  await fetch('/monitor/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      sla_target_percent: document.getElementById('sla-target-percent').value,
    })
  });

  showToast('SLA salvo');
}

async function loadTeams() {
  const teams = await (await fetch('/monitor/api/teams')).json();
  document.querySelector('#teams-table tbody').innerHTML = teams.map(t => `
    <tr data-team-id="${t.team_id}">
      <td style="font-weight: 500; width: 60px;">${t.team_id}</td>
      <td><input type="text" class="team-name" value="${t.team_name}" style="width: 100%; margin: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"></td>
    </tr>
  `).join('');
}

async function saveTeams() {
  const payload = [...document.querySelectorAll('#teams-table tbody tr')].map(tr => ({
    team_id: Number(tr.dataset.teamId),
    team_name: tr.querySelector('.team-name').value,
  }));
  await fetch('/monitor/api/teams', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  await loadGlobalConfig();
  showToast('Times salvos');
}

function renderLabelColorsTable(colors) {
  document.querySelector('#label-colors-table tbody').innerHTML = Object.entries(colors).map(([label, color]) => `
    <tr data-label="${label}">
      <td><input type="text" class="label-name" value="${label}" style="width: 100%; margin: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="color" class="label-color" value="${color}" style="width: 36px; height: 36px; border: none; border-radius: 6px; cursor: pointer; padding: 0; background: transparent;">
          <span class="muted-text" style="font-size: 0.85rem; font-family: monospace;">${color}</span>
        </div>
      </td>
      <td style="text-align: right;">
        <button type="button" class="label-remove-btn topbar-btn" data-tooltip="Remover" style="padding: 6px; color: var(--accent-red);">
          <i class="bi bi-trash"></i>
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
  tr.dataset.label = '';
  tr.innerHTML = `
    <td><input type="text" class="label-name" value="" placeholder="nome-da-etiqueta" style="width: 100%; margin: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"></td>
    <td>
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="color" class="label-color" value="#9296b8" style="width: 36px; height: 36px; border: none; border-radius: 6px; cursor: pointer; padding: 0; background: transparent;">
      </div>
    </td>
    <td style="text-align: right;">
      <button type="button" class="label-remove-btn topbar-btn" data-tooltip="Remover" style="padding: 6px; color: var(--accent-red);">
        <i class="bi bi-trash"></i>
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
  await fetch('/monitor/api/label-colors', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  await loadGlobalConfig();
  showToast('Cores de etiquetas salvas');
}

const BUG_STATUS_MAP = {
  novo: { label: 'Novo', badge: 'badge-blue' },
  andamento: { label: 'Andamento', badge: 'badge-yellow' },
  finalizado: { label: 'Finalizado', badge: 'badge-green' },
};

let bugStatusFilter = '';

function bugStatusSelect(bug) {
  return `<select class="bug-status-select" data-bug-id="${bug.id}" style="width: auto; margin: 0; padding: 4px 8px; font-size: 0.85em; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer;">
    ${Object.entries(BUG_STATUS_MAP).map(([key, info]) => `<option value="${key}" ${bug.status === key ? 'selected' : ''}>${info.label}</option>`).join('')}
  </select>`;
}

async function loadBugReports() {
  const params = bugStatusFilter ? `?status=${bugStatusFilter}` : '';
  const bugs = await fetch(`/monitor/api/bugs${params}`).then(r => r.ok ? r.json() : []).catch(() => []);

  const tbody = document.querySelector('#bug-reports-table tbody');
  if (bugs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state" style="padding: 24px;"><i class="bi bi-emoji-smile" style="font-size: 1.8rem; margin-bottom: 8px;"></i><span>Nenhum report por aqui</span></div></td></tr>';
    return;
  }

  tbody.innerHTML = bugs.map(b => {
    const d = new Date(b.created_at);
    const dateStr = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;
    return `
      <tr data-bug-id="${b.id}">
        <td class="muted-text" style="white-space: nowrap; font-size: 0.85em;">${dateStr}</td>
        <td style="white-space: nowrap; font-weight: 500;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.7rem;"><i class="bi bi-person"></i></div>
            ${b.user_name}
          </div>
        </td>
        <td class="muted-text" style="white-space: nowrap;">${b.route || '-'}</td>
        <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${b.description}</td>
        <td style="white-space: nowrap;">${bugStatusSelect(b)}</td>
        <td style="white-space: nowrap; text-align: right;">
          <button class="topbar-btn bug-view-btn" data-bug-id="${b.id}" data-tooltip="Ver detalhes" style="padding: 4px 8px; margin-right: 4px;">
            <i class="bi bi-eye" style="pointer-events: none;"></i>
          </button>
          <button class="topbar-btn bug-delete-btn" data-bug-id="${b.id}" data-tooltip="Excluir" style="padding: 4px 8px; color: var(--accent-red);">
            <i class="bi bi-trash" style="pointer-events: none;"></i>
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
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: e.target.value }),
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
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }

  document.getElementById('bug-detail-modal').classList.remove('hidden');
}

function closeBugDetailModal() {
  document.getElementById('bug-detail-modal').classList.add('hidden');
}

Screens.settings = {
  template: `
    <div class="panel" id="settings-panel-gerais" style="margin-bottom: 24px;">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
        <h3 style="margin: 0;"><i class="bi bi-sliders"></i> Gerais</h3>
      </div>

      <div class="grid-2-cols" style="gap: 16px; margin-bottom: 16px;">
        <div class="form-group" style="margin: 0;">
          <label for="whatsapp-inbox-ids" style="color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; display: block;">Inbox IDs WhatsApp (separados por vírgula)</label>
          <input id="whatsapp-inbox-ids" type="text" placeholder="1" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
        </div>

        <div class="form-group" style="margin: 0;">
          <label for="email-inbox-ids" style="color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; display: block;">Inbox IDs E-mail (separados por vírgula)</label>
          <input id="email-inbox-ids" type="text" placeholder="3,5" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label for="chatwoot-base-url" style="color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; display: block;">URL base do Chatwoot</label>
        <input id="chatwoot-base-url" type="text" placeholder="https://chat.australisdev.online" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
      </div>

      <div class="form-group" style="margin-bottom: 20px;">
        <label for="cancellation-label" style="color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; display: block;">Etiqueta de cancelamento (exclui das métricas de desempenho)</label>
        <input id="cancellation-label" type="text" placeholder="cancelado" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
      </div>

      <button onclick="saveSettings()" style="padding: 8px 16px; border-radius: 6px; background: var(--accent); color: #fff; border: none; cursor: pointer; font-weight: 500;"><i class="bi bi-check2"></i> Salvar Gerais</button>
    </div>

    <div class="grid-2-cols" style="gap: 24px; margin-bottom: 24px;">
      <!-- SLA Targets -->
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
          <h3 style="margin: 0;"><i class="bi bi-shield-check"></i> SLA por prioridade</h3>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label for="sla-target-percent" style="color: var(--muted); font-size: 0.85rem; margin-bottom: 6px; display: block;">Meta Geral de SLA Atingido (%)</label>
          <div style="position: relative; max-width: 150px;">
            <input id="sla-target-percent" type="number" min="0" max="100" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
            <i class="bi bi-percent" style="position: absolute; right: 12px; top: 12px; color: var(--muted);"></i>
          </div>
        </div>

        <div class="table-responsive" style="flex: 1; margin-bottom: 16px;">
          <table id="sla-priority-table">
            <thead>
              <tr>
                <th>Prioridade</th>
                <th>1ª Resposta (min)</th>
                <th>Resolução (horas)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <button onclick="saveSlaPriorityTargets()" style="padding: 8px 16px; border-radius: 6px; background: var(--bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 500; align-self: flex-start;"><i class="bi bi-check2"></i> Salvar SLA</button>
      </div>

      <!-- Teams -->
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
          <h3 style="margin: 0;"><i class="bi bi-diagram-3"></i> Times / Departamentos</h3>
        </div>

        <div class="table-responsive" style="flex: 1; margin-bottom: 16px;">
          <table id="teams-table">
            <thead>
              <tr>
                <th>ID</th>
                <th style="width: 100%;">Nome do Time</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <button onclick="saveTeams()" style="padding: 8px 16px; border-radius: 6px; background: var(--bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 500; align-self: flex-start;"><i class="bi bi-check2"></i> Salvar Times</button>
      </div>
    </div>

    <!-- Label Colors -->
    <div class="panel" id="settings-panel-labels" style="margin-bottom: 24px;">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
        <h3 style="margin: 0;"><i class="bi bi-tags"></i> Cores de Etiquetas</h3>
      </div>

      <div class="table-responsive" style="margin-bottom: 16px; max-height: 350px;">
        <table id="label-colors-table">
          <thead>
            <tr>
              <th style="width: 100%;">Nome da Etiqueta</th>
              <th>Cor Visual</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div style="display: flex; gap: 12px;">
        <button type="button" onclick="addLabelColorRow()" style="padding: 8px 16px; border-radius: 6px; background: var(--bg); color: var(--text); border: 1px dashed var(--muted); cursor: pointer; font-weight: 500;"><i class="bi bi-plus-lg"></i> Adicionar Etiqueta</button>
        <button onclick="saveLabelColors()" style="padding: 8px 16px; border-radius: 6px; background: var(--accent); color: #fff; border: none; cursor: pointer; font-weight: 500;"><i class="bi bi-check2"></i> Salvar Cores</button>
      </div>
    </div>

    <!-- Bug Reports -->
    <div class="panel" id="settings-panel-bugs">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0;"><i class="bi bi-bug"></i> Gestão de Feedbacks</h3>
        
        <div class="filter-bar" id="bug-status-tabs" style="margin: 0; background: var(--bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border);">
          <button class="filter-btn active" data-status="" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 4px;">Todos</button>
          <button class="filter-btn" data-status="novo" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 4px;">Novo</button>
          <button class="filter-btn" data-status="andamento" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 4px;">Andamento</button>
          <button class="filter-btn" data-status="finalizado" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 4px;">Finalizado</button>
        </div>
      </div>

      <div class="table-responsive" style="max-height: 450px;">
        <table id="bug-reports-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Usuário</th>
              <th>Tela</th>
              <th style="width: 100%;">Descrição</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

	<!-- Bug Detail Modal -->
    <div id="bug-detail-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 650px; border-radius: 12px; padding: 24px; background: var(--panel); border: 1px solid var(--border);">
        <button class="modal-close" onclick="closeBugDetailModal()" style="font-size: 1.5rem; color: var(--muted);">&times;</button>
        
        <h3 style="margin-top: 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(248, 113, 113, 0.1); color: var(--accent-red); display: flex; align-items: center; justify-content: center;">
            <i class="bi bi-bug-fill"></i>
          </div>
          Detalhes do Report
        </h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin: 20px 0; padding: 16px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border);">
          <div>
            <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="bi bi-person"></i> Reportado por</span>
            <div id="bug-detail-user" style="font-weight: 500; margin-top: 6px; color: var(--text);"></div>
          </div>
          <div>
            <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="bi bi-clock"></i> Data e Hora</span>
            <div id="bug-detail-date" style="font-weight: 500; margin-top: 6px; color: var(--text);"></div>
          </div>
          <div>
            <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;"><i class="bi bi-signpost-2"></i> Rota / Tela</span>
            <div id="bug-detail-route" style="font-weight: 500; margin-top: 6px; color: var(--text);"></div>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Descrição do Problema</span>
          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: var(--text);" id="bug-detail-description"></div>
        </div>

        <div id="bug-detail-screenshot-wrap" style="display:none;">
          <span class="muted-text" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;"><i class="bi bi-image"></i> Captura de Tela</span>
          <div id="bug-detail-screenshot-area" style="position: relative; width: 240px; height: 140px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); cursor: zoom-in;" onmouseover="this.querySelector('.img-overlay').style.opacity=1; this.querySelector('img').style.transform='scale(1.05)'" onmouseout="this.querySelector('.img-overlay').style.opacity=0; this.querySelector('img').style.transform='scale(1)'">
            <img id="bug-detail-screenshot" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; display: block;">
            <div class="img-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0; transition: opacity 0.2s ease; pointer-events: none;">
              <i class="bi bi-arrows-fullscreen" style="font-size: 1.5rem;"></i>
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

    const isDeveloper = !!currentUser.is_developer;

    const gerais = document.getElementById('settings-panel-gerais');
    const bugsPanel = document.getElementById('settings-panel-bugs');
    if (gerais) gerais.style.display = isDeveloper ? '' : 'none';
    if (bugsPanel) bugsPanel.style.display = isDeveloper ? '' : 'none';

    const settings = await (await fetch('/monitor/api/settings')).json();
    document.getElementById('sla-target-percent').value = settings.sla_target_percent || 95;
    await loadSlaPriorityTargets();
    await loadTeams();
    await loadLabelColors();

    if (isDeveloper) {
      document.getElementById('chatwoot-base-url').value = settings.chatwoot_base_url || '';
      document.getElementById('whatsapp-inbox-ids').value = settings.whatsapp_inbox_ids || '';
      document.getElementById('email-inbox-ids').value = settings.email_inbox_ids || '';
      document.getElementById('cancellation-label').value = settings.cancellation_label || 'cancelado';

      bugStatusFilter = '';
      document.querySelectorAll('#bug-status-tabs .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#bug-status-tabs .filter-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
          });
          btn.classList.add('active');
          btn.style.background = 'var(--panel)';
          bugStatusFilter = btn.dataset.status;
          loadBugReports();
        });
      });
      // Set default style for active tab
      document.querySelector('#bug-status-tabs .filter-btn.active').style.background = 'var(--panel)';
      
      await loadBugReports();
    }
  },
};
