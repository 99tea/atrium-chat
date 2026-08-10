const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PRIORITY_ORDER = ['none', 'low', 'medium', 'urgent'];

function ageLabel(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  const totalMin = Math.round(minutes);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return formatDuration(minutes);
}

Screens.overview = {
  template: `
    <div class="filter-bar">
      <button class="filter-btn" data-days="7">7D</button>
      <button class="filter-btn" data-days="14">14D</button>
      <button class="filter-btn active" data-days="30">30D</button>
      <button class="filter-btn" data-days="90">90D</button>
      <button class="filter-btn" data-days="180">180D</button>
    </div>

    <div class="cards">
      <div class="card">
        <i class="bi bi-stopwatch card-icon"></i>
        <span class="card-label">1ª Resposta</span>
        <span class="card-value" id="ov-frt">-</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-all card-icon"></i>
        <span class="card-label">Resolução</span>
        <span class="card-value" id="ov-res">-</span>
      </div>
      <div class="card">
        <i class="bi bi-shield-check card-icon"></i>
        <span class="card-label">SLA Atingido</span>
        <span class="card-value" id="ov-sla" style="white-space: nowrap;">-</span>
      </div>
      <div class="card">
        <i class="bi bi-envelope-open card-icon"></i>
        <span class="card-label">Total Criadas</span>
        <span class="card-value" id="ov-total-open">-</span>
      </div>
      <div class="card">
        <i class="bi bi-check2-circle card-icon"></i>
        <span class="card-label">Total resolvidas</span>
        <span class="card-value" id="ov-total-resolved">-</span>
      </div>
      <div class="card">
        <i class="bi bi-arrow-repeat card-icon"></i>
        <span class="card-label">Taxa de reabertura</span>
        <span class="card-value" id="ov-reopen-rate">-</span>
      </div>
    </div>

    <h2>Tendência</h2>
    <div class="chart-row">
      <div class="chart-box" style="height: 300px;"><canvas id="chart-ov-daily"></canvas></div>
    </div>

    <h3>Tempo médio de resolução por prioridade</h3>
    <div class="cards">
      <div class="card">
        <span class="card-label">Nenhuma</span>
        <span class="card-value" id="ov-res-none">-</span>
      </div>
      <div class="card">
        <span class="card-label">Baixa</span>
        <span class="card-value" id="ov-res-low">-</span>
      </div>
      <div class="card">
        <span class="card-label">Média</span>
        <span class="card-value" id="ov-res-medium">-</span>
      </div>
      <div class="card">
        <span class="card-label">Urgente</span>
        <span class="card-value" id="ov-res-urgent">-</span>
      </div>
    </div>

    <h2>Padrões de abertura</h2>
    <div class="chart-row">
      <div class="chart-box"><canvas id="chart-ov-hourly"></canvas></div>
      <div class="chart-box"><canvas id="chart-ov-weekday"></canvas></div>
    </div>
  `,
  load: async function () {
    let selectedDays = 30;

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDays = Number(btn.dataset.days);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        fetchAndRender(selectedDays);
      });
    });

    async function fetchAndRender(days) {
      const [kpis, daily, hourly, weekday, settings, resolutionByPriority, reopenRate, slaPriorityTargets] = await Promise.all([
        fetch(`/monitor/api/overview?days=${days}`).then(r => r.json()),
        fetch(`/monitor/api/overview/daily?days=${days}`).then(r => r.json()),
        fetch(`/monitor/api/overview/hourly?days=${days}`).then(r => r.json()),
        fetch(`/monitor/api/overview/weekday?days=${days}`).then(r => r.json()),
        fetch('/monitor/api/settings').then(r => r.json()),
        fetch(`/monitor/api/overview/resolution-by-priority?days=${days}`).then(r => r.json()),
        fetch(`/monitor/api/overview/reopen-rate?days=${days}`).then(r => r.json()),
        fetch('/monitor/api/sla-priority-targets').then(r => r.json()),
      ]);

      document.getElementById('ov-frt').textContent = formatDuration(kpis.avg_first_response);
      document.getElementById('ov-res').textContent = formatDuration(kpis.avg_resolution);
      document.getElementById('ov-total-resolved').textContent = kpis.total ?? 0;
      document.getElementById('ov-total-open').textContent = kpis.total_open ?? 0;

      const slaEl = document.getElementById('ov-sla');
      if (kpis.total) {
        const current = ((1 - kpis.resolution_breach_rate) * 100).toFixed(0);
        const target = settings.sla_target_percent || 95;
        slaEl.textContent = `${current}% / ${target}%`;
        slaEl.style.color = Number(current) >= Number(target) ? '#34d399' : '#f87171';
      } else {
        slaEl.textContent = '-';
      }

      const reopenPct = kpis.total ? ((reopenRate.reopened / kpis.total) * 100).toFixed(1) : '0.0';
      document.getElementById('ov-reopen-rate').textContent = `${reopenPct}%`;

      const maxDaily = Math.max(
        ...daily.map(r => r.created_whatsapp + r.created_email + r.created_other),
        ...daily.map(r => r.resolved), 0
      );
      renderChart('chart-ov-daily', {
        type: 'line',
        data: {
          labels: daily.map(r => new Date(r.day).toLocaleDateString('pt-BR')),
          datasets: [
            { label: 'Criadas WhatsApp', data: daily.map(r => r.created_whatsapp), borderColor: '#34d399', backgroundColor: '#34d399', tension: 0.3, fill: false },
            { label: 'Criadas E-mail', data: daily.map(r => r.created_email), borderColor: '#29a3ff', backgroundColor: '#29a3ff', tension: 0.3, fill: false },
            { label: 'Outros', data: daily.map(r => r.created_other), borderColor: '#9296b8', backgroundColor: '#9296b8', tension: 0.3, fill: false },
            { label: 'Resolvidas', data: daily.map(r => r.resolved), borderColor: '#ffc247', backgroundColor: '#ffc247', tension: 0.3, fill: false },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#e8e8ea' } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9599a6', maxTicksLimit: 15 } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 }, suggestedMax: maxDaily + Math.ceil(maxDaily * 0.3) + 1 },
          },
        },
      });

      PRIORITY_ORDER.forEach(p => {
        const found = resolutionByPriority.find(r => r.priority === p);
        const target = slaPriorityTargets.find(t => t.priority === p);
        const el = document.getElementById(`ov-res-${p}`);

        if (found && target) {
          el.textContent = `${formatDuration(found.avg_resolution)} / ${formatDuration(target.resolution_minutes)}`;
          el.style.color = found.avg_resolution <= target.resolution_minutes ? '#34d399' : '#f87171';
        } else {
          el.textContent = found ? formatDuration(found.avg_resolution) : '-';
          el.style.color = '';
        }
      });

      const hourlyFull = Array.from({ length: 24 }, (_, i) => {
        const found = hourly.find(r => r.hour === i);
        return found ? found.total : 0;
      });
      renderChart('chart-ov-hourly', {
        type: 'bar',
        data: {
          labels: Array.from({ length: 24 }, (_, i) => i + 'h'),
          datasets: [{ label: 'Conversas criadas', data: hourlyFull, backgroundColor: '#29a3ff', borderRadius: 4 }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Por hora do dia', color: '#e8e8ea' } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9599a6' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } },
          },
        },
      });

      const weekdayFull = Array.from({ length: 7 }, (_, i) => {
        const found = weekday.find(r => r.weekday === i);
        return found ? found.total : 0;
      });
      renderChart('chart-ov-weekday', {
        type: 'bar',
        data: {
          labels: WEEKDAY_LABELS,
          datasets: [{ label: 'Conversas criadas', data: weekdayFull, backgroundColor: '#a679ff', borderRadius: 4 }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Por dia da semana', color: '#e8e8ea' } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9599a6' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9599a6', stepSize: 1 } },
          },
        },
      });
    }

    await fetchAndRender(selectedDays);
  },
};
