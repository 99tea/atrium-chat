const charts = {};
const Screens = {};
let currentUser = null;

const DEFAULT_LABEL_COLOR = '#9296b8';
let TEAM_NAMES = {};
let LABEL_COLORS = {};

async function loadGlobalConfig() {
  const [teams, labelColors] = await Promise.all([
    fetch('/monitor/api/teams').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/monitor/api/label-colors').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);
  TEAM_NAMES = {};
  teams.forEach(t => { TEAM_NAMES[t.team_id] = t.team_name; });
  LABEL_COLORS = labelColors;
}

function getLabelColor(label) {
  return LABEL_COLORS[(label || '').toLowerCase()] || DEFAULT_LABEL_COLOR;
}

Chart.defaults.animation.duration = 1200;
Chart.defaults.animation.easing = 'easeOutQuart';
Chart.defaults.font.family = "'Inter', -apple-system, Helvetica, Arial, sans-serif";

function renderChart(id, config) {
  const isLight = document.body.classList.contains('light-theme');
  const textColor = isLight ? '#6b7280' : '#9599a6';
  const gridColor = isLight ? '#e5e7eb' : 'rgba(255,255,255,0.05)';

  if (config.options?.plugins?.legend?.labels) {
    config.options.plugins.legend.labels.color = textColor;
  }
  if (config.options?.scales?.x) {
    if (!config.options.scales.x.ticks) config.options.scales.x.ticks = {};
    config.options.scales.x.ticks.color = textColor;
    if (config.options.scales.x.grid) config.options.scales.x.grid.color = gridColor;
  }
  if (config.options?.scales?.y) {
    if (!config.options.scales.y.ticks) config.options.scales.y.ticks = {};
    config.options.scales.y.ticks.color = textColor;
    if (config.options.scales.y.grid) config.options.scales.y.grid.color = gridColor;
  }

  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function updateChartsTheme(isLight) {
  if (typeof Chart === 'undefined') return;
  
  const textColor = isLight ? '#6b7280' : '#9599a6';
  const gridColor = isLight ? '#e5e7eb' : 'rgba(255,255,255,0.05)';
  
  Chart.defaults.color = textColor;

  Object.values(charts).forEach(chart => {
    if (chart.options.plugins?.legend?.labels) {
      chart.options.plugins.legend.labels.color = textColor;
    }
    if (chart.options.scales?.x) {
      if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = textColor;
      if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = gridColor;
    }
    if (chart.options.scales?.y) {
      if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = textColor;
      if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = gridColor;
    }
    chart.update();
  });
}

function fmt(n) {
  return n === null || n === undefined ? '-' : Number(n).toFixed(1);
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  const totalMin = Math.round(Math.abs(minutes));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const sign = minutes < 0 ? '-' : '';
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

async function checkAuth() {
  const res = await fetch('/monitor/api/me');
  if (!res.ok) {
    window.location.href = '/monitor-ui/login.html';
    return null;
  }
  return res.json();
}

function logout() {
  fetch('/monitor/api/logout', {method: 'POST'}).then(() => {
    window.location.href = '/monitor-ui/login.html';
  });
}

document.body.insertAdjacentHTML('beforeend', `
  <div id="global-loader" class="global-loader hidden"><div class="spinner"></div></div>
  <div id="toast-container" class="toast-container"></div>
`);

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icon = type === 'success' ? 'bi-check-circle' : 'bi-x-circle';
  
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="bi ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function renderRoute() {
  const rawRoute = location.hash.replace('#', '') || 'home';
  const [route, routeParam] = rawRoute.split('/');
  window.__routeParam = routeParam || null;

  const allowedForAgents = ['home', 'me', 'conversations'];
  if (currentUser.role !== 'administrator' && !allowedForAgents.includes(route)) {
    route = 'home';
  }

  // Lógica de alternância de ícones (Outline vs Fill)
  document.querySelectorAll('#nav-list li[data-route]').forEach(li => {
    const isActive = li.dataset.route === route;
    li.classList.toggle('active', isActive);
    
    const iconEl = li.querySelector('.nav-icon');
    if (iconEl) {
      if (isActive) {
        iconEl.classList.remove(li.dataset.icon);
        iconEl.classList.add(li.dataset.activeIcon);
        iconEl.style.color = 'var(--accent)'; // Dá um destaque extra na cor
      } else {
        iconEl.classList.remove(li.dataset.activeIcon);
        iconEl.classList.add(li.dataset.icon);
        iconEl.style.color = ''; 
      }
    }
  });

  const content = document.getElementById('content');
  const loader = document.getElementById('global-loader');

  if (!Screens[route]) {
    location.hash = 'home';
    return;
  }

  loader.classList.remove('hidden');
  content.classList.remove('fade-in');
  void content.offsetWidth;

  content.innerHTML = Screens[route].template;

  try {
    await Screens[route].load();
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar dados da tela', 'error');
  } finally {
    loader.classList.add('hidden');
    content.classList.add('fade-in');
  }
}


document.addEventListener('click', (e) => {
  const userDropdown = document.getElementById('user-dropdown-content');
  if (e.target.closest('#user-menu-btn')) {
    userDropdown.classList.toggle('show');
  } else if (userDropdown && userDropdown.classList.contains('show')) {
    userDropdown.classList.remove('show');
  }

  const refreshDropdown = document.getElementById('refresh-dropdown-content');
  if (e.target.closest('#auto-refresh-btn')) {
    refreshDropdown.classList.toggle('show');
  } else if (refreshDropdown && refreshDropdown.classList.contains('show')) {
    refreshDropdown.classList.remove('show');
  }

  const exportDropdown = document.getElementById('export-dropdown-content');
  if (e.target.closest('#export-btn')) {
    exportDropdown.classList.toggle('show');
  } else if (exportDropdown && exportDropdown.classList.contains('show')) {
    exportDropdown.classList.remove('show');
  }
});

const NAV_CONFIG = [
  { section: 'Visão Geral', items: [
    { route: 'home', label: 'Início', icon: 'bi-house', activeIcon: 'bi-house-fill', adminOnly: false },
    { route: 'today', label: 'Visão Hoje', icon: 'bi-calendar2-day', activeIcon: 'bi-calendar2-day-fill', adminOnly: true },
    { route: 'overview', label: 'Volume', icon: 'bi-grid-1x2', activeIcon: 'bi-grid-1x2-fill', adminOnly: true },
    { route: 'sla', label: 'SLA', icon: 'bi-shield-check', activeIcon: 'bi-shield-fill-check', adminOnly: true },
  ]},
  { section: 'Operacional', items: [
    { route: 'agents', label: 'Agentes', icon: 'bi-people', activeIcon: 'bi-people-fill', adminOnly: true },
    { route: 'conversations', label: 'Conversas', icon: 'bi-chat-text', activeIcon: 'bi-chat-text-fill', adminOnly: false },
    { route: 'clients', label: 'Clientes', icon: 'bi-buildings', activeIcon: 'bi-buildings-fill', adminOnly: true },
  ]},
  { section: 'Administração', items: [
    { route: 'me', label: 'Meus Dados', icon: 'bi-person-badge', activeIcon: 'bi-person-badge-fill', adminOnly: false },
    { route: 'settings', label: 'Configurações', icon: 'bi-gear', activeIcon: 'bi-gear-fill', adminOnly: true },
  ]}
];

function renderNav() {
  let html = '';
  NAV_CONFIG.forEach(group => {
    const visibleItems = group.items.filter(item => currentUser.role === 'administrator' || !item.adminOnly);
    if (visibleItems.length === 0) return;

    html += `<li class="nav-section-title">${group.section}</li>`;
    visibleItems.forEach(item => {
      html += `
        <li data-route="${item.route}" class="${item.adminOnly ? 'admin-only' : ''}" data-tooltip="${item.label}" data-icon="${item.icon}" data-active-icon="${item.activeIcon}">
          <i class="bi ${item.icon} nav-icon"></i>
          <span class="nav-label">${item.label}</span>
        </li>
      `;
    });
  });
  document.getElementById('nav-list').innerHTML = html;
}

function openProfileModal() {
  const roleMap = {
    'administrator': 'Administrador',
    'agent': 'Agente'
  };
  
  document.getElementById('profile-modal-name').textContent = currentUser.name || 'Usuário';
  document.getElementById('profile-modal-role').textContent = roleMap[currentUser.role] || currentUser.role;
  document.getElementById('profile-modal-account').textContent = currentUser.account_id || '-';
  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('hidden');
}

document.getElementById('profile-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeProfileModal();
  }
});

let autoRefreshInterval = null;

function setAutoRefresh(ms) {
  const indicator = document.getElementById('refresh-indicator');
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  
  if (ms > 0) {
    indicator.style.display = 'inline';
    autoRefreshInterval = setInterval(async () => {
      const route = location.hash.replace('#', '') || (currentUser.role === 'administrator' ? 'homepage' : 'me');
      if (Screens[route] && typeof Screens[route].load === 'function') {
        await Screens[route].load();
        showToast('Dados atualizados (Auto-refresh)', 'success');
      }
    }, ms);
    showToast(`Auto-refresh ativado (${ms / 60000}m)`, 'success');
  } else {
    indicator.style.display = 'none';
    showToast('Auto-refresh desativado', 'success');
  }
  document.getElementById('refresh-dropdown-content').classList.remove('show');
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

function toggleTVMode() {
  const isTV = document.body.classList.toggle('tv-mode');
  
  if (isTV) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (!autoRefreshInterval) {
      setAutoRefresh(60000); 
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
}

document.addEventListener('fullscreenchange', () => {
  const sidebar = document.querySelector('.sidebar');
  if (document.fullscreenElement) {
    sidebar.classList.add('collapsed');
  } else {
    document.body.classList.remove('tv-mode');
    if (localStorage.getItem('sidebar-collapsed') !== 'true') {
      sidebar.classList.remove('collapsed');
    }
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
});

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('monitor-theme', isLight ? 'light' : 'dark');
  
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = isLight ? 'bi bi-sun' : 'bi bi-moon-stars';
  
  const topbarLogo = document.querySelector('.topbar-logo');
  if (topbarLogo) topbarLogo.src = isLight ? 'img/logo.png' : 'img/dark_logo.png';

  updateChartsTheme(isLight);
}

if (localStorage.getItem('monitor-theme') === 'light') {
  document.body.classList.add('light-theme');
  
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = 'bi bi-sun';
  
  const topbarLogo = document.querySelector('.topbar-logo');
  if (topbarLogo) topbarLogo.src = 'img/logo.png';
  
  setTimeout(() => updateChartsTheme(true), 150); 
}

document.addEventListener('click', (e) => {
  const th = e.target.closest('table.sortable th[data-sort]');
  if (!th) return;

  const table = th.closest('table');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const type = th.dataset.sort;
  const index = Array.from(th.parentNode.children).indexOf(th);
  
  const asc = !th.classList.contains('sorted-asc');
  table.querySelectorAll('th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');

  rows.sort((a, b) => {
    let valA = a.children[index].textContent.trim();
    let valB = b.children[index].textContent.trim();

    if (type === 'number') {
      valA = parseFloat(valA.replace(/[^\d.-]/g, '')) || 0;
      valB = parseFloat(valB.replace(/[^\d.-]/g, '')) || 0;
    } else if (type === 'time') {
      const parseTime = (str) => {
        const match = str.match(/(?:(-)?(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m)?/);
        if (!match) return 0;
        const sign = match[1] ? -1 : 1;
        const d = parseInt(match[2] || 0) * 1440;
        const h = parseInt(match[3] || 0) * 60;
        const m = parseInt(match[4] || 0);
        return sign * (d + h + m);
      };
      valA = parseTime(valA);
      valB = parseTime(valB);
    } else {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = '';
  rows.forEach(row => tbody.appendChild(row));
});

function setupSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const topbarLogo = document.querySelector('.topbar-logo');
  
  const toggleSidebar = () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
    
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
  };

  if (localStorage.getItem('sidebar-collapsed') === 'true') sidebar.classList.add('collapsed');
  
  if(toggle) toggle.addEventListener('click', toggleSidebar);
  if(topbarLogo) topbarLogo.addEventListener('click', toggleSidebar);
}

function setupNav() {
  document.querySelectorAll('#nav-list li[data-route]').forEach(li => {
    li.addEventListener('click', () => { location.hash = li.dataset.route; });
  });
  window.addEventListener('hashchange', renderRoute);
}

// ===== Bug Report Widget =====
const BUG_MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

document.body.insertAdjacentHTML('beforeend', `
  <div id="bug-report-modal" class="modal hidden">
    <div class="modal-content" style="max-width: 480px;">
      <button class="modal-close" onclick="closeBugReportModal()">&times;</button>
      <h3><i class="bi bi-bug"></i> Reportar um problema</h3>
      <p class="muted-text" style="margin-top: -6px;">Descreva o que aconteceu. Você pode anexar um print.</p>

      <textarea id="bug-report-text" rows="4" maxlength="300" placeholder="O que deu errado?" style="width: 100%; margin: 12px 0 4px 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: inherit; resize: vertical;"></textarea>
      <div style="text-align: right; margin-bottom: 8px;">
        <span class="muted-text" id="bug-report-char-count" style="font-size: 0.8em;">0/300</span>
      </div>

      <div id="bug-report-drop" style="border: 1px dashed var(--border); border-radius: 8px; padding: 14px; text-align: center; cursor: pointer; margin-bottom: 12px;">
        <input type="file" id="bug-report-file" accept="image/*" style="display:none;">
        <div id="bug-report-preview-wrap" style="display:none; margin-bottom: 8px;">
          <img id="bug-report-preview" style="max-width: 100%; max-height: 160px; border-radius: 6px;">
        </div>
        <span class="muted-text" id="bug-report-file-label"><i class="bi bi-paperclip"></i> Clique, arraste ou cole (Ctrl+V) um print aqui</span>
      </div>

      <button onclick="submitBugReport()" style="width: 100%;">Enviar report</button>
    </div>
  </div>
`);

let bugReportScreenshot = null;

function openBugReportModal() {
  document.getElementById('bug-report-modal').classList.remove('hidden');
}

function closeBugReportModal() {
  document.getElementById('bug-report-modal').classList.add('hidden');
  document.getElementById('bug-report-text').value = '';
  document.getElementById('bug-report-char-count').textContent = '0/300';
  bugReportScreenshot = null;
  document.getElementById('bug-report-preview-wrap').style.display = 'none';
  document.getElementById('bug-report-file-label').textContent = 'Clique, arraste ou cole (Ctrl+V) um print aqui';
  document.getElementById('bug-report-file').value = '';
}

function handleBugScreenshotFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > BUG_MAX_IMAGE_BYTES) {
    showToast('Imagem muito grande (máx. 2MB)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    bugReportScreenshot = reader.result;
    document.getElementById('bug-report-preview').src = bugReportScreenshot;
    document.getElementById('bug-report-preview-wrap').style.display = 'block';
    document.getElementById('bug-report-file-label').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

document.getElementById('bug-report-text').addEventListener('input', (e) => {
  document.getElementById('bug-report-char-count').textContent = `${e.target.value.length}/300`;
});
document.getElementById('bug-report-modal').addEventListener('click', function (e) {
  if (e.target === this) closeBugReportModal();
});
document.getElementById('bug-report-drop').addEventListener('click', () => {
  document.getElementById('bug-report-file').click();
});
document.getElementById('bug-report-file').addEventListener('change', (e) => {
  handleBugScreenshotFile(e.target.files[0]);
});
document.getElementById('bug-report-drop').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('bug-report-drop').addEventListener('drop', (e) => {
  e.preventDefault();
  handleBugScreenshotFile(e.dataTransfer.files[0]);
});
document.addEventListener('paste', (e) => {
  const modal = document.getElementById('bug-report-modal');
  if (modal.classList.contains('hidden')) return;
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (item) handleBugScreenshotFile(item.getAsFile());
});

async function submitBugReport() {
  const description = document.getElementById('bug-report-text').value.trim();
  if (!description) {
    showToast('Descreva o problema antes de enviar', 'error');
    return;
  }
  try {
    const res = await fetch('/monitor/api/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        screenshot: bugReportScreenshot,
        route: location.hash.replace('#', '') || 'home',
      }),
    });
    if (!res.ok) throw new Error('falha ao enviar');
    showToast('Report enviado, obrigado!');
    closeBugReportModal();
  } catch (err) {
    showToast('Erro ao enviar report', 'error');
  }
}

// ==========================================
// COMMAND PALETTE (CTRL+K)
// ==========================================

const COMMANDS = [
  // Navegação
  { id: 'nav-home', icon: 'bi-house-door', label: 'Ir para Início', type: 'Navegação', action: () => location.hash = 'home' },
  { id: 'nav-today', icon: 'bi-graph-up', label: 'Ir para Visão Hoje', type: 'Navegação', action: () => location.hash = 'today' },
  { id: 'nav-overview', icon: 'bi-speedometer2', label: 'Ir para Volume', type: 'Navegação', action: () => location.hash = 'overview' },
  { id: 'nav-sla', icon: 'bi-shield-check', label: 'Ir para SLA', type: 'Navegação', action: () => location.hash = 'sla' },
  { id: 'nav-agents', icon: 'bi-people', label: 'Ir para Agentes', type: 'Navegação', action: () => location.hash = 'agents' },
  { id: 'nav-settings', icon: 'bi-gear', label: 'Ir para Configurações', type: 'Navegação', action: () => location.hash = 'settings' },
  
  // Ações Rápidas
  { id: 'action-pdf', icon: 'bi-file-earmark-pdf', label: 'Exportar Relatório PDF', type: 'Ação', action: () => { if(typeof exportToPDF === 'function') exportToPDF(); else showToast('Função indisponível', 'error'); } },
  { id: 'action-csv', icon: 'bi-file-earmark-spreadsheet', label: 'Exportar Dados da Tela (CSV)', type: 'Ação', action: () => { if(typeof exportToCSV === 'function') exportToCSV(); else showToast('Função indisponível', 'error'); } },
  { id: 'action-theme', icon: 'bi-moon-stars', label: 'Alternar Tema (Claro/Escuro)', type: 'Ação', action: toggleTheme },
  { id: 'action-full', icon: 'bi-arrows-fullscreen', label: 'Alternar Tela Cheia', type: 'Ação', action: toggleFullScreen },
  { id: 'action-tv', icon: 'bi-display', label: 'Ativar Modo TV (NOC)', type: 'Ação', action: toggleTVMode },
  { id: 'action-bugreport', icon: 'bi-bug', label: 'Reportar um Problema', type: 'Ação', action: () => openBugReportModal() },
  { id: 'action-logout', icon: 'bi-box-arrow-right', label: 'Sair do Sistema (Logout)', type: 'Ação', action: logout },
];

// Injeta o HTML da Palette no Body
document.body.insertAdjacentHTML('beforeend', `
  <div id="cmd-backdrop" class="cmd-backdrop">
    <div class="cmd-palette" id="cmd-palette">
      <div class="cmd-input-wrapper">
        <i class="bi bi-search"></i>
        <input type="text" id="cmd-input" placeholder="Busque por telas, ações ou exportações..." autocomplete="off">
      </div>
      <div id="cmd-results" class="cmd-results"></div>
      <div class="cmd-footer">
        <div><kbd>↑</kbd> <kbd>↓</kbd> Navegar</div>
        <div><kbd>Enter</kbd> Selecionar</div>
        <div><kbd>Esc</kbd> Fechar</div>
      </div>
    </div>
  </div>
`);

const cmdBackdrop = document.getElementById('cmd-backdrop');
const cmdInput = document.getElementById('cmd-input');
const cmdResults = document.getElementById('cmd-results');
let cmdSelectedIndex = 0;
let filteredCommands = [];

function openCmd() {
  cmdBackdrop.classList.add('show');
  cmdInput.value = '';
  renderCmdResults('');
  setTimeout(() => cmdInput.focus(), 10);
}

function closeCmd() {
  cmdBackdrop.classList.remove('show');
  cmdInput.blur();
}

function renderCmdResults(query) {
  const term = query.toLowerCase();
  
  // Filtra por permissão (Esconde navegação admin se for agente)
  let available = COMMANDS;
  if (currentUser && currentUser.role !== 'administrator') {
    const adminRoutes = ['nav-today', 'nav-overview', 'nav-sla', 'nav-agents', 'nav-settings'];
    available = COMMANDS.filter(c => !adminRoutes.includes(c.id));
  }

  filteredCommands = available.filter(cmd => 
    cmd.label.toLowerCase().includes(term) || cmd.type.toLowerCase().includes(term)
  );

  cmdSelectedIndex = 0;
  
  if (filteredCommands.length === 0) {
    cmdResults.innerHTML = `<div class="empty-state" style="padding: 24px;"><i class="bi bi-search" style="font-size: 1.5rem; opacity: 0.5;"></i><span style="font-size: 0.9rem;">Nenhum comando encontrado</span></div>`;
    return;
  }

  cmdResults.innerHTML = filteredCommands.map((cmd, idx) => `
    <div class="cmd-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}">
      <i class="bi ${cmd.icon}"></i>
      <span>${cmd.label}</span>
      <span class="cmd-item-type">${cmd.type}</span>
    </div>
  `).join('');

  // Adiciona evento de clique direto nos itens renderizados
  document.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => {
      executeCmd(Number(item.dataset.index));
    });
    item.addEventListener('mouseenter', () => {
      updateCmdSelection(Number(item.dataset.index));
    });
  });
}

function updateCmdSelection(newIndex) {
  const items = document.querySelectorAll('.cmd-item');
  if (items.length === 0) return;
  
  items[cmdSelectedIndex]?.classList.remove('selected');
  cmdSelectedIndex = newIndex;
  
  if (cmdSelectedIndex < 0) cmdSelectedIndex = items.length - 1;
  if (cmdSelectedIndex >= items.length) cmdSelectedIndex = 0;
  
  const selectedItem = items[cmdSelectedIndex];
  if (selectedItem) {
    selectedItem.classList.add('selected');
    selectedItem.scrollIntoView({ block: 'nearest' });
  }
}

function executeCmd(index) {
  if (filteredCommands[index]) {
    closeCmd();
    filteredCommands[index].action();
  }
}

// Listeners
document.addEventListener('keydown', (e) => {
  // Ctrl+K ou Cmd+K para abrir
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdBackdrop.classList.contains('show') ? closeCmd() : openCmd();
  }
  
  if (!cmdBackdrop.classList.contains('show')) return;

  if (e.key === 'Escape') {
    closeCmd();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    updateCmdSelection(cmdSelectedIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    updateCmdSelection(cmdSelectedIndex - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCmd(cmdSelectedIndex);
  }
});

cmdInput.addEventListener('input', (e) => renderCmdResults(e.target.value));

cmdBackdrop.addEventListener('click', (e) => {
  if (e.target === cmdBackdrop) closeCmd();
});
