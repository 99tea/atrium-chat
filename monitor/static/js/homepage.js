const HOME_CHANNEL_MAP = {
  whatsapp: { label: 'WhatsApp', color: '#34d399' },
  email: { label: 'E-mail', color: '#29a3ff' },
  other: { label: 'Outros', color: '#9296b8' },
};

const HOME_WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const HOME_MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let homeCalendarDate = new Date();
let homeClockInterval = null;

function homeInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function homeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function renderHomeClock() {
  const now = new Date();
  const timeEl = document.getElementById('home-clock');
  const dateEl = document.getElementById('home-date');
  if (!timeEl || !dateEl) return;
  timeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

function renderHomeCalendar() {
  const year = homeCalendarDate.getFullYear();
  const month = homeCalendarDate.getMonth();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  document.getElementById('home-cal-title').textContent = `${HOME_MONTH_NAMES[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="home-cal-cell home-cal-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === today.getDate();
    cells += `<div class="home-cal-cell${isToday ? ' home-cal-today' : ''}">${d}</div>`;
  }

  document.getElementById('home-cal-grid').innerHTML = cells;
}

function setupHomeCalendarNav() {
  document.getElementById('home-cal-prev').onclick = () => {
    homeCalendarDate = new Date(homeCalendarDate.getFullYear(), homeCalendarDate.getMonth() - 1, 1);
    renderHomeCalendar();
  };
  document.getElementById('home-cal-next').onclick = () => {
    homeCalendarDate = new Date(homeCalendarDate.getFullYear(), homeCalendarDate.getMonth() + 1, 1);
    renderHomeCalendar();
  };
  document.getElementById('home-cal-today-btn').onclick = () => {
    homeCalendarDate = new Date();
    renderHomeCalendar();
  };
}

function homeTaskItem(t) {
  return `
    <div class="home-task-item${t.done ? ' home-task-done' : ''}" data-task-id="${t.id}" draggable="true">
      <input type="checkbox" class="home-task-check" ${t.done ? 'checked' : ''}>
      <span class="home-task-content">${t.content}</span>
      <i class="bi bi-x-lg home-task-remove" data-tooltip="Remover"></i>
    </div>`;
}

async function loadHomeTasks() {
  const tasks = await fetch('/monitor/api/home/tasks').then(r => r.ok ? r.json() : []).catch(() => []);
  const list = document.getElementById('home-tasks-list');

  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding: 16px;"><i class="bi bi-check2-circle" style="font-size: 1.4rem;"></i><span>Nenhuma tarefa por aqui</span></div>';
  } else {
    list.innerHTML = tasks.map(homeTaskItem).join('');
  }

  let draggedItem = null;

  list.querySelectorAll('.home-task-item').forEach(item => {
    item.addEventListener('dragstart', function () {
      draggedItem = this;
      setTimeout(() => this.classList.add('dragging'), 0);
    });

    item.addEventListener('dragend', function () {
      this.classList.remove('dragging');
      draggedItem = null;
    });

    item.addEventListener('dragover', function (e) {
      e.preventDefault();
    });

    item.addEventListener('dragenter', function (e) {
      e.preventDefault();
      this.classList.add('drag-over');
    });

    item.addEventListener('dragleave', function () {
      this.classList.remove('drag-over');
    });

    item.addEventListener('drop', function () {
      this.classList.remove('drag-over');
      if (draggedItem && draggedItem !== this) {
        const allItems = [...list.querySelectorAll('.home-task-item')];
        const draggedIndex = allItems.indexOf(draggedItem);
        const droppedIndex = allItems.indexOf(this);

        if (draggedIndex < droppedIndex) {
          this.parentNode.insertBefore(draggedItem, this.nextSibling);
        } else {
          this.parentNode.insertBefore(draggedItem, this);
        }
      }
    });

    item.querySelector('.home-task-check').addEventListener('change', async (e) => {
      const taskId = item.dataset.taskId;
      await fetch(`/monitor/api/home/tasks/${taskId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ done: e.target.checked })
      });
      await loadHomeTasks();
    });

    item.querySelector('.home-task-remove').addEventListener('click', async (e) => {
      const taskId = item.dataset.taskId;
      await fetch(`/monitor/api/home/tasks/${taskId}`, { method: 'DELETE' });
      await loadHomeTasks();
    });
  });
}

async function addHomeTask() {
  const input = document.getElementById('home-task-input');
  const content = input.value.trim();
  if (!content) return;
  await fetch('/monitor/api/home/tasks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ content })
  });
  input.value = '';
  await loadHomeTasks();
}

async function loadHomeStats() {
  const stats = await fetch('/monitor/api/home/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}));

  document.getElementById('home-stat-created').textContent = stats.created_today ?? '-';
  document.getElementById('home-stat-resolved').textContent = stats.resolved_today ?? '-';
  document.getElementById('home-stat-agents-online').textContent = stats.agents_online ?? '-';

  const hourly = stats.hourly || [];
  const fullDay = Array.from({ length: 24 }, (_, i) => {
    const hrStr = i.toString().padStart(2, '0') + ':00';
    const found = hourly.find(r => r.hour === i);
    return {
      hour: hrStr,
      created_whatsapp: found ? found.created_whatsapp : 0,
      created_email: found ? found.created_email : 0,
      created_other: found ? found.created_other : 0,
      resolved: found ? found.resolved : 0,
    };
  });

  renderChart('home-chart-hourly', {
    type: 'bar',
    data: {
      labels: fullDay.map(r => r.hour),
      datasets: [
        { label: 'Criadas WhatsApp', data: fullDay.map(r => r.created_whatsapp), backgroundColor: '#34d399', stack: 'created', borderRadius: 4 },
        { label: 'Criadas E-mail', data: fullDay.map(r => r.created_email), backgroundColor: '#29a3ff', stack: 'created', borderRadius: 4 },
        { label: 'Outros', data: fullDay.map(r => r.created_other), backgroundColor: '#9296b8', stack: 'created', borderRadius: 4 },
        { label: 'Resolvidas', data: fullDay.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: 4 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e8e8ea' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9599a6', maxTicksLimit: 12 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } }
      },
    },
  });
}

Screens.home = {
  template: `
    <div class="home-social-layout">
      
      <!-- Coluna Esquerda -->
      <div class="home-col-left">
        <div class="home-profile-card">
          <div class="home-avatar" id="home-avatar"></div>
          <h2 class="home-greeting" id="home-greeting"></h2>
          <p class="muted-text home-date" id="home-date"></p>
          <div class="home-clock" id="home-clock"></div>
        </div>

        <div class="home-panel">
          <div class="home-panel-header">
            <h3><i class="bi bi-calendar3"></i></h3>
            <div style="display:flex; gap:4px; align-items:center;">
              <button class="home-cal-nav-btn" id="home-cal-prev"><i class="bi bi-chevron-left"></i></button>
              <span id="home-cal-title" style="font-weight: 600; min-width: 90px; text-align: center; font-size: 0.8rem;"></span>
              <button class="home-cal-nav-btn" id="home-cal-next"><i class="bi bi-chevron-right"></i></button>
            </div>
          </div>
          <div class="home-cal-weekdays">
            ${HOME_WEEKDAY_SHORT.map(w => `<div>${w}</div>`).join('')}
          </div>
          <div class="home-cal-grid" id="home-cal-grid"></div>
          <button class="home-cal-today-btn" id="home-cal-today-btn">Hoje</button>
        </div>
      </div>

      <!-- Coluna Central (Feed principal) -->
      <div class="home-col-main">
        <div class="home-feed-row">
          <div class="home-stat-pill">
            <i class="bi bi-inbox" style="color: var(--accent-green);"></i>
            <div>
              <span class="home-stat-value" id="home-stat-created">-</span>
              <span class="home-stat-label">criadas hoje</span>
            </div>
          </div>
          <div class="home-stat-pill">
            <i class="bi bi-check2-all" style="color: var(--accent-yellow);"></i>
            <div>
              <span class="home-stat-value" id="home-stat-resolved">-</span>
              <span class="home-stat-label">resolvidas hoje</span>
            </div>
          </div>
        </div>

        <div class="home-panel">
          <div class="home-panel-header"><h3><i class="bi bi-bar-chart"></i> Conversas por hora</h3></div>
          <div class="canvas-container" style="height: 320px;">
            <canvas id="home-chart-hourly"></canvas>
          </div>
        </div>
      </div>

      <!-- Coluna Direita -->
      <div class="home-col-right">
        <div class="home-panel" style="display: flex; align-items: center; gap: 12px;">
          <span class="home-online-dot"></span>
          <div>
            <span class="home-stat-value" id="home-stat-agents-online" style="font-size: 1.5rem; margin-bottom: 0;">-</span>
            <span class="home-stat-label">agentes online</span>
          </div>
        </div>

        <div class="home-panel home-tasks-panel">
          <div class="home-panel-header" style="border-bottom: none; margin-bottom: 8px;">
            <h3><i class="bi bi-check2-square"></i> Minhas Tarefas</h3>
          </div>
          <div id="home-tasks-list" class="home-tasks-list"></div>
          <div class="home-task-input-row">
            <input id="home-task-input" type="text" placeholder="+ Adicionar um cartão..." maxlength="200">
            <button onclick="addHomeTask()" class="add-task-btn">Salvar</button>
          </div>
        </div>
      </div>

    </div>
  `,
  load: async function () {
    if (homeClockInterval) clearInterval(homeClockInterval);

    document.getElementById('home-avatar').textContent = homeInitials(currentUser.name);
    document.getElementById('home-greeting').textContent = `${homeGreeting()}, ${currentUser.name.split(' ')[0]}!`;

    renderHomeClock();
    homeClockInterval = setInterval(renderHomeClock, 1000);

    homeCalendarDate = new Date();
    renderHomeCalendar();
    setupHomeCalendarNav();

    document.getElementById('home-task-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addHomeTask();
    });

    await Promise.all([
      loadHomeTasks(),
      loadHomeStats(),
    ]);
  },
};
