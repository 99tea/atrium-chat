const CONV_PRIORITY_MAP = { 
  urgent: { label: 'Urg', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-exclamation-triangle-fill' }, 
  high: { label: 'Alt', classes: 'text-accent-red bg-accent-red/10 border-accent-red/20', icon: 'bi-arrow-up-circle-fill' }, 
  medium: { label: 'Med', classes: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20', icon: 'bi-dash-circle-fill' }, 
  low: { label: 'Bxa', classes: 'text-muted bg-border/30 border-border', icon: 'bi-arrow-down-circle-fill' }, 
  none: { label: 'Nen', classes: 'text-muted bg-border/30 border-border', icon: 'bi-info-circle-fill' } 
};

const CONV_SORT_LABELS = { sla_deadline: 'SLA', created_at: 'Criação', updated_at: 'Alterado', priority: 'Prioridade' };

let convState = {
  status: 'open', label: '', assignee_id: '', search: '', sort_by: 'sla_deadline', sort_dir: 'asc', page: 1, page_size: 50,
};

function formatDetailedDuration(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '-';
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

function labelBadge(label) {
  const hex = getLabelColor(label);
  return `<div data-tooltip="${label}" class="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border cursor-help mr-0.5 mb-0.5" style="background-color: ${hex}15; border-color: ${hex}40;">
            <span class="w-2 h-2 rounded-full" style="background-color: ${hex}; box-shadow: 0 0 4px ${hex}80;"></span>
          </div>`;
}

function slaBadge(row) {
  const baseCls = "inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap";
  if (row.sla_status === 'unknown') return `<span class="${baseCls} bg-panel-light text-muted border-border"><i class="bi bi-dash-circle"></i> -</span>`;
  
  if (row.status === 'resolved') {
    const onTime = row.sla_status === 'on_time';
    const icon = onTime ? 'bi-check-circle-fill' : 'bi-x-circle-fill';
    const color = onTime ? 'text-accent-green bg-accent-green/10 border-accent-green/20' : 'text-accent-red bg-accent-red/10 border-accent-red/20';
    return `<span class="${baseCls} ${color}"><i class="bi ${icon}"></i> ${onTime ? 'No prazo' : 'Atrasado'}</span>`;
  }
  
  if (row.minutes_remaining === null || row.minutes_remaining === undefined) {
    return `<span class="${baseCls} bg-panel-light text-muted border-border"><i class="bi bi-clock-history"></i> Sem meta</span>`;
  }
  
  const late = row.minutes_remaining < 0;
  const absMinutes = Math.abs(row.minutes_remaining);
  const icon = late ? 'bi-alarm-fill' : 'bi-stopwatch-fill';
  const color = late ? 'text-accent-red bg-accent-red/10 border-accent-red/20' : 'text-accent-green bg-accent-green/10 border-accent-green/20';
  
  return `<span class="${baseCls} ${color}"><i class="bi ${icon}"></i> ${formatDetailedDuration(absMinutes)}</span>`;
}

function priorityBadge(priority) {
  const prio = String(priority || 'none').toLowerCase();
  const info = CONV_PRIORITY_MAP[prio] || CONV_PRIORITY_MAP.none;
  return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] font-semibold rounded-md border whitespace-nowrap ${info.classes}"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return `<span class="block whitespace-nowrap">${d.toLocaleDateString('pt-BR')}</span> <span class="text-muted text-[0.75rem] block whitespace-nowrap mt-0.5"><i class="bi bi-clock mr-1"></i>${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>`;
};

async function openNotesModal(conversationId) {
  document.getElementById('notes-modal').classList.remove('hidden');
  document.getElementById('notes-modal-title').innerHTML = `<i class="bi bi-sticky text-accent-yellow mr-2 glow-text"></i>Notas Internas <span class="text-muted text-sm ml-2 font-normal">#${conversationId}</span>`;
  const body = document.getElementById('notes-modal-body');
  body.innerHTML = '<div class="py-10 text-center"><i class="bi bi-hourglass-split text-3xl text-muted animate-pulse"></i><span class="block mt-2 text-muted text-sm">Carregando notas...</span></div>';

  const notes = await fetch(`/monitor/api/conversations/${conversationId}/notes`).then(r => r.ok ? r.json() : []).catch(() => []);

  if (notes.length === 0) {
    body.innerHTML = '<div class="py-10 text-center"><i class="bi bi-sticky text-3xl text-border mb-2"></i><span class="block text-muted text-sm">Nenhuma nota interna nesta conversa</span></div>';
    return;
  }

  body.innerHTML = notes.map(n => {
    const d = n.created_at ? new Date(n.created_at * 1000) : null;
    const dateStr = d ? `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : '-';
    return `
      <div class="bg-panel-light border border-border rounded-xl p-4 relative shadow-sm">
        <div class="flex justify-between items-center mb-3 pb-3 border-b border-border/50">
          <span class="font-semibold text-sm flex items-center gap-2 text-text"><i class="bi bi-person-circle text-muted text-lg"></i> ${n.sender_name}</span>
          <span class="text-muted text-xs flex items-center gap-1"><i class="bi bi-clock"></i> ${dateStr}</span>
        </div>
        <div class="whitespace-pre-wrap text-[0.95em] leading-relaxed text-text pl-1">${n.content}</div>
      </div>`;
  }).join('');
}

function closeNotesModal() { document.getElementById('notes-modal').classList.add('hidden'); }

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
          ? ' <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6rem] bg-panel-light text-muted border border-border rounded-md mt-1" data-tooltip="Não entra nas métricas"><i class="bi bi-slash-circle"></i> Fora</span>'
          : '';
        return `
          <tr class="hover:bg-panel-light transition-colors border-b border-border/50 last:border-0 ${r.excluded_from_metrics ? 'opacity-60' : ''}">
            <td class="px-3 py-3 text-[0.8rem] font-semibold text-text align-top">${r.conversation_id}</td>
            <td class="px-2 py-3 align-top">${priorityBadge(r.priority)}</td>
            <td class="px-3 py-3 text-[0.8rem] text-text align-top">${formatDate(r.created_at)}</td>
            <td class="px-3 py-3 text-[0.8rem] text-text align-top">${formatDate(r.updated_at)}</td>
            <td class="px-3 py-3 text-[0.8rem] text-text leading-tight align-top">
              <span class="block">${r.subject || '-'}</span>
              ${excludedTag}
            </td>
            <td class="px-3 py-3 align-top">
              <div class="font-medium text-[0.8rem] text-text leading-tight mb-1">${r.contact_name || '-'}</div>
              ${r.company_name ? `<div class="text-muted text-[0.7rem] leading-tight flex items-start gap-1"><i class="bi bi-building"></i> <span>${r.company_name}</span></div>` : ''}
            </td>
            <td class="px-3 py-3 text-[0.8rem] text-muted align-top">
              <div class="flex items-start gap-1.5"><i class="bi bi-person"></i> <span class="leading-tight">${r.assignee_name || 'Não atribuído'}</span></div>
            </td>
            <td class="px-3 py-3 align-top">
              <div class="flex flex-wrap">${labels}</div>
            </td>
            <td class="px-3 py-3 align-top">${slaBadge(r)}</td>
            <td class="px-3 py-3 text-right align-top whitespace-nowrap">
              <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors mr-1" data-tooltip="Ver notas internas" onclick="openNotesModal(${r.conversation_id})">
                <i class="bi bi-sticky text-[0.85rem]"></i>
              </button>
              <button class="p-1.5 text-muted hover:text-text hover:bg-white/5 rounded-md transition-colors" data-tooltip="Visualizar no Atrium Chat" onclick="window.open('${url}', '_blank')">
                <i class="bi bi-box-arrow-up-right text-[0.85rem]"></i>
              </button>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="10"><div class="py-12 text-center flex flex-col items-center"><i class="bi bi-inbox text-3xl text-border mb-3"></i><span class="text-muted text-sm">Nenhuma conversa encontrada</span></div></td></tr>';

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
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">

      <!-- Header & Status Filters -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 bg-accent text-white shadow-sm glow-border"><i class="bi bi-chat-text"></i></div>
          <div>
            <h2 class="m-0 mb-1 text-[1.4rem] font-bold text-text">Conversas</h2>
            <p class="m-0 text-[0.9rem] text-muted">Busca e histórico completo de atendimentos</p>
          </div>
        </div>

        <div id="conv-status-tabs" class="flex gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
          <button id="btn-conv-open" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-accent bg-panel shadow-sm text-text glow-border" data-status="open">Abertas</button>
          <button id="btn-conv-pending" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-status="pending">Pendentes</button>
          <button id="btn-conv-resolved" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-status="resolved">Resolvidas</button>
          <button id="btn-conv-cancelled" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-status="cancelled">Canceladas</button>
          <button id="btn-conv-all" class="filter-btn px-4 py-2 text-[0.8rem] font-semibold rounded-lg transition-colors border border-transparent bg-transparent text-muted hover:bg-panel-light hover:text-text" data-status="all">Todas</button>
        </div>
      </div>

      <!-- Barra de Filtros Internos corrigida para Flexbox Seguro -->
      <div class="panel-card bg-panel border border-border rounded-xl p-4 shadow-sm">
        <div class="flex flex-col lg:flex-row gap-4 items-center">
          <div class="relative flex-1 w-full min-w-0">
            <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-muted"></i>
            <input id="conv-search" type="text" placeholder="Buscar por código, cliente, empresa ou assunto..." autocomplete="off" class="w-full pl-11 pr-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.9rem] focus:outline-none focus:border-accent transition-all shadow-inner">
          </div>
          <select id="conv-label-filter" class="w-full lg:w-56 shrink-0 px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent transition-all appearance-none cursor-pointer shadow-inner">
            <option value="">Todas as etiquetas</option>
          </select>
          <select id="conv-agent-filter" class="w-full lg:w-56 shrink-0 px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-[0.85rem] focus:outline-none focus:border-accent transition-all appearance-none cursor-pointer shadow-inner">
            <option value="">Todos os agentes</option>
          </select>
        </div>
      </div>

      <!-- Tabela Principal corrigida com classes padrão Tailwind -->
	  <div class="panel-card bg-panel border border-border rounded-xl flex flex-col min-w-0 shadow-sm overflow-hidden mb-6">
        <div class="panel-content overflow-x-auto overflow-y-auto flex-1 h-[650px] no-scrollbar">
          <table id="conversations-table" class="sortable w-full text-left table-fixed min-w-[1000px]">
            <thead class="sticky top-0 bg-panel z-10 shadow-[0_1px_0_var(--border)]">
              <tr>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-20 cursor-pointer select-none hover:text-text bg-panel" data-sort="id">Código</th>
                <th class="px-2 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-16 cursor-pointer select-none hover:text-text bg-panel" data-sort="priority">Pr.</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-24 cursor-pointer select-none hover:text-text bg-panel" data-sort="created_at">Criação</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-24 cursor-pointer select-none hover:text-text bg-panel" data-sort="updated_at">Alterado</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-full bg-panel">Assunto</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-40 bg-panel">Solicitante</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-36 bg-panel">Agente</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-24 bg-panel">Etiquetas</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-28 cursor-pointer select-none hover:text-text bg-panel" data-sort="sla_deadline">SLA</th>
                <th class="px-3 py-3 text-[0.65rem] font-bold text-muted uppercase tracking-wider w-20 text-right bg-panel">Ação</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div class="flex justify-between items-center px-5 py-4 border-t border-border bg-bg">
          <span id="conv-page-indicator" class="text-[0.8rem] font-medium text-muted"></span>
          <div class="flex gap-2">
            <button id="conv-prev-page" class="px-4 py-1.5 bg-panel-light border border-border rounded-lg text-[0.8rem] font-semibold text-text hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><i class="bi bi-chevron-left mr-1"></i> Anterior</button>
            <button id="conv-next-page" class="px-4 py-1.5 bg-panel-light border border-border rounded-lg text-[0.8rem] font-semibold text-text hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Próxima <i class="bi bi-chevron-right ml-1"></i></button>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal Notas Internas -->
    <div id="notes-modal" class="hidden fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-5">
      <div class="bg-panel border border-border rounded-2xl w-full max-w-[700px] flex flex-col relative shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        <button class="absolute top-4 right-5 bg-transparent border-none text-muted hover:text-text text-2xl cursor-pointer z-10 transition-colors" onclick="closeNotesModal()">&times;</button>
        <div class="p-6 border-b border-border bg-panel-light/50">
           <h3 id="notes-modal-title" class="m-0 text-lg font-bold flex items-center"></h3>
        </div>
        <div id="notes-modal-body" class="p-6 max-h-[60vh] overflow-y-auto flex flex-col gap-4 no-scrollbar"></div>
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
        window.handleDateFilterClick('conv-status-tabs', btn.id, null);
        convState.status = btn.dataset.status;
        convState.page = 1;
        
        const content = document.getElementById('conversations-table');
        content.style.opacity = '0.5';
        
        fetchConversations().then(() => {
          content.style.opacity = '1';
        });
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
