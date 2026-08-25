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
    if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = textColor;
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

function fmt(n) { return n === null || n === undefined ? '-' : Number(n).toFixed(1); }
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
  if (!res.ok) { window.location.href = '/monitor-ui/login.html'; return null; }
  return res.json();
}

function logout() {
  fetch('/monitor/api/logout', {method: 'POST'}).then(() => window.location.href = '/monitor-ui/login.html');
}

document.body.insertAdjacentHTML('beforeend', `
  <div id="global-loader" class="fixed inset-0 bg-bg/80 backdrop-blur-[2px] flex justify-center items-center z-[9999] transition-opacity duration-300 opacity-0 pointer-events-none">
    <div class="w-10 h-10 border-4 border-border border-t-accent rounded-full animate-spin"></div>
  </div>
  <div id="toast-container" class="fixed bottom-6 right-6 flex flex-col gap-2.5 z-[10000]"></div>
`);

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icon = type === 'success' ? 'bi-check-circle text-accent-green' : 'bi-x-circle text-accent-red';
  const borderColor = type === 'success' ? 'border-accent-green' : 'border-accent-red';
  
  toast.className = `bg-panel-light border-l-4 ${borderColor} text-text px-5 py-4 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.3)] transform translate-x-[120%] transition-transform duration-300 flex items-center gap-3 font-medium text-sm`;
  toast.innerHTML = `<i class="bi ${icon} text-lg"></i> <span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.remove('translate-x-[120%]'), 10);
  setTimeout(() => {
    toast.classList.add('translate-x-[120%]');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function renderRoute() {
  const rawRoute = location.hash.replace('#', '') || 'home';
  const [route, routeParam] = rawRoute.split('/');
  window.__routeParam = routeParam || null;

  const allowedForAgents = ['home', 'me', 'conversations'];
  let safeRoute = route;
  if (currentUser.role !== 'administrator' && !allowedForAgents.includes(route)) safeRoute = 'home';

  document.querySelectorAll('#nav-list li[data-route]').forEach(li => {
    const isActive = li.dataset.route === safeRoute;
    const iconEl = li.querySelector('.nav-icon');
    
    if (isActive) {
      li.classList.add('text-text', 'border-l-[3px]', 'border-accent', 'bg-panel-light');
      li.classList.remove('text-muted');
      if (iconEl) {
        iconEl.classList.remove(li.dataset.icon);
        iconEl.classList.add(li.dataset.activeIcon, 'text-accent');
      }
    } else {
      li.classList.remove('text-text', 'border-l-[3px]', 'border-accent', 'bg-panel-light');
      li.classList.add('text-muted');
      if (iconEl) {
        iconEl.classList.remove(li.dataset.activeIcon, 'text-accent');
        iconEl.classList.add(li.dataset.icon);
      }
    }
  });

  const content = document.getElementById('content');
  const loader = document.getElementById('global-loader');

  if (!Screens[safeRoute]) { location.hash = 'home'; return; }

  loader.classList.remove('opacity-0');
  content.style.opacity = '0';

  content.innerHTML = Screens[safeRoute].template;

  try {
    await Screens[safeRoute].load();
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar dados da tela', 'error');
  } finally {
    loader.classList.add('opacity-0');
    setTimeout(() => {
      content.style.transition = 'opacity 0.4s ease';
      content.style.opacity = '1';
    }, 50);
  }
}

document.addEventListener('click', (e) => {
  const userDropdown = document.getElementById('user-dropdown-content');
  const exportDropdown = document.getElementById('export-dropdown-content');
  const refreshDropdown = document.getElementById('refresh-dropdown-content');

  const toggleDrop = (targetEl, btnId) => {
    if (e.target.closest(`#${btnId}`)) {
      targetEl.classList.toggle('hidden'); targetEl.classList.toggle('flex');
    } else if (targetEl && !targetEl.classList.contains('hidden')) {
      targetEl.classList.add('hidden'); targetEl.classList.remove('flex');
    }
  };

  toggleDrop(userDropdown, 'user-menu-btn');
  toggleDrop(exportDropdown, 'export-btn');
  toggleDrop(refreshDropdown, 'auto-refresh-btn');
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

    html += `<li class="text-[0.70rem] text-[#636782] uppercase font-bold tracking-wider px-[20px] pt-[20px] pb-2 pointer-events-none group-[.collapsed]:hidden">${group.section}</li>`;
    visibleItems.forEach(item => {
      html += `
        <li data-route="${item.route}" data-tooltip="${item.label}" data-icon="${item.icon}" data-active-icon="${item.activeIcon}"
            class="flex items-center gap-4 px-5 py-2.5 cursor-pointer text-muted text-[0.88rem] whitespace-nowrap transition-all duration-300 hover:bg-panel-light hover:text-text hover:translate-x-1 hover:border-l-[3px] hover:border-accent/50 group-[.collapsed]:justify-center group-[.collapsed]:px-0 group-[.collapsed]:py-3.5 group-[.collapsed]:hover:translate-x-0 relative overflow-hidden">
          <div class="flex items-center justify-center w-6 shrink-0 group-[.collapsed]:w-full transition-all duration-300">
            <i class="bi ${item.icon} nav-icon text-[1.25rem] transition-all duration-300 group-[.collapsed]:text-[1.5rem]"></i>
          </div>
          <span class="nav-label transition-opacity duration-300 group-[.collapsed]:opacity-0 group-[.collapsed]:absolute group-[.collapsed]:pointer-events-none truncate flex-1">${item.label}</span>
        </li>
      `;
    });
  });
  document.getElementById('nav-list').innerHTML = html;
}

function openProfileModal() {
  const roleMap = { 'administrator': 'Administrador', 'agent': 'Agente' };
  document.getElementById('profile-modal-name').textContent = currentUser.name || 'Usuário';
  document.getElementById('profile-modal-role').textContent = roleMap[currentUser.role] || currentUser.role;
  document.getElementById('profile-modal-account').textContent = currentUser.account_id || '-';
  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); }
document.getElementById('profile-modal').addEventListener('click', function(e) { if (e.target === this) closeProfileModal(); });

let autoRefreshInterval = null;
function setAutoRefresh(ms) {
  const indicator = document.getElementById('refresh-indicator');
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  
  if (ms > 0) {
    indicator.classList.remove('hidden');
    autoRefreshInterval = setInterval(async () => {
      const route = location.hash.replace('#', '') || (currentUser.role === 'administrator' ? 'homepage' : 'me');
      if (Screens[route] && typeof Screens[route].load === 'function') {
        await Screens[route].load();
        showToast('Dados atualizados (Auto-refresh)', 'success');
      }
    }, ms);
    showToast(`Auto-refresh ativado (${ms / 60000}m)`, 'success');
  } else {
    indicator.classList.add('hidden');
    showToast('Auto-refresh desativado', 'success');
  }
}

// Lógica para minimizar painéis, kpis e gráficos (Req 8)
window.togglePanel = function(btnElement) {
  const card = btnElement.closest('.panel-card');
  const icon = btnElement.querySelector('.toggle-icon');
  
  card.classList.toggle('panel-collapsed');
  if (card.classList.contains('panel-collapsed')) {
    icon.classList.add('rotate-180');
  } else {
    icon.classList.remove('rotate-180');
  }
};

window.handleDateFilterClick = function(containerId, clickedBtnId, storageKey) {
  const container = document.getElementById(containerId);
  if(!container) return;
  
  // Remove classe ativa de todos
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('bg-panel', 'border-accent', 'text-text', 'glow-border');
    btn.classList.add('bg-transparent', 'border-transparent', 'text-muted');
  });
  
  // Adiciona apenas no clicado
  const activeBtn = document.getElementById(clickedBtnId);
  if(activeBtn) {
    activeBtn.classList.remove('bg-transparent', 'border-transparent', 'text-muted');
    activeBtn.classList.add('bg-panel', 'border-accent', 'text-text', 'glow-border');
  }
  
  if(storageKey) localStorage.setItem(storageKey, clickedBtnId);
};

function toggleFullScreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else if (document.exitFullscreen) document.exitFullscreen();
}

function toggleTVMode() {
  const isTV = document.body.classList.toggle('tv-mode');
  if (isTV) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!autoRefreshInterval) setAutoRefresh(60000); 
  } else {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
}

document.addEventListener('fullscreenchange', () => {
  const sidebar = document.getElementById('sidebar');
  if (document.fullscreenElement) {
    sidebar.classList.add('collapsed');
  } else {
    document.body.classList.remove('tv-mode');
    if (localStorage.getItem('sidebar-collapsed') !== 'true') sidebar.classList.remove('collapsed');
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
  const sidebar = document.getElementById('sidebar');
  const topbarLogo = document.querySelector('.topbar-logo');
  
  const toggleSidebar = () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
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
const BUG_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
document.body.insertAdjacentHTML('beforeend', `
  <div id="bug-report-modal" class="hidden fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-5">
    <div class="bg-panel border border-border rounded-2xl w-full max-w-[480px] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.6)] relative">
      <button class="absolute top-4 right-5 text-muted hover:text-text text-2xl" onclick="closeBugReportModal()">&times;</button>
      <h3 class="mt-0 mb-1 text-lg font-semibold flex items-center gap-2 border-b border-border pb-4"><i class="bi bi-bug text-accent-red"></i> Reportar um problema</h3>
      <p class="text-muted text-sm mt-2 mb-4">Descreva o que aconteceu. Você pode anexar um print.</p>
      <textarea id="bug-report-text" rows="4" maxlength="300" placeholder="O que deu errado?" 
        class="w-full mt-2 mb-1 p-3 rounded-lg border border-border bg-input-bg text-text text-sm resize-y focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"></textarea>
      <div class="text-right mb-3"><span class="text-muted text-xs font-medium" id="bug-report-char-count">0/300</span></div>
      <div id="bug-report-drop" class="border border-dashed border-border hover:border-muted rounded-xl p-4 text-center cursor-pointer mb-4 transition-colors bg-white/5">
        <input type="file" id="bug-report-file" accept="image/*" class="hidden">
        <div id="bug-report-preview-wrap" class="hidden mb-2">
          <img id="bug-report-preview" class="max-w-full max-h-[160px] rounded-lg mx-auto shadow-md">
        </div>
        <span class="text-muted text-sm font-medium" id="bug-report-file-label"><i class="bi bi-paperclip mr-1"></i> Clique, arraste ou cole um print</span>
      </div>
      <button onclick="submitBugReport()" class="w-full bg-accent hover:bg-accent-hover text-white py-2.5 rounded-lg font-semibold transition-colors shadow-md">Enviar report</button>
    </div>
  </div>
`);

let bugReportScreenshot = null;
function openBugReportModal() { document.getElementById('bug-report-modal').classList.remove('hidden'); }
function closeBugReportModal() {
  document.getElementById('bug-report-modal').classList.add('hidden');
  document.getElementById('bug-report-text').value = '';
  document.getElementById('bug-report-char-count').textContent = '0/300';
  bugReportScreenshot = null;
  document.getElementById('bug-report-preview-wrap').classList.add('hidden');
  document.getElementById('bug-report-file-label').innerHTML = '<i class="bi bi-paperclip mr-1"></i> Clique, arraste ou cole um print';
  document.getElementById('bug-report-file').value = '';
}

function handleBugScreenshotFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > BUG_MAX_IMAGE_BYTES) return showToast('Imagem muito grande (máx. 2MB)', 'error');
  const reader = new FileReader();
  reader.onload = () => {
    bugReportScreenshot = reader.result;
    document.getElementById('bug-report-preview').src = bugReportScreenshot;
    document.getElementById('bug-report-preview-wrap').classList.remove('hidden');
    document.getElementById('bug-report-file-label').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

document.getElementById('bug-report-text').addEventListener('input', (e) => document.getElementById('bug-report-char-count').textContent = `${e.target.value.length}/300`);
document.getElementById('bug-report-modal').addEventListener('click', function (e) { if (e.target === this) closeBugReportModal(); });
document.getElementById('bug-report-drop').addEventListener('click', () => document.getElementById('bug-report-file').click());
document.getElementById('bug-report-file').addEventListener('change', (e) => handleBugScreenshotFile(e.target.files[0]));
document.getElementById('bug-report-drop').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('bug-report-drop').addEventListener('drop', (e) => { e.preventDefault(); handleBugScreenshotFile(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  if (document.getElementById('bug-report-modal').classList.contains('hidden')) return;
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (item) handleBugScreenshotFile(item.getAsFile());
});

async function submitBugReport() {
  const description = document.getElementById('bug-report-text').value.trim();
  if (!description) return showToast('Descreva o problema antes de enviar', 'error');
  try {
    const res = await fetch('/monitor/api/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, screenshot: bugReportScreenshot, route: location.hash.replace('#', '') || 'home' }),
    });
    if (!res.ok) throw new Error('falha ao enviar');
    showToast('Report enviado, obrigado!');
    closeBugReportModal();
  } catch (err) { showToast('Erro ao enviar report', 'error'); }
}

// ===== COMMAND PALETTE =====
const COMMANDS = [
  { id: 'nav-home', icon: 'bi-house-door', label: 'Ir para Início', type: 'Navegação', action: () => location.hash = 'home' },
  { id: 'nav-today', icon: 'bi-graph-up', label: 'Ir para Visão Hoje', type: 'Navegação', action: () => location.hash = 'today' },
  { id: 'nav-overview', icon: 'bi-speedometer2', label: 'Ir para Volume', type: 'Navegação', action: () => location.hash = 'overview' },
  { id: 'nav-sla', icon: 'bi-shield-check', label: 'Ir para SLA', type: 'Navegação', action: () => location.hash = 'sla' },
  { id: 'nav-agents', icon: 'bi-people', label: 'Ir para Agentes', type: 'Navegação', action: () => location.hash = 'agents' },
  { id: 'nav-settings', icon: 'bi-gear', label: 'Ir para Configurações', type: 'Navegação', action: () => location.hash = 'settings' },
  { id: 'action-pdf', icon: 'bi-file-earmark-pdf', label: 'Exportar Relatório PDF', type: 'Ação', action: () => { if(typeof exportToPDF === 'function') exportToPDF(); else showToast('Função indisponível', 'error'); } },
  { id: 'action-csv', icon: 'bi-file-earmark-spreadsheet', label: 'Exportar Dados da Tela (CSV)', type: 'Ação', action: () => { if(typeof exportToCSV === 'function') exportToCSV(); else showToast('Função indisponível', 'error'); } },
  { id: 'action-theme', icon: 'bi-moon-stars', label: 'Alternar Tema (Claro/Escuro)', type: 'Ação', action: toggleTheme },
  { id: 'action-full', icon: 'bi-arrows-fullscreen', label: 'Alternar Tela Cheia', type: 'Ação', action: toggleFullScreen },
  { id: 'action-tv', icon: 'bi-display', label: 'Ativar Modo TV (NOC)', type: 'Ação', action: toggleTVMode },
  { id: 'action-bugreport', icon: 'bi-bug', label: 'Reportar um Problema', type: 'Ação', action: openBugReportModal },
  { id: 'action-logout', icon: 'bi-box-arrow-right', label: 'Sair do Sistema (Logout)', type: 'Ação', action: logout },
];

document.body.insertAdjacentHTML('beforeend', `
  <div id="cmd-backdrop" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex justify-center pt-[12vh] opacity-0 pointer-events-none transition-opacity duration-200">
    <div id="cmd-palette" class="bg-panel w-[90%] max-w-[600px] max-h-[80vh] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-border flex flex-col overflow-hidden scale-95 transition-transform duration-200">
      <div class="flex items-center px-6 py-4 border-b border-border">
        <i class="bi bi-search text-muted text-xl mr-4"></i>
        <input type="text" id="cmd-input" placeholder="Busque por telas, ações ou exportações..." autocomplete="off" class="flex-1 bg-transparent border-none text-text text-lg outline-none placeholder-muted/60">
      </div>
      <div id="cmd-results" class="flex-1 overflow-y-auto p-3 flex flex-col gap-1 max-h-[350px]"></div>
      <div class="px-6 py-3 bg-panel-light border-t border-border flex gap-5 text-xs text-muted font-medium">
        <div class="flex items-center gap-1.5"><kbd class="bg-panel border border-border px-1.5 rounded text-text">↑</kbd><kbd class="bg-panel border border-border px-1.5 rounded text-text">↓</kbd> Navegar</div>
        <div class="flex items-center gap-1.5"><kbd class="bg-panel border border-border px-1.5 rounded text-text">Enter</kbd> Selecionar</div>
        <div class="flex items-center gap-1.5"><kbd class="bg-panel border border-border px-1.5 rounded text-text">Esc</kbd> Fechar</div>
      </div>
    </div>
  </div>
`);

const cmdBackdrop = document.getElementById('cmd-backdrop');
const cmdPalette = document.getElementById('cmd-palette');
const cmdInput = document.getElementById('cmd-input');
const cmdResults = document.getElementById('cmd-results');
let cmdSelectedIndex = 0;
let filteredCommands = [];

function openCmd() {
  cmdBackdrop.classList.remove('opacity-0', 'pointer-events-none');
  cmdPalette.classList.replace('scale-95', 'scale-100');
  cmdInput.value = '';
  renderCmdResults('');
  setTimeout(() => cmdInput.focus(), 10);
}
function closeCmd() {
  cmdBackdrop.classList.add('opacity-0', 'pointer-events-none');
  cmdPalette.classList.replace('scale-100', 'scale-95');
  cmdInput.blur();
}

function renderCmdResults(query) {
  const term = query.toLowerCase();
  let available = COMMANDS;
  if (currentUser && currentUser.role !== 'administrator') {
    const adminRoutes = ['nav-today', 'nav-overview', 'nav-sla', 'nav-agents', 'nav-settings'];
    available = COMMANDS.filter(c => !adminRoutes.includes(c.id));
  }
  filteredCommands = available.filter(cmd => cmd.label.toLowerCase().includes(term) || cmd.type.toLowerCase().includes(term));
  cmdSelectedIndex = 0;
  
  if (filteredCommands.length === 0) {
    cmdResults.innerHTML = `<div class="p-6 text-center text-muted flex flex-col items-center gap-2"><i class="bi bi-search text-2xl opacity-50"></i><span class="text-sm">Nenhum comando encontrado</span></div>`;
    return;
  }
  cmdResults.innerHTML = filteredCommands.map((cmd, idx) => {
    const isSelected = idx === 0 ? 'bg-panel-light text-text border-l-4 border-accent rounded-r-lg rounded-l-sm' : 'text-muted rounded-lg border-l-4 border-transparent';
    return `
    <div class="cmd-item flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-panel-light hover:text-text ${isSelected}" data-index="${idx}">
      <i class="bi ${cmd.icon} text-lg"></i>
      <span class="font-medium text-[0.95rem]">${cmd.label}</span>
      <span class="ml-auto text-[0.7rem] uppercase tracking-wider bg-muted/15 px-2 py-1 rounded-md">${cmd.type}</span>
    </div>`;
  }).join('');

  document.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => executeCmd(Number(item.dataset.index)));
    item.addEventListener('mouseenter', () => updateCmdSelection(Number(item.dataset.index)));
  });
}

function updateCmdSelection(newIndex) {
  const items = document.querySelectorAll('.cmd-item');
  if (items.length === 0) return;
  items[cmdSelectedIndex]?.classList.remove('bg-panel-light', 'text-text', 'border-accent', 'rounded-r-lg', 'rounded-l-sm');
  items[cmdSelectedIndex]?.classList.add('text-muted', 'rounded-lg', 'border-transparent');
  cmdSelectedIndex = newIndex;
  if (cmdSelectedIndex < 0) cmdSelectedIndex = items.length - 1;
  if (cmdSelectedIndex >= items.length) cmdSelectedIndex = 0;
  const selectedItem = items[cmdSelectedIndex];
  if (selectedItem) {
    selectedItem.classList.add('bg-panel-light', 'text-text', 'border-accent', 'rounded-r-lg', 'rounded-l-sm');
    selectedItem.classList.remove('text-muted', 'rounded-lg', 'border-transparent');
    selectedItem.scrollIntoView({ block: 'nearest' });
  }
}

function executeCmd(index) { if (filteredCommands[index]) { closeCmd(); filteredCommands[index].action(); } }

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdBackdrop.classList.contains('opacity-0') ? openCmd() : closeCmd(); }
  if (cmdBackdrop.classList.contains('opacity-0')) return;
  if (e.key === 'Escape') closeCmd();
  else if (e.key === 'ArrowDown') { e.preventDefault(); updateCmdSelection(cmdSelectedIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); updateCmdSelection(cmdSelectedIndex - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); executeCmd(cmdSelectedIndex); }
});

cmdInput.addEventListener('input', (e) => renderCmdResults(e.target.value));
cmdBackdrop.addEventListener('click', (e) => { if (e.target === cmdBackdrop) closeCmd(); });
