const CONV_LABEL_COLORS = {
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

const CONV_PRIORITY_MAP = { 
  urgent: { label: 'Urgente', badge: 'badge-red', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alta', badge: 'badge-red', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Média', badge: 'badge-yellow', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Baixa', badge: 'badge-neutral', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nenhuma', badge: 'badge-neutral', icon: 'bi-info-circle-fill' } 
};

const CONV_SORT_LABELS = { sla_deadline: 'SLA', created_at: 'Criação', updated_at: 'Alterado', priority: 'Prioridade' };

let convState = {
  status: 'open',
  label: '',
  assignee_id: '',
  search: '',
  sort_by: 'sla_deadline',
  sort_dir: 'asc',
  page: 1,
  page_size: 50,
};

function labelBadge(label) {
  const hex = CONV_LABEL_COLORS[label.toLowerCase()] || '#9296b8';
  return `<span class="badge badge-neutral" style="margin-right:4px; display:inline-flex; align-items:center; gap:6px; padding-left:8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
            ${label}
          </span>`;
}

function slaBadge(row) {
  if (row.sla_status === 'unknown') {
    return '<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-dash-circle"></i> -</span>';
  }
  if (row.status === 'resolved') {
    const onTime = row.sla_status === 'on_time';
    const icon = onTime ? 'bi-check-circle-fill' : 'bi-x-circle-fill';
    return `<span class="badge ${onTime ? 'badge-green' : 'badge-red'}" style="display:inline-flex; align-items:center; gap:4px; white-space:nowrap;"><i class="bi ${icon}"></i> ${onTime ? 'No prazo' : 'Fora do prazo'}</span>`;
  }
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return '<span class="badge badge-neutral" style="display:inline-flex; align-items:center; gap:4px;"><i class="bi bi-clock-history"></i> Sem meta</span>';
  }
  
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  
  return `<span class="badge ${late ? 'badge-red' : 'badge-green'}" style="display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
            <i class="bi ${icon}"></i> ${late ? 'Atrasado' : 'Em'} ${formatDuration(absMinutes)}
          </span>`;
}

function priorityBadge(priority) {
  const prio = String(priority || 'none').toLowerCase();
  const info = CONV_PRIORITY_MAP[prio] || CONV_PRIORITY_MAP.none;
  return `<span class="badge ${info.badge}" style="display:inline-flex; align-items:center; gap:4px; padding: 4px 8px;">
            <i class="bi ${info.icon}"></i> ${info.label}
          </span>`;
}

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return `${d.toLocaleDateString('pt-BR')} <span class="muted-text" style="font-size:0.85em;">${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>`;
};

async function fetchConversations() {
  const params = new URLSearchParams();
  Object.entries(convState).forEach(([k, v]) => { if (v !== '' && v !== null) params.set(k, v); });

  const [data, settings] = await Promise.all([
    fetch(`/monitor/api/conversations?${params}`).then(r => r.ok ? r.json() : { items: [], total: 0, page: 1, page_size: 50 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 50 })),
    fetch('/monitor/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);

  const chatwootBase = settings.chatwoot_base_url || '';
  const accountId = currentUser.account_id;

  document.querySelector('#conversations-table tbody').innerHTML = data.items.length
    ? data.items.map(r => {
        const url = `${chatwootBase}/app/accounts/${accountId}/search?q=${r.conversation_id}`;
        const labels = (r.labels || []).map(labelBadge).join('');
        return `
          <tr>
            <td>${r.conversation_id}</td>
            <td>${priorityBadge(r.priority)}</td>
            <td>${formatDate(r.created_at)}</td>
            <td>${formatDate(r.updated_at)}</td>
            <td>${r.subject || '-'}</td>
            <td>${r.contact_name || '-'}${r.company_name ? ` <br><span class="muted-text" style="font-size:0.85em;"><i class="bi bi-building"></i> ${r.company_name}</span>` : ''}</td>
            <td>${r.assignee_name || '-'}</td>
            <td style="max-width: 250px; flex-wrap: wrap; gap: 4px;">${labels}</td>
            <td>${slaBadge(r)}</td>
            <td><i class="bi bi-box-arrow-up-right" style="cursor:pointer;color:var(--accent); font-size: 1.1rem;" onclick="window.open('${url}', '_blank')"></i></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="10"><div class="empty-state"><i class="bi bi-inbox" style="font-size: 1.5rem;"></i><span>Nenhuma conversa encontrada</span></div></td></tr>';

  const totalPages = Math.max(Math.ceil(data.total / data.page_size), 1);
  document.getElementById('conv-page-indicator').textContent = `Página ${data.page} de ${totalPages} (${data.total} conversas)`;
  document.getElementById('conv-prev-page').disabled = data.page <= 1;
  document.getElementById('conv-next-page').disabled = data.page >= totalPages;

  document.querySelectorAll('#conversations-table th[data-sort]').forEach(th => {
    th.classList.toggle('sorted-asc', th.dataset.sort === convState.sort_by && convState.sort_dir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.sort === convState.sort_by && convState.sort_dir === 'desc');
  });
}

Screens.conversations = {
  template: `
    <h2>Visão Conversas</h2>

    <div class="filter-bar" id="conv-status-tabs">
      <button class="filter-btn active" data-status="open">Abertas</button>
      <button class="filter-btn" data-status="pending">Pendentes</button>
      <button class="filter-btn" data-status="resolved">Resolvidas</button>
      <button class="filter-btn" data-status="all">Todas</button>
    </div>

    <div class="panel" style="margin-bottom: 20px; padding: 14px 18px;">
      <div class="form-group-row" style="display:flex; gap:16px; flex-wrap:wrap; align-items: center;">
        <div style="flex: 2; min-width: 220px; position: relative;">
          <i class="bi bi-search" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted);"></i>
          <input id="conv-search" type="text" placeholder="Buscar cliente, empresa ou assunto..." style="width: 100%; margin: 0; padding: 10px 14px 10px 38px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit;">
        </div>
        <select id="conv-label-filter" style="flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; cursor: pointer;">
          <option value="">Todas as etiquetas</option>
        </select>
        <select id="conv-agent-filter" style="flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; cursor: pointer;">
          <option value="">Todos os agentes</option>
        </select>
      </div>
    </div>

    <div class="panel">
      <div class="table-responsive" style="max-height: 65vh;">
        <table id="conversations-table">
          <thead>
            <tr>
              <th>Código</th>
              <th data-sort="priority" style="cursor:pointer; white-space: nowrap;">Pr.</th>
              <th data-sort="created_at" style="cursor:pointer;">Criação</th>
              <th data-sort="updated_at" style="cursor:pointer;">Alterado</th>
              <th>Assunto</th>
              <th>Solicitante</th>
              <th>Agente</th>
              <th>Etiquetas</th>
              <th data-sort="sla_deadline" style="cursor:pointer;">SLA</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="pagination-bar" style="display:flex; justify-content:space-between; align-items:center; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border);">
        <span id="conv-page-indicator" class="muted-text" style="font-weight: 500;"></span>
        <div style="display: flex; gap: 8px;">
          <button id="conv-prev-page" class="filter-btn" style="border: 1px solid var(--border); background: var(--bg);">Anterior</button>
          <button id="conv-next-page" class="filter-btn" style="border: 1px solid var(--border); background: var(--bg);">Próxima</button>
        </div>
      </div>
    </div>
  `,
  load: async function () {
    convState = { status: 'open', label: '', assignee_id: '', search: '', sort_by: 'sla_deadline', sort_dir: 'asc', page: 1, page_size: 50 };

    const [labels, agents] = await Promise.all([
      fetch('/monitor/api/conversations/labels').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/monitor/api/agents/status').then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    if (labels.length > 0) {
      document.getElementById('conv-label-filter').insertAdjacentHTML('beforeend', labels.map(l => `<option value="${l}">${l}</option>`).join(''));
    }
    if (agents.length > 0) {
      document.getElementById('conv-agent-filter').insertAdjacentHTML('beforeend', agents.map(a => `<option value="${a.agent_id}">${a.name}</option>`).join(''));
    }

    document.querySelectorAll('#conv-status-tabs .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#conv-status-tabs .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        convState.status = btn.dataset.status;
        convState.page = 1;
        fetchConversations();
      });
    });

    let searchTimeout;
    document.getElementById('conv-search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        convState.search = e.target.value;
        convState.page = 1;
        fetchConversations();
      }, 400);
    });

    document.getElementById('conv-label-filter').addEventListener('change', (e) => {
      convState.label = e.target.value;
      convState.page = 1;
      fetchConversations();
    });

    document.getElementById('conv-agent-filter').addEventListener('change', (e) => {
      convState.assignee_id = e.target.value;
      convState.page = 1;
      fetchConversations();
    });

    document.querySelectorAll('#conversations-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (convState.sort_by === key) {
          convState.sort_dir = convState.sort_dir === 'asc' ? 'desc' : 'asc';
        } else {
          convState.sort_by = key;
          convState.sort_dir = 'asc';
        }
        fetchConversations();
      });
    });

    document.getElementById('conv-prev-page').addEventListener('click', () => {
      if (convState.page > 1) { convState.page--; fetchConversations(); }
    });
    document.getElementById('conv-next-page').addEventListener('click', () => {
      convState.page++; fetchConversations();
    });

    await fetchConversations();
  },
};
