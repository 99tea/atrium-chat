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

function labelBadge(label) {
  const hex = getLabelColor(label);
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
            <i class="bi ${icon}"></i> ${late ? 'Atrasado' : 'Em'} ${formatDetailedDuration(absMinutes)}
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
  return `${d.toLocaleDateString('pt-BR')} <span class="muted-text" style="font-size:0.85em; margin-left:4px;">${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>`;
};

async function openNotesModal(conversationId) {
  document.getElementById('notes-modal').classList.remove('hidden');
  document.getElementById('notes-modal-title').innerHTML = `<i class="bi bi-sticky" style="color: var(--accent-yellow); margin-right: 8px;"></i>Notas Internas <span class="muted-text" style="font-size: 0.8em; margin-left: 8px;">#${conversationId}</span>`;
  const body = document.getElementById('notes-modal-body');
  body.innerHTML = '<div class="empty-state" style="padding: 40px 20px;"><i class="bi bi-hourglass-split" style="font-size: 2rem;"></i><span style="margin-top: 8px;">Carregando notas...</span></div>';

  const notes = await fetch(`/monitor/api/conversations/${conversationId}/notes`).then(r => r.ok ? r.json() : []).catch(() => []);

  if (notes.length === 0) {
    body.innerHTML = '<div class="empty-state" style="padding: 40px 20px;"><i class="bi bi-sticky" style="font-size: 2rem; margin-bottom: 8px;"></i><span>Nenhuma nota interna nesta conversa</span></div>';
    return;
  }

  body.innerHTML = notes.map(n => {
    const d = n.created_at ? new Date(n.created_at * 1000) : null;
    const dateStr = d ? `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : '-';
    return `
      <div class="note-item" style="background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; position: relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
          <span style="font-weight: 600; font-size: 0.9em; display: flex; align-items: center; gap: 6px;"><i class="bi bi-person-circle" style="color: var(--muted); font-size: 1.1rem;"></i> ${n.sender_name}</span>
          <span class="muted-text" style="font-size: 0.8em;"><i class="bi bi-clock" style="margin-right: 4px;"></i>${dateStr}</span>
        </div>
        <div style="white-space: pre-wrap; font-size: 0.95em; line-height: 1.6; color: var(--text); padding-left: 4px;">${n.content}</div>
      </div>`;
  }).join('');
}

function closeNotesModal() {
  document.getElementById('notes-modal').classList.add('hidden');
}

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
        const excludedTag = r.excluded_from_metrics
          ? ' <span class="badge badge-neutral" style="font-size:0.7em; white-space:nowrap; margin-left: 6px;" data-tooltip="Não entra nas métricas de desempenho"><i class="bi bi-slash-circle"></i> Fora da métrica</span>'
          : '';
        return `
          <tr${r.excluded_from_metrics ? ' style="opacity: 0.6;"' : ''}>
            <td style="font-weight: 500;">${r.conversation_id}</td>
            <td>${priorityBadge(r.priority)}</td>
            <td style="white-space: nowrap;">${formatDate(r.created_at)}</td>
            <td style="white-space: nowrap;">${formatDate(r.updated_at)}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.subject || ''}">${r.subject || '-'}${excludedTag}</td>
            <td>
              <div style="font-weight: 500; white-space: nowrap;">${r.contact_name || '-'}</div>
              ${r.company_name ? `<div class="muted-text" style="font-size:0.8rem; margin-top: 2px;"><i class="bi bi-building"></i> ${r.company_name}</div>` : ''}
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                <i class="bi bi-person muted-text"></i> ${r.assignee_name || 'Não atribuído'}
              </div>
            </td>
            <td style="max-width: 250px; flex-wrap: wrap; gap: 4px;">${labels}</td>
            <td>${slaBadge(r)}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="topbar-btn" style="padding: 4px 8px; display: inline-flex; margin-right: 4px;" data-tooltip="Ver notas internas" onclick="openNotesModal(${r.conversation_id})">
                <i class="bi bi-sticky" style="font-size: 0.9rem;"></i>
              </button>
              <button class="topbar-btn" style="padding: 4px 8px; display: inline-flex;" data-tooltip="Visualizar no Chatwoot" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right" style="font-size: 0.9rem;"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="10"><div class="empty-state" style="padding: 40px 20px;"><i class="bi bi-inbox" style="font-size: 2rem; margin-bottom: 8px;"></i><span style="font-size: 1.1rem;">Nenhuma conversa encontrada</span></div></td></tr>';

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
    <div style="display:flex; align-items:center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
      <div class="home-avatar" style="width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 0; background: var(--accent);">
        <i class="bi bi-chat-text"></i>
      </div>
      <div>
        <h2 style="margin: 0 0 4px; font-size: 1.4rem;">Conversas</h2>
        <p class="muted-text" style="margin: 0; font-size: 0.9rem;">Busca e histórico completo de atendimentos</p>
      </div>
    </div>

    <div class="filter-bar" id="conv-status-tabs" style="margin-bottom: 24px;">
      <button class="filter-btn active" data-status="open">Abertas</button>
      <button class="filter-btn" data-status="pending">Pendentes</button>
      <button class="filter-btn" data-status="resolved">Resolvidas</button>
      <button class="filter-btn" data-status="cancelled">Canceladas</button>
      <button class="filter-btn" data-status="all">Todas</button>
    </div>

    <div class="panel" style="margin-bottom: 24px; padding: 20px;">
      <div style="display:flex; gap:16px; flex-wrap:wrap; align-items: center;">
        <div style="flex: 2; min-width: 250px; position: relative;">
          <i class="bi bi-search" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 1.1rem;"></i>
          <input id="conv-search" type="text" placeholder="Buscar cliente, empresa ou assunto..." style="width: 100%; margin: 0; padding: 12px 16px 12px 44px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; font-size: 0.95rem;">
        </div>
        <select id="conv-label-filter" style="flex: 1; min-width: 180px; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; font-size: 0.95rem; cursor: pointer; appearance: auto;">
          <option value="">Todas as etiquetas</option>
        </select>
        <select id="conv-agent-filter" style="flex: 1; min-width: 180px; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; font-size: 0.95rem; cursor: pointer; appearance: auto;">
          <option value="">Todos os agentes</option>
        </select>
      </div>
    </div>

    <div class="panel" style="display: flex; flex-direction: column; min-width: 0;">
      <div class="table-responsive" style="flex: 1; max-height: 65vh;">
        <table id="conversations-table" class="sortable">
          <thead>
            <tr>
              <th style="width: 80px;">Código</th>
              <th data-sort="priority" style="cursor:pointer; white-space: nowrap;">Pr.</th>
              <th data-sort="created_at" style="cursor:pointer;">Criação</th>
              <th data-sort="updated_at" style="cursor:pointer;">Alterado</th>
              <th>Assunto</th>
              <th>Solicitante</th>
              <th>Agente</th>
              <th>Etiquetas</th>
              <th data-sort="sla_deadline" style="cursor:pointer;">SLA</th>
              <th style="text-align: right;">Ação</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="pagination-bar" style="display:flex; justify-content:space-between; align-items:center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
        <span id="conv-page-indicator" class="muted-text" style="font-weight: 500; font-size: 0.9rem;"></span>
        <div style="display: flex; gap: 8px;">
          <button id="conv-prev-page" class="filter-btn" style="border: 1px solid var(--border); background: var(--bg); padding: 6px 16px;"><i class="bi bi-chevron-left" style="font-size: 0.8rem; margin-right: 4px;"></i> Anterior</button>
          <button id="conv-next-page" class="filter-btn" style="border: 1px solid var(--border); background: var(--bg); padding: 6px 16px;">Próxima <i class="bi bi-chevron-right" style="font-size: 0.8rem; margin-left: 4px;"></i></button>
        </div>
      </div>
    </div>

    <div id="notes-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 700px;">
        <button class="modal-close" onclick="closeNotesModal()" style="font-size: 1.5rem; color: var(--muted);">&times;</button>
        <h3 id="notes-modal-title" style="margin-top: 0; padding-bottom: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; font-size: 1.3rem;"></h3>
        <div id="notes-modal-body" style="max-height: 60vh; overflow-y: auto; margin-top: 20px; padding-right: 8px;"></div>
      </div>
    </div>
  `,
  load: async function () {
    const oldModal = document.querySelector('body > #notes-modal');
    if (oldModal) oldModal.remove();

    const modalEl = document.getElementById('notes-modal');
    if (modalEl) {
      document.body.appendChild(modalEl);
      modalEl.addEventListener('click', function (e) {
        if (e.target === this) closeNotesModal();
      });
    }

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
        document.querySelectorAll('#conv-status-tabs .filter-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--panel)';
        convState.status = btn.dataset.status;
        convState.page = 1;
        fetchConversations();
      });
    });
    
    // Set default visual style for active tab
    const activeTab = document.querySelector('#conv-status-tabs .filter-btn.active');
    if(activeTab) activeTab.style.background = 'var(--panel)';

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
