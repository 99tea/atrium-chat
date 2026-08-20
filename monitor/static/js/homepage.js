const HOME_CHANNEL_MAP = {
  whatsapp: { label: 'WhatsApp', color: '#34d399' },
  email: { label: 'E-mail', color: '#29a3ff' },
  other: { label: 'Outros', color: '#9296b8' },
};

const HOME_WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const HOME_MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let homeCalendarDate = new Date();
let homeClockInterval = null;

// --- FUNÇÕES DA AGENDA PESSOAL (LOCALSTORAGE) ---
function getMarkedDates() {
  return JSON.parse(localStorage.getItem('monitor_marked_dates') || '[]');
}

function saveMarkedDates(dates) {
  localStorage.setItem('monitor_marked_dates', JSON.stringify(dates));
}

window.toggleMarkedDate = function(y, m, d) {
  const dateStr = `${y}-${String(m+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let dates = getMarkedDates();
  
  if (dates.includes(dateStr)) {
    dates = dates.filter(x => x !== dateStr);
  } else {
    dates.push(dateStr);
  }
  
  saveMarkedDates(dates);
  renderHomeCalendar();
  renderMarkedDatesList();
}

window.renderMarkedDatesList = function() {
  const dates = getMarkedDates().sort();
  const container = document.getElementById('home-marked-dates-list');
  if(!container) return;

  if(dates.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 16px 0; text-align: center;"><i class="bi bi-calendar-event" style="font-size: 1.5rem; color: var(--border); margin-bottom: 8px;"></i><span style="font-size: 0.8rem; color: var(--muted); display: block;">Nenhum dia marcado</span></div>';
    return;
  }

  container.innerHTML = dates.map(ds => {
    const [y, m, d] = ds.split('-');
    const dateObj = new Date(y, m-1, d);
    const formatted = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
    
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; transition: transform 0.2s; opacity: ${isPast ? '0.6' : '1'};">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="bi bi-bookmark-star-fill" style="color: var(--accent-yellow); font-size: 0.8rem;"></i>
          <span style="font-weight: 600; font-size: 0.8rem; color: var(--text);">${formatted}</span>
        </div>
        <button class="topbar-btn" style="padding: 2px 6px; border: none; background: transparent; cursor: pointer; color: var(--muted);" onmouseover="this.style.color='var(--accent-red)'" onmouseout="this.style.color='var(--muted)'" onclick="toggleMarkedDate(${y}, ${m-1}, ${d})" data-tooltip="Desmarcar">
          <i class="bi bi-x-lg" style="font-size: 0.75rem;"></i>
        </button>
      </div>`;
  }).join('');
}
// ------------------------------------------------

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
  const markedDates = getMarkedDates();

  document.getElementById('home-cal-title').textContent = `${HOME_MONTH_NAMES[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '';
  // Dias vazios
  for (let i = 0; i < firstDay; i++) {
    cells += `<div style="aspect-ratio: 1; border-radius: 8px; background: transparent;"></div>`;
  }
  
  // Dias do mês
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === today.getDate();
    const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isMarked = markedDates.includes(dateStr);

    let cellStyle = `aspect-ratio: 1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; cursor: pointer; position: relative; transition: all 0.2s ease; user-select: none;`;
    let defaultBg = 'var(--bg)';
    
    if (isToday) {
      cellStyle += ` background: var(--accent); color: #fff; font-weight: 700; box-shadow: 0 4px 10px rgba(143, 22, 27, 0.4); border: 1px solid var(--accent);`;
    } else {
      if (isMarked) {
        defaultBg = 'rgba(255, 194, 71, 0.08)';
        cellStyle += ` background: ${defaultBg}; border: 1px solid var(--accent-yellow); color: var(--text); font-weight: 600;`;
      } else {
        cellStyle += ` background: ${defaultBg}; border: 1px solid var(--border); color: var(--text);`;
      }
    }

    let innerHtml = `${d}`;
    if (isMarked) {
      const dotColor = isToday ? '#fff' : 'var(--accent-yellow)';
      const dotShadow = isToday ? '0 0 4px rgba(255,255,255,0.8)' : '0 0 6px var(--accent-yellow)';
      innerHtml += `<span style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: ${dotColor}; box-shadow: ${dotShadow};"></span>`;
    }

    const hoverIn = isToday ? `this.style.transform='scale(1.05)'` : `this.style.background='var(--panel-light)'; this.style.transform='scale(1.05)'`;
    const hoverOut = isToday ? `this.style.transform='scale(1)'` : `this.style.background='${defaultBg}'; this.style.transform='scale(1)'`;

    cells += `<div style="${cellStyle}" onmouseover="${hoverIn}" onmouseout="${hoverOut}" onclick="toggleMarkedDate(${year}, ${month}, ${d})" title="Clique para marcar/desmarcar">${innerHtml}</div>`;
  }

  const grid = document.getElementById('home-cal-grid');
  grid.style.gap = '6px';
  grid.innerHTML = cells;
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
    <div class="home-task-item${t.done ? ' home-task-done' : ''}" data-task-id="${t.id}" draggable="true" style="display: flex; align-items: flex-start; gap: 10px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border); transition: transform 0.15s, box-shadow 0.15s; margin-bottom: 8px; cursor: grab;">
      <input type="checkbox" class="home-task-check" ${t.done ? 'checked' : ''} style="margin-top: 3px; cursor: pointer; accent-color: var(--accent);">
      <span class="home-task-content" style="flex: 1; font-size: 0.85rem; line-height: 1.4; word-break: break-word; color: ${t.done ? 'var(--muted)' : 'var(--text)'}; text-decoration: ${t.done ? 'line-through' : 'none'};">${t.content}</span>
      <i class="bi bi-x-lg home-task-remove" data-tooltip="Remover" style="cursor: pointer; font-size: 0.9rem; color: var(--muted); padding: 2px;"></i>
    </div>`;
}

async function loadHomeTasks() {
  const tasks = await fetch('/monitor/api/home/tasks').then(r => r.ok ? r.json() : []).catch(() => []);
  const list = document.getElementById('home-tasks-list');

  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding: 16px; height: 100%; display: flex; flex-direction: column; justify-content: center;"><i class="bi bi-check2-circle" style="font-size: 2rem; color: var(--accent-green); margin-bottom: 8px;"></i><span style="font-size: 0.9rem;">Nenhuma tarefa pendente</span></div>';
  } else {
    list.innerHTML = tasks.map(homeTaskItem).join('');
  }

  let draggedItem = null;

  list.querySelectorAll('.home-task-item').forEach(item => {
    item.addEventListener('dragstart', function () {
      draggedItem = this;
      setTimeout(() => {
        this.style.opacity = '0.5';
        this.style.border = '1px dashed var(--accent)';
      }, 0);
    });

    item.addEventListener('dragend', function () {
      this.style.opacity = '1';
      this.style.border = '1px solid var(--border)';
      draggedItem = null;
    });

    item.addEventListener('dragover', function (e) {
      e.preventDefault();
    });

    item.addEventListener('dragenter', function (e) {
      e.preventDefault();
      this.style.borderTop = '2px solid var(--accent)';
    });

    item.addEventListener('dragleave', function () {
      this.style.borderTop = '';
    });

    item.addEventListener('drop', function () {
      this.style.borderTop = '';
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
        { label: 'WhatsApp', data: fullDay.map(r => r.created_whatsapp), backgroundColor: '#34d399', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'E-mail', data: fullDay.map(r => r.created_email), backgroundColor: '#29a3ff', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Outros', data: fullDay.map(r => r.created_other), backgroundColor: '#9296b8', stack: 'created', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: 'Resolvidas', data: fullDay.map(r => r.resolved), backgroundColor: '#ffc247', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.7, categoryPercentage: 0.8 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          position: 'top', 
          align: 'end',
          labels: { boxWidth: 10, usePointStyle: true, padding: 16, font: { size: 11 } } 
        } 
      },
      scales: {
        x: { grid: { display: false, drawBorder: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 } } }
      },
    },
  });
}

Screens.home = {
  template: `
    <div class="home-social-layout" style="height: 100%; display: grid; align-items: stretch; min-height: 0;">
      
      <!-- Coluna Esquerda -->
      <div class="home-col-left" style="display: flex; flex-direction: column; gap: 24px; min-height: 0;">
        
        <div class="home-profile-card" style="flex: none !important; padding: 24px 16px; background: linear-gradient(180deg, var(--panel-light) 0%, var(--panel) 100%); border-top: 4px solid var(--accent); display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);">
          <div class="home-avatar" id="home-avatar" style="width: 72px; height: 72px; font-size: 1.8rem; background: linear-gradient(135deg, var(--accent), var(--accent-red)); box-shadow: 0 4px 12px rgba(143, 22, 27, 0.3); margin-bottom: 16px;"></div>
          <h2 class="home-greeting" id="home-greeting" style="margin: 0 0 4px; font-size: 1.2rem;"></h2>
          <p class="muted-text home-date" id="home-date" style="font-size: 0.85rem; margin: 0;"></p>
          <div class="home-clock" id="home-clock" style="font-size: 1.6rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; margin-top: 16px;"></div>
        </div>

        <div class="home-panel" style="flex: 1; display: flex; flex-direction: column; background: var(--panel); border-radius: 12px; border: 1px solid var(--border); padding: 16px; min-height: 0;">
          
          <div class="home-panel-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <h3 style="margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;"><i class="bi bi-calendar3" style="color: var(--accent-blue); margin-right: 4px;"></i> </h3>
            <div style="display:flex; gap:2px; align-items:center; flex-shrink: 0;">
              <button class="home-cal-nav-btn" id="home-cal-prev" style="padding: 2px 6px; border: 1px solid var(--border); background: var(--bg); border-radius: 6px; cursor: pointer; color: var(--text); transition: background 0.2s;" onmouseover="this.style.background='var(--panel-light)'" onmouseout="this.style.background='var(--bg)'"><i class="bi bi-chevron-left"></i></button>
              <span id="home-cal-title" style="font-weight: 600; text-align: center; font-size: 0.8rem; padding: 0 4px; white-space: nowrap;"></span>
              <button class="home-cal-nav-btn" id="home-cal-next" style="padding: 2px 6px; border: 1px solid var(--border); background: var(--bg); border-radius: 6px; cursor: pointer; color: var(--text); transition: background 0.2s;" onmouseover="this.style.background='var(--panel-light)'" onmouseout="this.style.background='var(--bg)'"><i class="bi bi-chevron-right"></i></button>
            </div>
          </div>
          
          <div class="home-cal-weekdays" style="margin-bottom: 6px;">
            ${HOME_WEEKDAY_SHORT.map(w => `<div>${w}</div>`).join('')}
          </div>
          
          <div class="home-cal-grid" id="home-cal-grid" style="margin-bottom: 12px; flex: none !important;"></div>
          
          <div style="display: flex; gap: 8px; flex: none !important;">
             <button class="home-cal-today-btn" id="home-cal-today-btn" style="flex: 1; padding: 6px; border: 1px solid var(--border); background: var(--bg); border-radius: 8px; cursor: pointer; color: var(--text); font-weight: 500; font-size: 0.8rem; transition: background 0.2s;" onmouseover="this.style.background='var(--panel-light)'" onmouseout="this.style.background='var(--bg)'">Ir para Hoje</button>
          </div>

          <!-- AGENDA (Lista de marcados) -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin: 16px 0 10px; padding-top: 14px; border-top: 1px solid var(--border); flex: none !important;">
            <h4 style="margin:0; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;"><i class="bi bi-journal-bookmark" style="margin-right: 6px;"></i> Agenda</h4>
          </div>
          <div id="home-marked-dates-list" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding-right: 4px; min-height: 0;"></div>

        </div>

      </div>

      <!-- Coluna Central (Feed principal) -->
      <div class="home-col-main" style="display: flex; flex-direction: column; gap: 24px; min-width: 0; min-height: 0;">
        <div class="home-feed-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: none !important;">
          
          <div class="card" style="padding: 24px 20px; border-color: rgba(52, 211, 153, 0.3); background: linear-gradient(135deg, rgba(52, 211, 153, 0.05), var(--panel) 60%); display: flex; align-items: center; gap: 16px; flex-direction: row; justify-content: flex-start; margin: 0;">
            <div style="width: 54px; height: 54px; border-radius: 12px; background: rgba(52, 211, 153, 0.1); color: var(--accent-green); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; flex-shrink: 0;"><i class="bi bi-inbox"></i></div>
            <div style="text-align: left;">
              <span class="home-stat-label" style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: block;">Criadas Hoje</span>
              <span class="home-stat-value" id="home-stat-created" style="font-size: 2rem; font-weight: 700; line-height: 1;">-</span>
            </div>
          </div>

          <div class="card" style="padding: 24px 20px; border-color: rgba(255, 194, 71, 0.3); background: linear-gradient(135deg, rgba(255, 194, 71, 0.05), var(--panel) 60%); display: flex; align-items: center; gap: 16px; flex-direction: row; justify-content: flex-start; margin: 0;">
            <div style="width: 54px; height: 54px; border-radius: 12px; background: rgba(255, 194, 71, 0.1); color: var(--accent-yellow); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; flex-shrink: 0;"><i class="bi bi-check2-all"></i></div>
            <div style="text-align: left;">
              <span class="home-stat-label" style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: block;">Resolvidas Hoje</span>
              <span class="home-stat-value" id="home-stat-resolved" style="font-size: 2rem; font-weight: 700; line-height: 1;">-</span>
            </div>
          </div>

        </div>

        <div class="home-panel" style="flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 20px;">
          <div class="home-panel-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
            <h3 style="margin: 0; font-size: 1rem;"><i class="bi bi-bar-chart" style="margin-right: 6px; color: var(--accent);"></i> Conversas por hora</h3>
          </div>
          <div class="canvas-container" style="flex: 1; min-height: 0; min-width: 0;">
            <canvas id="home-chart-hourly"></canvas>
          </div>
        </div>
      </div>

      <!-- Coluna Direita -->
      <div class="home-col-right" style="display: flex; flex-direction: column; gap: 24px; min-width: 0; min-height: 0;">
        
        <div class="panel" style="flex: none !important; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-color: rgba(41, 163, 255, 0.3); background: linear-gradient(135deg, rgba(41, 163, 255, 0.05), var(--panel) 60%); border-radius: 12px; margin: 0;">
           <div style="display: flex; align-items: center; gap: 12px;">
             <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(41, 163, 255, 0.1); color: #29a3ff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; position: relative;">
               <i class="bi bi-headset"></i>
               <span class="home-online-dot" style="position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: var(--accent-green); border-radius: 50%; border: 2px solid var(--panel); box-shadow: 0 0 6px var(--accent-green);"></span>
             </div>
             <span style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted);">Agentes Online</span>
           </div>
           <span id="home-stat-agents-online" style="font-size: 1.8rem; font-weight: 700; color: var(--text);">-</span>
        </div>

        <div class="home-panel home-tasks-panel" style="flex: 1; display: flex; flex-direction: column; background: var(--panel); padding: 20px; border-radius: 12px; min-height: 0;">
          <div class="home-panel-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px; flex: none !important;">
            <h3 style="margin: 0; font-size: 0.95rem;"><i class="bi bi-check2-square" style="color: var(--accent-yellow); margin-right: 6px;"></i> Minhas Tarefas</h3>
          </div>
          <div id="home-tasks-list" class="home-tasks-list" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding-right: 4px; margin-bottom: 16px; min-height: 0;"></div>
          <div class="home-task-input-row" style="display: flex; gap: 8px; margin-top: auto; padding: 0; flex: none !important;">
            <input id="home-task-input" type="text" placeholder="+ Nova tarefa..." maxlength="200" style="flex: 1; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 0.85rem;">
            <button onclick="addHomeTask()" class="add-task-btn" style="padding: 12px 16px; border-radius: 8px;"><i class="bi bi-plus-lg"></i></button>
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

    document.getElementById('home-task-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addHomeTask();
    });

    await Promise.all([
      loadHomeTasks(),
      loadHomeStats(),
    ]);
  },
};
