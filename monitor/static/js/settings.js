async function saveSettings() {
  await fetch('/monitor/api/settings', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      chatwoot_base_url: document.getElementById('chatwoot-base-url').value,
      whatsapp_inbox_ids: document.getElementById('whatsapp-inbox-ids').value,
      email_inbox_ids: document.getElementById('email-inbox-ids').value
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
      <td><input type="number" class="sla-frt" value="${r.first_response_minutes}" style="width: 100px; margin-left: 0;"></td>
      <td><input type="number" step="0.5" class="sla-res" value="${(r.resolution_minutes / 60).toFixed(1)}" style="width: 100px; margin-left: 0;"></td>
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

Screens.settings = {
  template: `
    <div class="panel" style="margin-bottom: 24px;">
      <h2 style="margin-top: 0; padding-bottom: 12px; border-bottom: 1px solid var(--border);">Gerais</h2>

      <div class="form-group">
        <label for="whatsapp-inbox-ids">Inbox IDs WhatsApp (separados por vírgula)</label>
        <input id="whatsapp-inbox-ids" type="text" placeholder="1">
      </div>

      <div class="form-group">
        <label for="email-inbox-ids">Inbox IDs E-mail (separados por vírgula)</label>
        <input id="email-inbox-ids" type="text" placeholder="3,5">
      </div>

      <div class="form-group">
        <label for="chatwoot-base-url">URL base do Chatwoot</label>
        <input id="chatwoot-base-url" type="text" placeholder="https://chat.australisdev.online">
      </div>

      <button onclick="saveSettings()" style="margin-top: 8px;">Salvar Gerais</button>
    </div>

    <div class="panel">
      <h2 style="margin-top: 0; padding-bottom: 12px; border-bottom: 1px solid var(--border);">SLA por prioridade</h2>

      <div class="form-group">
        <label for="sla-target-percent">Meta SLA Atingido (%)</label>
        <input id="sla-target-percent" type="number" min="0" max="100" style="max-width: 150px;">
      </div>

      <div class="table-responsive" style="margin: 16px 0;">
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

      <button onclick="saveSlaPriorityTargets()">Salvar SLA</button>
    </div>
  `,
  load: async function () {
    const settings = await (await fetch('/monitor/api/settings')).json();
    document.getElementById('sla-target-percent').value = settings.sla_target_percent || 95;
    document.getElementById('chatwoot-base-url').value = settings.chatwoot_base_url || '';
    document.getElementById('whatsapp-inbox-ids').value = settings.whatsapp_inbox_ids || '';
    document.getElementById('email-inbox-ids').value = settings.email_inbox_ids || '';
    await loadSlaPriorityTargets();
  },
};
