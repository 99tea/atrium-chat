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
  showToast('Configurações salvas', 'success');
}

const SLA_PRIORITIES = [
  { key: 'none', label: 'Nenhuma' },
  { key: 'low', label: 'Baixa' },
  { key: 'medium', label: 'Média' },
  { key: 'high', label: 'Alta' },
  { key: 'urgent', label: 'Urgente' },
];

async function loadSlaPriorityTargets() {
  const rows = await (await fetch('/monitor/api/sla-priority-targets')).json();
  const byPriority = Object.fromEntries(rows.map(r => [r.priority, r]));

  document.querySelector('#sla-priority-table tbody').innerHTML = SLA_PRIORITIES.map(p => {
    const existing = byPriority[p.key];
    const frt = existing ? existing.first_response_minutes : 0;
    const res = existing ? (existing.resolution_minutes / 60).toFixed(1) : '0.0';
    return `
      <tr data-priority="${p.key}">
        <td style="font-weight: 500;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="bi bi-circle-fill" style="font-size: 0.4rem; color: var(--muted);"></i>
            ${p.label}
          </div>
        </td>
        <td>
          <input type="number" class="sla-frt" value="${frt}" min="0" style="width: 100%; max-width: 120px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
        </td>
        <td>
          <input type="number" step="0.5" class="sla-res" value="${res}" min="0" style="width: 100%; max-width: 120px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
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

  showToast('SLA salvo com sucesso', 'success');
}

function teamRow(teamId, teamName) {
  const tr = document.createElement('tr');
  tr.dataset.teamId = teamId || '';
  tr.dataset.originalId = teamId || '';
  tr.innerHTML = `
    <td style="width: 100px;">
      <input type="number" class="team-id" value="${teamId !== undefined && teamId !== null ? teamId : ''}" placeholder="ID" min="1" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
    </td>
    <td>
      <input type="text" class="team-name" value="${teamName || ''}" placeholder="Nome do departamento..." style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
    </td>
    <td style="text-align: right; width: 50px;">
      <button type="button" class="team-remove-btn topbar-btn" data-tooltip="Remover" style="padding: 6px; color: var(--accent-red); background: rgba(255, 92, 92, 0.1); border: 1px solid rgba(255, 92, 92, 0.2);">
        <i class="bi bi-trash" style="pointer-events: none;"></i>
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

function addTeamRow() {
  const tbody = document.querySelector('#teams-table tbody');
  tbody.appendChild(teamRow('', ''));
}

async function saveTeams() {
  const payload = [...document.querySelectorAll('#teams-table tbody tr')]
    .map(tr => ({
      team_id: Number(tr.querySelector('.team-id').value),
      team_name: tr.querySelector('.team-name').value.trim(),
    }))
    .filter(t => t.team_id && t.team_name);

  await fetch('/monitor/api/teams', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  await loadTeams();
  await loadGlobalConfig();
  showToast('Times salvos com sucesso', 'success');
}

function renderLabelColorsTable(colors) {
  document.querySelector('#label-colors-table tbody').innerHTML = Object.entries(colors).map(([label, color]) => `
    <tr data-label="${label}">
      <td style="width: 60%;">
        <input type="text" class="label-name" value="${label}" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="position: relative; width: 36px; height: 36px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0;">
            <input type="color" class="label-color" value="${color}" style="position: absolute; top: -10px; left: -10px; width: 60px; height: 60px; border: none; cursor: pointer; padding: 0; background: transparent;">
          </div>
          <span class="muted-text" style="font-size: 0.85rem; font-family: monospace; background: var(--bg); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);">${color.toUpperCase()}</span>
        </div>
      </td>
      <td style="text-align: right; width: 50px;">
        <button type="button" class="label-remove-btn topbar-btn" data-tooltip="Remover" style="padding: 6px; color: var(--accent-red); background: rgba(255, 92, 92, 0.1); border: 1px solid rgba(255, 92, 92, 0.2);">
          <i class="bi bi-trash" style="pointer-events: none;"></i>
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
    <td style="width: 60%;">
      <input type="text" class="label-name" value="" placeholder="nome-da-etiqueta" style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
    </td>
    <td>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="position: relative; width: 36px; height: 36px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0;">
          <input type="color" class="label-color" value="#9296b8" style="position: absolute; top: -10px; left: -10px; width: 60px; height: 60px; border: none; cursor: pointer; padding: 0; background: transparent;">
        </div>
      </div>
    </td>
    <td style="text-align: right; width: 50px;">
      <button type="button" class="label-remove-btn topbar-btn" data-tooltip="Remover" style="padding: 6px; color: var(--accent-red); background: rgba(255, 92, 92, 0.1); border: 1px solid rgba(255, 92, 92, 0.2);">
        <i class="bi bi-trash" style="pointer-events: none;"></i>
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
  showToast('Cores de etiquetas salvas', 'success');
}

const BUG_STATUS_MAP = {
  novo: { label: 'Novo', badge: 'badge-blue' },
  andamento: { label: 'Andamento', badge: 'badge-yellow' },
  finalizado: { label: 'Finalizado', badge: 'badge-green' },
};

let bugStatusFilter = '';

function bugStatusSelect(bug) {
  return `<select class="bug-status-select" data-bug-id="${bug.id}" style="width: auto; margin: 0; padding: 6px 10px; font-size: 0.8rem; font-weight: 500; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer;">
    ${Object.entries(BUG_STATUS_MAP).map(([key, info]) => `<option value="${key}" ${bug.status === key ? 'selected' : ''}>${info.label}</option>`).join('')}
  </select>`;
}

async function loadBugReports() {
  const params = bugStatusFilter ? `?status=${bugStatusFilter}` : '';
  const bugs = await fetch(`/monitor/api/bugs${params}`).then(r => r.ok ? r.json() : []).catch(() => []);

  const tbody = document.querySelector('#bug-reports-table tbody');
  if (bugs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state" style="padding: 32px;"><i class="bi bi-emoji-smile" style="font-size: 2rem; margin-bottom: 8px; color: var(--accent-green);"></i><span>Nenhum report por aqui</span></div></td></tr>';
    return;
  }

  tbody.innerHTML = bugs.map(b => {
    const d = new Date(b.created_at);
    const dateStr = `${d.toLocaleDateString('pt-BR')} <span style="opacity: 0.6; margin-left: 4px;">${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>`;
    return `
      <tr data-bug-id="${b.id}">
        <td style="white-space: nowrap; font-size: 0.8rem;">${dateStr}</td>
        <td style="white-space: nowrap; font-weight: 500; overflow: hidden; text-overflow: ellipsis;" title="${b.user_name}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--panel-light); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border: 1px solid var(--border);"><i class="bi bi-person"></i></div>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${b.user_name}</span>
          </div>
        </td>
        <td class="muted-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.8rem;">${b.route || '-'}</td>
        <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem;" title="${b.description}">${b.description}</td>
        <td style="white-space: nowrap;">${bugStatusSelect(b)}</td>
        <td style="white-space: nowrap; text-align: right;">
          <button class="topbar-btn bug-view-btn" data-bug-id="${b.id}" data-tooltip="Ver detalhes" style="padding: 6px; margin-right: 4px; background: rgba(255,255,255,0.05);">
            <i class="bi bi-eye" style="pointer-events: none;"></i>
          </button>
          <button class="topbar-btn bug-delete-btn" data-bug-id="${b.id}" data-tooltip="Excluir" style="padding: 6px; color: var(--accent-red); background: rgba(255, 92, 92, 0.1); border: 1px solid rgba(255, 92, 92, 0.2);">
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
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent);">
        <i class="bi bi-gear"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Configurações</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Ajustes globais do sistema e painéis</p>
      </div>
    </div>

    <!-- Ajustes Gerais -->
    <div class="panel" id="settings-panel-gerais" style="margin-bottom: 24px; border-radius: 12px; padding: 24px; min-width: 0;">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0;">
        <h3 style="margin: 0; font-size: 1.1rem;"><i class="bi bi-sliders" style="color: var(--accent-blue); margin-right: 6px;"></i> Variáveis Globais</h3>
      </div>

      <div class="grid-2-cols" style="gap: 20px; margin-bottom: 20px;">
        <div class="form-group" style="margin: 0;">
          <label for="whatsapp-inbox-ids" style="color: var(--muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Inbox IDs WhatsApp (separados por vírgula)</label>
          <input id="whatsapp-inbox-ids" type="text" placeholder="Ex: 1, 2" style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.95rem;">
        </div>

        <div class="form-group" style="margin: 0;">
          <label for="email-inbox-ids" style="color: var(--muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Inbox IDs E-mail (separados por vírgula)</label>
          <input id="email-inbox-ids" type="text" placeholder="Ex: 3, 5" style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.95rem;">
        </div>
      </div>

      <div class="grid-2-cols" style="gap: 20px; margin-bottom: 24px;">
        <div class="form-group" style="margin: 0;">
          <label for="chatwoot-base-url" style="color: var(--muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">URL base do Chatwoot</label>
          <input id="chatwoot-base-url" type="text" placeholder="https://chat.seusite.com.br" style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.95rem;">
        </div>

        <div class="form-group" style="margin: 0;">
          <label for="cancellation-label" style="color: var(--muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Etiqueta de Cancelamento (exclui das métricas)</label>
          <input id="cancellation-label" type="text" placeholder="cancelado" style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.95rem;">
        </div>
      </div>

      <div style="border-top: 1px solid var(--border); padding-top: 20px; display: flex; justify-content: flex-end;">
        <button onclick="saveSettings()" style="padding: 10px 24px; border-radius: 8px; background: var(--accent); color: #fff; border: none; cursor: pointer; font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; transition: filter 0.2s;"><i class="bi bi-cloud-check"></i> Salvar Globais</button>
      </div>
    </div>

    <!-- SLAs e Times -->
    <div class="grid-2-cols" style="gap: 24px; margin-bottom: 24px;">
      
      <!-- SLA Targets -->
      <div class="panel" style="display: flex; flex-direction: column; border-radius: 12px; padding: 24px; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="bi bi-shield-check" style="color: var(--accent-green); margin-right: 6px;"></i> SLA por prioridade</h3>
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
          <label for="sla-target-percent" style="color: var(--muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Meta Geral de Atingimento (%)</label>
          <div style="position: relative; max-width: 160px;">
            <input id="sla-target-percent" type="number" min="0" max="100" style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.95rem; font-weight: 600;">
            <i class="bi bi-percent" style="position: absolute; right: 14px; top: 12px; color: var(--muted);"></i>
          </div>
        </div>

        <div class="table-responsive" style="flex: 1; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 8px;">
          <table id="sla-priority-table" style="margin: 0;">
            <thead style="background: rgba(255,255,255,0.02);">
              <tr>
                <th style="font-size: 0.8rem;">Prioridade</th>
                <th style="font-size: 0.8rem;">1ª Resposta (min)</th>
                <th style="font-size: 0.8rem;">Resolução (horas)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 20px;">
          <button onclick="saveSlaPriorityTargets()" style="width: 100%; padding: 10px; border-radius: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 600; transition: background 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px;"><i class="bi bi-check2-circle"></i> Salvar Tempos de SLA</button>
        </div>
      </div>

      <!-- Teams -->
      <div class="panel" style="display: flex; flex-direction: column; border-radius: 12px; padding: 24px; min-width: 0;">
        <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0;">
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="bi bi-diagram-3" style="color: var(--accent-yellow); margin-right: 6px;"></i> Departamentos / Times</h3>
        </div>

        <div class="table-responsive" style="flex: 1; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 8px; max-height: 400px; overflow-y: auto;">
          <table id="teams-table" style="margin: 0;">
            <thead style="background: rgba(255,255,255,0.02);">
              <tr>
                <th style="width: 100px; font-size: 0.8rem;">ID Chatwoot</th>
                <th style="width: 100%; font-size: 0.8rem;">Nome no Monitor</th>
                <th></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 20px; display: flex; gap: 12px;">
          <button type="button" onclick="addTeamRow()" style="flex: 1; padding: 10px; border-radius: 8px; background: transparent; color: var(--text); border: 1px dashed var(--muted); cursor: pointer; font-weight: 600; display: flex; justify-content: center; align-items: center; gap: 8px; transition: border-color 0.2s;"><i class="bi bi-plus-lg"></i> Novo</button>
          <button onclick="saveTeams()" style="flex: 2; padding: 10px; border-radius: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 600; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background 0.2s;"><i class="bi bi-check2-circle"></i> Salvar Times</button>
        </div>
      </div>

    </div>

    <!-- Label Colors -->
    <div class="panel" id="settings-panel-labels" style="margin-bottom: 24px; border-radius: 12px; padding: 24px; min-width: 0;">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0;">
        <h3 style="margin: 0; font-size: 1.1rem;"><i class="bi bi-palette" style="color: var(--accent); margin-right: 6px;"></i> Cores de Etiquetas</h3>
      </div>

      <div class="table-responsive" style="margin-bottom: 20px; max-height: 400px; border: 1px solid var(--border); border-radius: 8px;">
        <table id="label-colors-table" style="margin: 0;">
          <thead style="background: rgba(255,255,255,0.02);">
            <tr>
              <th style="width: 60%; font-size: 0.8rem;">Nome Exato da Etiqueta</th>
              <th style="font-size: 0.8rem;">Cor Visual</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div style="border-top: 1px solid var(--border); padding-top: 20px; display: flex; gap: 12px;">
        <button type="button" onclick="addLabelColorRow()" style="padding: 10px 20px; border-radius: 8px; background: transparent; color: var(--text); border: 1px dashed var(--muted); cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="bi bi-plus-lg"></i> Adicionar Regra</button>
        <button onclick="saveLabelColors()" style="padding: 10px 24px; border-radius: 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="bi bi-check2-circle"></i> Salvar Cores</button>
      </div>
    </div>

    <!-- Bug Reports -->
    <div class="panel" id="settings-panel-bugs" style="border-radius: 12px; padding: 24px; min-width: 0;">
      <div class="home-panel-header" style="margin-bottom: 20px; border-bottom: none; padding-bottom: 0; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem;"><i class="bi bi-bug" style="color: var(--accent-red); margin-right: 6px;"></i> Gestão de Feedbacks</h3>

        <div class="filter-bar" id="bug-status-tabs" style="margin: 0; background: var(--bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border);">
          <button class="filter-btn active" data-status="" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 4px;">Todos</button>
          <button class="filter-btn" data-status="novo" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 4px;">Novo</button>
          <button class="filter-btn" data-status="andamento" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 4px;">Andamento</button>
          <button class="filter-btn" data-status="finalizado" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 4px;">Finalizado</button>
        </div>
      </div>

      <div class="table-responsive" style="max-height: 500px; border: 1px solid var(--border); border-radius: 8px; overflow-x: hidden;">
        <table id="bug-reports-table" style="margin: 0; table-layout: fixed; width: 100%;">
          <thead style="background: rgba(255,255,255,0.02);">
            <tr>
              <th style="font-size: 0.75rem; width: 16%;">Data</th>
              <th style="font-size: 0.75rem; width: 16%;">Usuário</th>
              <th style="font-size: 0.75rem; width: 12%;">Tela</th>
              <th style="font-size: 0.75rem; width: 34%;">Descrição</th>
              <th style="font-size: 0.75rem; width: 14%;">Status</th>
              <th style="width: 8%;"></th>
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

    const isAdmin = currentUser.role === 'administrator';
    const isDeveloper = !!currentUser.is_developer;

    const gerais = document.getElementById('settings-panel-gerais');
    const bugsPanel = document.getElementById('settings-panel-bugs');
    if (gerais) gerais.style.display = isAdmin ? '' : 'none';
    if (bugsPanel) bugsPanel.style.display = isDeveloper ? '' : 'none';

    const settings = await (await fetch('/monitor/api/settings')).json();
    document.getElementById('sla-target-percent').value = settings.sla_target_percent || 95;
    await loadSlaPriorityTargets();
    await loadTeams();
    await loadLabelColors();

    if (isAdmin) {
      document.getElementById('chatwoot-base-url').value = settings.chatwoot_base_url || '';
      document.getElementById('whatsapp-inbox-ids').value = settings.whatsapp_inbox_ids || '';
      document.getElementById('email-inbox-ids').value = settings.email_inbox_ids || '';
      document.getElementById('cancellation-label').value = settings.cancellation_label || 'cancelado';
    }

    if (isDeveloper) {
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
      document.querySelector('#bug-status-tabs .filter-btn.active').style.background = 'var(--panel)';

      await loadBugReports();
    }
  },
};
