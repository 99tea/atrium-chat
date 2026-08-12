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
  let route = location.hash.replace('#', '') || (currentUser.role === 'administrator' ? 'today' : 'me');
  
  const allowedForAgents = ['me', 'conversations'];
  if (currentUser.role !== 'administrator' && !allowedForAgents.includes(route)) {
    route = 'me';
  }

  document.querySelectorAll('#nav-list li[data-route]').forEach(li => li.classList.toggle('active', li.dataset.route === route));
  
  const content = document.getElementById('content');
  const loader = document.getElementById('global-loader');
  
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

const NAV_CONFIG = [
  { section: 'Visão Geral', items: [
    { route: 'today', label: 'Visão Hoje', icon: 'bi-graph-up', adminOnly: true },
    { route: 'overview', label: 'Dashboard', icon: 'bi-speedometer2', adminOnly: true },
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
