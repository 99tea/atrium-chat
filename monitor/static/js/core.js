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
  if (route !== 'me' && currentUser.role !== 'administrator') route = 'me';

  document.querySelectorAll('#nav-list li').forEach(li => li.classList.toggle('active', li.dataset.route === route));
  
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
  { route: 'today', label: 'Visão Hoje', icon: 'bi-graph-up', adminOnly: true },
  { route: 'overview', label: 'Visão Geral', icon: 'bi-speedometer2', adminOnly: true },
  { route: 'agents', label: 'Visão Agentes', icon: 'bi-people', adminOnly: true },
  { route: 'conversations', label: 'Visão Conversas', icon: 'bi-chat-dots', adminOnly: true },
  { route: 'clients', label: 'Visão Clientes', icon: 'bi-building', adminOnly: true },
  { route: 'me', label: 'Meus Dados', icon: 'bi-person-circle', adminOnly: false },
  { route: 'settings', label: 'Configurações', icon: 'bi-gear', adminOnly: true },
];

function renderNav() {
  document.getElementById('nav-list').innerHTML = NAV_CONFIG.map(item => `
    <li data-route="${item.route}" class="${item.adminOnly ? 'admin-only' : ''}">
      <i class="bi ${item.icon}"></i>
      <span class="nav-label">${item.label}</span>
    </li>
  `).join('');
}

function setupSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const logoHeader = document.querySelector('.sidebar-header h1');
  
  const toggleSidebar = () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
  };

  if (localStorage.getItem('sidebar-collapsed') === 'true') sidebar.classList.add('collapsed');
  
  toggle.addEventListener('click', toggleSidebar);
  if (logoHeader) logoHeader.addEventListener('click', toggleSidebar);
}

function setupNav() {
  document.querySelectorAll('#nav-list li').forEach(li => {
    li.addEventListener('click', () => { location.hash = li.dataset.route; });
  });
  window.addEventListener('hashchange', renderRoute);
}
