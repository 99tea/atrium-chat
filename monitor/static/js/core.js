const charts = {};
const Screens = {};
let currentUser = null;

Chart.defaults.animation.duration = 1200;
Chart.defaults.animation.easing = 'easeOutQuart';
Chart.defaults.font.family = '-apple-system, Helvetica, Arial, sans-serif';

function renderChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
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

// Injeta os containers de Loading e Toasts no body dinamicamente
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
  let route = location.hash.replace('#', '') || (currentUser.role === 'administrator' ? 'homepage' : 'me');
  
  const allowedForAgents = ['me', 'conversations'];
  if (currentUser.role !== 'administrator' && !allowedForAgents.includes(route)) {
    route = 'me';
  }

  document.querySelectorAll('#nav-list li[data-route]').forEach(li => li.classList.toggle('active', li.dataset.route === route));
  
  const content = document.getElementById('content');
  content.classList.remove('fade-in');
  content.classList.add('loading');
  void content.offsetWidth;
  
  content.innerHTML = Screens[route].template;
  
  try {
    await Screens[route].load();
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar dados da tela', 'error');
  } finally {
    content.classList.remove('loading');
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
});

const NAV_CONFIG = [
  { section: 'Visão Geral', items: [
    { route: 'homepage', label: 'Homepage', icon: 'bi-house', adminOnly: true },
    { route: 'today', label: 'Visão Hoje', icon: 'bi-graph-up', adminOnly: true },
    { route: 'overview', label: 'Volume', icon: 'bi-speedometer2', adminOnly: true },
    { route: 'sla', label: 'SLA', icon: 'bi-shield-check', adminOnly: true },
  ]},
  { section: 'Operacional', items: [
    { route: 'agents', label: 'Agentes', icon: 'bi-people', adminOnly: true },
    { route: 'conversations', label: 'Conversas', icon: 'bi-chat-dots', adminOnly: false },
    { route: 'clients', label: 'Clientes', icon: 'bi-building', adminOnly: true },
  ]},
  { section: 'Administração', items: [
    { route: 'me', label: 'Meus Dados', icon: 'bi-person-circle', adminOnly: false },
    { route: 'settings', label: 'Configurações', icon: 'bi-gear', adminOnly: true },
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
        <li data-route="${item.route}" class="${item.adminOnly ? 'admin-only' : ''}" data-tooltip="${item.label}">
          <i class="bi ${item.icon}"></i>
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

document.addEventListener('fullscreenchange', () => {
  const sidebar = document.querySelector('.sidebar');
  if (document.fullscreenElement) {
    sidebar.classList.add('collapsed');
  } else {
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
}

if (localStorage.getItem('monitor-theme') === 'light') {
  document.body.classList.add('light-theme');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = 'bi bi-sun';
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
