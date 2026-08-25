const HOME_CHANNEL_PALETTE = ['#a78bfa', '#fb923c', '#38bdf8', '#f472b6', '#4ade80', '#facc15'];
let HOME_CHANNEL_INFO = {};
let homeCalendarDate = new Date();
let homeClockInterval = null;

async function loadHomeChannelInfo() {
  const channels = await (await fetch('/monitor/api/channels')).json();
  HOME_CHANNEL_INFO = {};
  let paletteIdx = 0;
  channels.forEach(c => {
    if (c.channel_key === 'whatsapp') { HOME_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, color: '#34d399' }; }
    else if (c.channel_key === 'email') { HOME_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, color: '#29a3ff' }; }
    else {
      HOME_CHANNEL_INFO[c.channel_key] = { label: c.channel_name, color: HOME_CHANNEL_PALETTE[paletteIdx % HOME_CHANNEL_PALETTE.length] };
      paletteIdx++;
    }
  });
  HOME_CHANNEL_INFO.other = { label: 'Outros', color: '#9296b8' };
}

const HOME_WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const HOME_MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getMarkedDates() { return JSON.parse(localStorage.getItem('monitor_marked_dates') || '[]'); }
function saveMarkedDates(dates) { localStorage.setItem('monitor_marked_dates', JSON.stringify(dates)); }

window.toggleMarkedDate = function(y, m, d) {
  const dateStr = `${y}-${String(m+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let dates = getMarkedDates();
  if (dates.includes(dateStr)) dates = dates.filter(x => x !== dateStr);
  else dates.push(dateStr);
  saveMarkedDates(dates);
  renderHomeCalendar();
  renderMarkedDatesList();
}

window.renderMarkedDatesList = function() {
  const dates = getMarkedDates().sort();
  const container = document.getElementById('home-marked-dates-list');
  if(!container) return;

  if(dates.length === 0) {
    container.innerHTML = '<div class="p-4 text-center flex flex-col items-center"><i class="bi bi-calendar-event text-2xl text-border mb-2"></i><span class="text-xs text-muted">Nenhum dia marcado</span></div>';
    return;
  }

  container.innerHTML = dates.map(ds => {
    const [y, m, d] = ds.split('-');
    const dateObj = new Date(y, m-1, d);
    const formatted = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
    
    return `
      <div class="flex justify-between items-center px-3 py-2 bg-panel-light border border-border rounded-lg mb-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${isPast ? 'opacity-60' : 'opacity-100'}">
        <div class="flex items-center gap-2">
          <i class="bi bi-bookmark-star-fill text-accent-yellow text-sm"></i>
          <span class="font-semibold text-xs text-text">${formatted}</span>
        </div>
        <button class="p-1 cursor-pointer bg-transparent border-none text-muted hover:text-accent-red transition-colors" onclick="toggleMarkedDate(${y}, ${m-1}, ${d})">
          <i class="bi bi-x-lg text-[0.75rem]"></i>
        </button>
      </div>`;
  }).join('');
}

function homeInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '').toUpperCase();
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
  const markedDates = getMarkedDates();

  document.getElementById('home-cal-title').textContent = `${HOME_MONTH_NAMES[month]} ${year}`;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div></div>`;
  
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === today.getDate();
    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isMarked = markedDates.includes(dateStr);

    let baseClasses = "aspect-square rounded-md flex items-center justify-center text-[0.8rem] cursor-pointer relative transition-all select-none ";
    if (isToday) baseClasses += "bg-accent text-white font-bold glow-border hover:scale-105";
    else if (isMarked) baseClasses += "bg-accent-yellow/10 border border-accent-yellow text-text hover:bg-panel-light hover:scale-105";
    else baseClasses += "bg-bg border border-transparent text-text hover:border-border hover:scale-105";

    let dot = isMarked ? `<span class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-accent-yellow'}"></span>` : '';
    cells += `<div class="${baseClasses}" onclick="toggleMarkedDate(${year}, ${month}, ${d})">${d}${dot}</div>`;
  }
  document.getElementById('home-cal-grid').innerHTML = cells;
}

function setupHomeCalendarNav() {
  document.getElementById('home-cal-prev').onclick = () => { homeCalendarDate = new Date(homeCalendarDate.getFullYear(), homeCalendarDate.getMonth() - 1, 1); renderHomeCalendar(); };
  document.getElementById('home-cal-next').onclick = () => { homeCalendarDate = new Date(homeCalendarDate.getFullYear(), homeCalendarDate.getMonth() + 1, 1); renderHomeCalendar(); };
  document.getElementById('home-cal-today-btn').onclick = () => { homeCalendarDate = new Date(); renderHomeCalendar(); };
}

function homeTaskItem(t) {
  return `
    <div class="group flex items-start gap-3 bg-bg p-3 rounded-lg border border-border transition-all mb-2 cursor-grab hover:border-muted ${t.done ? 'opacity-50' : ''}" data-task-id="${t.id}" draggable="true">
      <input type="checkbox" class="home-task-check mt-0.5 cursor-pointer accent-accent w-4 h-4" ${t.done ? 'checked' : ''}>
      <span class="flex-1 text-[0.85rem] leading-tight ${t.done ? 'text-muted line-through' : 'text-text'}">${t.content}</span>
      <i class="bi bi-x-lg home-task-remove cursor-pointer text-muted opacity-0 hover:text-accent-red transition-all group-hover:opacity-100"></i>
    </div>`;
}

async function loadHomeTasks() {
  const tasks = await fetch('/monitor/api/home/tasks').then(r => r.ok ? r.json() : []).catch(() => []);
  const list = document.getElementById('home-tasks-list');
  list.innerHTML = tasks.length ? tasks.map(homeTaskItem).join('') : '<div class="p-6 text-center"><i class="bi bi-check2-circle text-3xl text-accent-green mb-2"></i><span class="block text-sm text-muted">Tudo limpo!</span></div>';

  list.querySelectorAll('.group[draggable]').forEach(item => {
    item.querySelector('.home-task-check').addEventListener('change', async (e) => {
      await fetch(`/monitor/api/home/tasks/${item.dataset.taskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ done: e.target.checked }) });
      await loadHomeTasks();
    });
    item.querySelector('.home-task-remove').addEventListener('click', async () => {
      await fetch(`/monitor/api/home/tasks/${item.dataset.taskId}`, { method: 'DELETE' });
      await loadHomeTasks();
    });
  });
}

async function addHomeTask() {
  const input = document.getElementById('home-task-input');
  if (!input.value.trim()) return;
  await fetch('/monitor/api/home/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ content: input.value.trim() }) });
  input.value = '';
  await loadHomeTasks();
}

async function loadHomeStats() {
  const stats = await fetch('/monitor/api/home/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  document.getElementById('home-stat-created').textContent = stats.created_today ?? '-';
  document.getElementById('home-stat-resolved').textContent = stats.resolved_today ?? '-';
  document.getElementById('home-stat-agents-online').textContent = stats.agents_online ?? '-';

  const hourly = stats.hourly || [];
  const channelKeys = Object.keys(HOME_CHANNEL_INFO);
  const fullDay = Array.from({ length: 24 }, (_, i) => {
    const found = hourly.find(r => r.hour === i);
    const row = { hour: i.toString().padStart(2, '0') + 'h', resolved: found ? found.resolved : 0 };
    channelKeys.forEach(k => row[k] = found ? (found[`created_${k}`] || 0) : 0);
    return row;
  });

  const createdDatasets = channelKeys.map(k => ({
    label: HOME_CHANNEL_INFO[k].label, data: fullDay.map(r => r[k]), backgroundColor: HOME_CHANNEL_INFO[k].color, stack: 'created', borderRadius: 4, barPercentage: 0.6
  }));

  renderChart('home-chart-hourly', {
    type: 'bar',
    data: { labels: fullDay.map(r => r.hour), datasets: [...createdDatasets, { label: 'Resolvidas', data: fullDay.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: 4, barPercentage: 0.6 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 1, font: { size: 9 } } }
      }
    }
  });
}

Screens.home = {
  template: `
    <div class="flex flex-col gap-6 w-full max-w-[1400px] mx-auto no-scrollbar">
      
      <!-- Top Row: Welcome & Quick KPIs -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Welcome Widget -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex items-center p-5 gap-4 col-span-1">
          <div id="home-avatar" class="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white bg-gradient-to-br from-accent to-accent-red glow-border shrink-0"></div>
          <div class="flex-1 min-w-0">
            <h2 id="home-greeting" class="m-0 text-base font-bold text-text truncate"></h2>
            <div id="home-clock" class="text-xl font-bold text-accent tabular-nums glow-text"></div>
            <p id="home-date" class="m-0 text-xs text-muted truncate"></p>
          </div>
        </div>

        <!-- KPIs -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-5 flex items-center gap-4 hover:border-accent-green/50 transition-colors group col-span-1">
          <div class="w-12 h-12 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center text-xl group-hover:scale-110 transition-transform"><i class="bi bi-inbox"></i></div>
          <div>
            <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider">Criadas Hoje</span>
            <span id="home-stat-created" class="block text-2xl font-bold text-text">-</span>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-5 flex items-center gap-4 hover:border-accent-yellow/50 transition-colors group col-span-1">
          <div class="w-12 h-12 rounded-lg bg-accent-yellow/10 text-accent-yellow flex items-center justify-center text-xl group-hover:scale-110 transition-transform"><i class="bi bi-check2-all"></i></div>
          <div>
            <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider">Resolvidas Hoje</span>
            <span id="home-stat-resolved" class="block text-2xl font-bold text-text">-</span>
          </div>
        </div>

        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm p-5 flex items-center gap-4 hover:border-accent-blue/50 transition-colors group col-span-1 relative overflow-hidden">
          <div class="w-12 h-12 rounded-lg bg-[#29a3ff1a] text-[#29a3ff] flex items-center justify-center text-xl group-hover:scale-110 transition-transform relative">
            <i class="bi bi-headset"></i>
            <span class="absolute top-0 right-0 w-2.5 h-2.5 bg-accent-green rounded-full border border-panel glow-border"></span>
          </div>
          <div>
            <span class="block text-[0.7rem] text-muted font-bold uppercase tracking-wider">Agentes Online</span>
            <span id="home-stat-agents-online" class="block text-2xl font-bold text-text">-</span>
          </div>
        </div>
      </div>

      <!-- Main Row: Chart & Tasks -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Chart Panel -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col lg:col-span-2">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-bar-chart-fill text-accent"></i> Fluxo de Atendimento (Hora)</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content p-5 w-full">
            <div class="relative w-full h-[280px]">
              <canvas id="home-chart-hourly"></canvas>
            </div>
          </div>
        </div>

        <!-- Tasks Panel -->
        <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col lg:col-span-1">
          <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
            <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-check2-square text-accent-yellow"></i> Minhas Tarefas</h3>
            <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
          </div>
          <div class="panel-content flex flex-col flex-1 p-0">
            <div id="home-tasks-list" class="p-4 flex flex-col gap-1 overflow-y-auto max-h-[220px] no-scrollbar"></div>
            <div class="p-4 border-t border-border bg-panel-light/30 mt-auto flex gap-2">
              <input id="home-task-input" type="text" placeholder="Adicionar tarefa..." class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-xs focus:outline-none focus:border-accent">
              <button onclick="addHomeTask()" class="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-lg transition-colors"><i class="bi bi-plus-lg"></i></button>
            </div>
          </div>
        </div>

      </div>

      <!-- Bottom Row: Calendar Panel -->
      <div class="panel-card bg-panel border border-border rounded-xl shadow-sm flex flex-col">
        <div class="px-5 py-4 border-b border-border flex justify-between items-center cursor-pointer select-none" onclick="togglePanel(this)">
          <h3 class="m-0 text-sm font-semibold flex items-center gap-2 text-text"><i class="bi bi-calendar3 text-accent-blue"></i> Calendário & Agenda</h3>
          <button class="text-muted hover:text-text bg-transparent border-none p-1"><i class="bi bi-chevron-up toggle-icon transition-transform"></i></button>
        </div>
        <div class="panel-content p-5">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            <div class="max-w-[320px] mx-auto md:mx-0 w-full">
              <div class="flex justify-between items-center mb-4">
                <button id="home-cal-prev" class="p-1 text-muted hover:text-text transition-colors"><i class="bi bi-chevron-left"></i></button>
                <span id="home-cal-title" class="font-semibold text-sm"></span>
                <button id="home-cal-next" class="p-1 text-muted hover:text-text transition-colors"><i class="bi bi-chevron-right"></i></button>
              </div>
              <div class="grid grid-cols-7 text-center text-xs font-bold text-muted mb-2">
                ${HOME_WEEKDAY_SHORT.map(w => `<div>${w}</div>`).join('')}
              </div>
              <div id="home-cal-grid" class="grid grid-cols-7 gap-1.5 mb-4"></div>
              <button id="home-cal-today-btn" class="w-full py-2 bg-panel-light border border-border rounded-lg text-xs font-medium hover:border-accent transition-colors">Voltar para Hoje</button>
            </div>

            <div class="flex flex-col border-t md:border-t-0 md:border-l border-border pt-5 md:pt-0 md:pl-8 h-full">
              <span class="block text-[0.75rem] text-muted font-bold uppercase tracking-wider mb-4">Datas Marcadas</span>
              <div id="home-marked-dates-list" class="flex-1 overflow-y-auto max-h-[250px] no-scrollbar"></div>
            </div>

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
    renderMarkedDatesList();

    document.getElementById('home-task-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addHomeTask(); });

    await loadHomeChannelInfo();
    await Promise.all([ loadHomeTasks(), loadHomeStats() ]);
  },
};
