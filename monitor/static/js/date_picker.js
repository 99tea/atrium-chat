/**
 * Atrium Monitor - Date Range Picker Component
 * Dual-month calendar selector with preset buttons (7, 30, 90 days, Hoje, Ontem),
 * custom range selection, high-contrast readable styling, and localStorage persistence.
 */

(function () {
  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  const STORAGE_KEY = 'atrium_monitor_date_range';

  // Helper date functions
  function formatYMD(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDMY(dateOrYMD) {
    if (!dateOrYMD) return '';
    if (typeof dateOrYMD === 'string' && dateOrYMD.includes('-')) {
      const parts = dateOrYMD.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const d = new Date(dateOrYMD);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function parseYMD(ymd) {
    if (!ymd) return new Date();
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function diffDays(ymdStart, ymdEnd) {
    if (!ymdStart || !ymdEnd) return 1;
    const s = parseYMD(ymdStart).getTime();
    const e = parseYMD(ymdEnd).getTime();
    return Math.max(1, Math.round(Math.abs(e - s) / 86400000) + 1);
  }

  function getTodayYMD() {
    return formatYMD(new Date());
  }

  function computePresetRange(presetId) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (presetId === 'today') {
      const ymd = formatYMD(today);
      return { preset: 'today', startDate: ymd, endDate: ymd, days: 1 };
    }
    if (presetId === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const ymd = formatYMD(yest);
      return { preset: 'yesterday', startDate: ymd, endDate: ymd, days: 1 };
    }
    if (presetId === '7') {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { preset: '7', startDate: formatYMD(s), endDate: formatYMD(today), days: 7 };
    }
    if (presetId === '30') {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { preset: '30', startDate: formatYMD(s), endDate: formatYMD(today), days: 30 };
    }
    if (presetId === '90') {
      const s = new Date(today);
      s.setDate(s.getDate() - 89);
      return { preset: '90', startDate: formatYMD(s), endDate: formatYMD(today), days: 90 };
    }
    if (presetId === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const start = formatYMD(firstDay);
      const end = formatYMD(today);
      return { preset: 'this_month', startDate: start, endDate: end, days: diffDays(start, end) };
    }
    if (presetId === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      const start = formatYMD(firstDay);
      const end = formatYMD(lastDay);
      return { preset: 'last_month', startDate: start, endDate: end, days: diffDays(start, end) };
    }
    // Default fallback
    const s = new Date(today);
    s.setDate(s.getDate() - 29);
    return { preset: '30', startDate: formatYMD(s), endDate: formatYMD(today), days: 30 };
  }

  function getStoredRange() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.preset && parsed.preset !== 'custom') {
          return computePresetRange(parsed.preset);
        }
        if (parsed.startDate && parsed.endDate) {
          return {
            preset: 'custom',
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            days: diffDays(parsed.startDate, parsed.endDate)
          };
        }
      }
    } catch (e) {
      console.warn('Error reading stored date range', e);
    }
    return computePresetRange('30');
  }

  function setStoredRange(range) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
    } catch (e) {
      console.warn('Error saving date range', e);
    }
  }

  const PRESETS = [
    { id: 'today', label: 'Hoje' },
    { id: 'yesterday', label: 'Ontem' },
    { id: '7', label: 'Últimos 7 dias' },
    { id: '30', label: 'Últimos 30 dias' },
    { id: '90', label: 'Últimos 90 dias' },
    { id: 'this_month', label: 'Este mês' },
    { id: 'last_month', label: 'Mês anterior' },
  ];

  class DateRangePickerInstance {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) return;

      this.options = Object.assign({
        onChange: null,
        storageKey: STORAGE_KEY,
        align: 'right'
      }, options);

      // Current active selection
      this.currentRange = getStoredRange();

      // Working selection in popover (tentative until applied or clicked)
      this.tempStartDate = this.currentRange.startDate;
      this.tempEndDate = this.currentRange.endDate;
      this.tempPreset = this.currentRange.preset;

      // Calendar view months (left month view: year & month)
      const startDateObj = parseYMD(this.currentRange.startDate);
      this.viewYear = startDateObj.getFullYear();
      this.viewMonth = startDateObj.getMonth();

      this.hoverDate = null;
      this.isOpen = false;
      this.isSelectingSecondDate = false;

      this.init();
    }

    init() {
      this.container.classList.add('relative', 'inline-block');
      this.renderTrigger();
      this.renderPopover();
      this.bindGlobalEvents();
    }

    getDisplayText() {
      return `${formatDMY(this.currentRange.startDate)} &nbsp;&ndash;&nbsp; ${formatDMY(this.currentRange.endDate)}`;
    }

    renderTrigger() {
      let wrapper = this.container.querySelector('.date-picker-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'date-picker-wrapper flex items-center gap-1.5 p-1 bg-panel border border-border rounded-xl shadow-sm';
        this.container.appendChild(wrapper);
      }

      const currentPreset = this.currentRange.preset;
      const is7 = currentPreset === '7';
      const is30 = currentPreset === '30';
      const is90 = currentPreset === '90';
      const isCustom = !is7 && !is30 && !is90;

      wrapper.innerHTML = `
        <div class="flex items-center gap-1">
          <button type="button" class="quick-preset-btn px-3 py-1.5 rounded-lg text-[0.78rem] font-semibold transition-all select-none ${is7 ? 'bg-panel-light text-text shadow-sm border border-accent/60 glow-border' : 'text-muted hover:text-text hover:bg-panel-light/60 border border-transparent'}" data-quick-preset="7">7D</button>
          <button type="button" class="quick-preset-btn px-3 py-1.5 rounded-lg text-[0.78rem] font-semibold transition-all select-none ${is30 ? 'bg-panel-light text-text shadow-sm border border-accent/60 glow-border' : 'text-muted hover:text-text hover:bg-panel-light/60 border border-transparent'}" data-quick-preset="30">30D</button>
          <button type="button" class="quick-preset-btn px-3 py-1.5 rounded-lg text-[0.78rem] font-semibold transition-all select-none ${is90 ? 'bg-panel-light text-text shadow-sm border border-accent/60 glow-border' : 'text-muted hover:text-text hover:bg-panel-light/60 border border-transparent'}" data-quick-preset="90">90D</button>
        </div>
        <div class="h-4 w-[1px] bg-border mx-0.5"></div>
        <button type="button" class="date-picker-trigger flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isCustom ? 'border-accent/70 bg-accent/10 text-accent font-semibold' : 'border-transparent bg-transparent hover:bg-panel-light text-text'} text-[0.8rem] font-medium transition-all cursor-pointer select-none">
          <i class="bi bi-calendar3 ${isCustom ? 'text-accent' : 'text-muted'} text-xs"></i>
          <span class="date-picker-label tracking-wide">${this.getDisplayText()}</span>
          <i class="bi bi-chevron-down text-muted text-[0.65rem] ml-0.5"></i>
        </button>
      `;

      wrapper.querySelectorAll('[data-quick-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const days = btn.dataset.quickPreset;
          const range = computePresetRange(days);
          this.applyRange(range);
        });
      });

      const triggerBtn = wrapper.querySelector('.date-picker-trigger');
      if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePopover();
        });
      }
    }

    renderPopover() {
      let popover = this.container.querySelector('.date-picker-popover');
      if (!popover) {
        popover = document.createElement('div');
        popover.className = `date-picker-popover hidden absolute ${this.options.align === 'left' ? 'left-0' : 'right-0'} top-[calc(100%+6px)] bg-panel border border-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[9999] overflow-hidden transition-all text-text`;
        popover.style.minWidth = '640px';
        this.container.appendChild(popover);
        popover.addEventListener('click', (e) => e.stopPropagation());
      }
      this.popover = popover;
      this.buildPopoverSkeleton();
    }

    buildPopoverSkeleton() {
      if (!this.popover) return;

      this.popover.innerHTML = `
        <div class="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
          <!-- Left Sidebar with Presets -->
          <div class="date-picker-presets w-full md:w-[155px] shrink-0 p-3 bg-panel flex flex-col gap-1 text-left justify-start">
            <span class="text-[0.65rem] font-bold text-muted uppercase tracking-wider px-2 py-1 mb-1">Períodos</span>
            ${PRESETS.map(p => {
              const isActive = this.tempPreset === p.id;
              return `
                <button type="button" class="preset-btn text-left px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent font-bold border-l-2 border-accent'
                    : 'text-muted hover:text-text hover:bg-panel-light/70'
                }" data-preset="${p.id}">
                  ${p.label}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Dual Calendar View -->
          <div class="p-4 flex-1 bg-panel flex flex-col gap-3">
            <div class="date-picker-months grid grid-cols-1 md:grid-cols-2 gap-5">
              <!-- Rendered dynamically -->
            </div>

            <!-- Footer info and Actions -->
            <div class="flex items-center justify-between pt-3 border-t border-border mt-1 text-xs">
              <div class="date-picker-footer-info text-muted flex items-center gap-1.5 flex-wrap">
                <!-- Updated dynamically -->
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-cancel px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-panel-light font-medium text-xs transition-colors">Cancelar</button>
                <button type="button" class="btn-apply px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-bold text-xs shadow-md transition-all glow-border">Aplicar</button>
              </div>
            </div>
          </div>
        </div>
      `;

      this.renderCalendarMonths();
      this.bindDelegatedEvents();
    }

    renderCalendarMonths() {
      const monthsContainer = this.popover.querySelector('.date-picker-months');
      if (!monthsContainer) return;

      const yearL = this.viewYear;
      const monthL = this.viewMonth;

      let yearR = yearL;
      let monthR = monthL + 1;
      if (monthR > 11) {
        monthR = 0;
        yearR++;
      }

      monthsContainer.innerHTML = `
        <!-- Left Month -->
        <div class="calendar-month flex flex-col">
          <div class="flex items-center justify-between mb-2.5 px-1">
            <div class="flex items-center gap-1">
              <button type="button" class="nav-btn w-7 h-7 flex items-center justify-center hover:bg-panel-light hover:text-accent rounded-lg text-xs text-muted transition-colors" data-nav="prev-year" title="Ano anterior"><i class="bi bi-chevron-double-left pointer-events-none"></i></button>
              <button type="button" class="nav-btn w-7 h-7 flex items-center justify-center hover:bg-panel-light hover:text-accent rounded-lg text-xs text-muted transition-colors" data-nav="prev-month" title="Mês anterior"><i class="bi bi-chevron-left pointer-events-none"></i></button>
            </div>
            <span class="text-[0.88rem] font-bold text-text tracking-wide">${MONTH_NAMES[monthL]} ${yearL}</span>
            <div class="w-14"></div>
          </div>
          ${this.generateMonthGridHTML(yearL, monthL)}
        </div>

        <!-- Right Month -->
        <div class="calendar-month flex flex-col">
          <div class="flex items-center justify-between mb-2.5 px-1">
            <div class="w-14"></div>
            <span class="text-[0.88rem] font-bold text-text tracking-wide">${MONTH_NAMES[monthR]} ${yearR}</span>
            <div class="flex items-center gap-1">
              <button type="button" class="nav-btn w-7 h-7 flex items-center justify-center hover:bg-panel-light hover:text-accent rounded-lg text-xs text-muted transition-colors" data-nav="next-month" title="Próximo mês"><i class="bi bi-chevron-right pointer-events-none"></i></button>
              <button type="button" class="nav-btn w-7 h-7 flex items-center justify-center hover:bg-panel-light hover:text-accent rounded-lg text-xs text-muted transition-colors" data-nav="next-year" title="Próximo ano"><i class="bi bi-chevron-double-right pointer-events-none"></i></button>
            </div>
          </div>
          ${this.generateMonthGridHTML(yearR, monthR)}
        </div>
      `;

      this.renderDateCellsHighlight();
    }

    generateMonthGridHTML(year, month) {
      const todayYMD = getTodayYMD();
      const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();

      let html = `
        <div class="grid grid-cols-7 text-center mb-1 border-b border-border/50 pb-1">
          ${WEEKDAY_NAMES.map(w => `<span class="text-[0.7rem] font-bold text-muted uppercase py-1">${w}</span>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-y-1">
      `;

      // Trailing days from previous month
      for (let i = firstDayOfMonth - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        html += `<div class="h-8 flex items-center justify-center text-[0.8rem] text-muted/30 select-none">${d}</div>`;
      }

      // Current month days
      for (let day = 1; day <= daysInMonth; day++) {
        const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = (ymd === todayYMD);

        html += `
          <div class="calendar-day relative h-8 flex items-center justify-center cursor-pointer select-none text-[0.82rem]" data-date="${ymd}">
            <div class="range-bg absolute inset-y-0.5 inset-x-0 hidden pointer-events-none"></div>
            <span class="day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-medium transition-all pointer-events-none text-muted hover:text-text hover:bg-panel-light">${day}</span>
            <span class="today-dot ${isToday ? '' : 'hidden'} absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-400 pointer-events-none"></span>
          </div>
        `;
      }

      // Leading days for next month to complete row
      const totalCells = firstDayOfMonth + daysInMonth;
      const remaining = (7 - (totalCells % 7)) % 7;
      for (let day = 1; day <= remaining; day++) {
        html += `<div class="h-8 flex items-center justify-center text-[0.8rem] text-muted/30 select-none">${day}</div>`;
      }

      html += `</div>`;
      return html;
    }

    renderDateCellsHighlight() {
      if (!this.popover) return;

      const effectiveStart = this.tempStartDate;
      let effectiveEnd = this.tempEndDate;

      if (this.isSelectingSecondDate && this.hoverDate) {
        effectiveEnd = this.hoverDate;
      }

      const [rangeStart, rangeEnd] = (effectiveStart && effectiveEnd)
        ? (effectiveStart <= effectiveEnd ? [effectiveStart, effectiveEnd] : [effectiveEnd, effectiveStart])
        : [effectiveStart, effectiveStart];

      const cells = this.popover.querySelectorAll('[data-date]');
      cells.forEach(cell => {
        const ymd = cell.dataset.date;
        const isStart = (ymd === rangeStart);
        const isEnd = (ymd === rangeEnd);
        const isBetween = Boolean(rangeStart && rangeEnd && ymd > rangeStart && ymd < rangeEnd);
        const bg = cell.querySelector('.range-bg');
        const badge = cell.querySelector('.day-number');

        if (!bg || !badge) return;

        if (isStart && isEnd) {
          bg.className = 'range-bg absolute inset-y-0.5 inset-x-0 hidden pointer-events-none';
          badge.className = 'day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-bold shadow-md ring-2 ring-accent/60 scale-105 pointer-events-none bg-accent text-white';
          badge.style.backgroundColor = '#8f161b';
          badge.style.color = '#ffffff';
        } else if (isStart) {
          bg.className = 'range-bg absolute inset-y-0.5 left-1/2 right-0 pointer-events-none';
          bg.style.backgroundColor = 'rgba(143, 22, 27, 0.28)';
          badge.className = 'day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-bold shadow-md ring-2 ring-accent/60 scale-105 pointer-events-none bg-accent text-white';
          badge.style.backgroundColor = '#8f161b';
          badge.style.color = '#ffffff';
        } else if (isEnd) {
          bg.className = 'range-bg absolute inset-y-0.5 left-0 right-1/2 pointer-events-none';
          bg.style.backgroundColor = 'rgba(143, 22, 27, 0.28)';
          badge.className = 'day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-bold shadow-md ring-2 ring-accent/60 scale-105 pointer-events-none bg-accent text-white';
          badge.style.backgroundColor = '#8f161b';
          badge.style.color = '#ffffff';
        } else if (isBetween) {
          bg.className = 'range-bg absolute inset-y-0.5 left-0 right-0 pointer-events-none';
          bg.style.backgroundColor = 'rgba(143, 22, 27, 0.28)';
          badge.className = 'day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-bold pointer-events-none';
          badge.style.backgroundColor = 'transparent';
          badge.style.color = '#ffffff'; // Bright white, high-contrast readable!
        } else {
          bg.className = 'range-bg absolute inset-y-0.5 inset-x-0 hidden pointer-events-none';
          badge.className = 'day-number relative z-10 w-7 h-7 flex items-center justify-center rounded-full font-medium transition-colors pointer-events-none text-muted hover:text-text hover:bg-panel-light';
          badge.style.backgroundColor = 'transparent';
          badge.style.color = '';
        }
      });

      // Update preset buttons active indicator in sidebar
      this.popover.querySelectorAll('.preset-btn').forEach(btn => {
        const pId = btn.dataset.preset;
        if (pId === this.tempPreset) {
          btn.className = 'preset-btn text-left px-3 py-2 rounded-lg text-[0.8rem] font-bold transition-colors bg-accent/15 text-accent border-l-2 border-accent';
        } else {
          btn.className = 'preset-btn text-left px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-colors text-muted hover:text-text hover:bg-panel-light/70';
        }
      });

      this.updateFooterInfo();
    }

    updateFooterInfo() {
      const footerInfo = this.popover.querySelector('.date-picker-footer-info');
      const btnApply = this.popover.querySelector('.btn-apply');
      if (!footerInfo) return;

      const s = this.tempStartDate;
      const e = (this.isSelectingSecondDate && this.hoverDate) ? this.hoverDate : this.tempEndDate;
      const [rStart, rEnd] = (s && e) ? (s <= e ? [s, e] : [e, s]) : [s, s];

      const days = (rStart && rEnd) ? diffDays(rStart, rEnd) : 1;
      const statusHint = this.isSelectingSecondDate
        ? '<span class="text-accent text-xs font-semibold ml-1.5 animate-pulse">&larr; Selecione a data final no calendário</span>'
        : '';

      footerInfo.innerHTML = `
        <span class="text-muted">Período:</span>
        <span class="font-bold text-text bg-panel-light px-2 py-0.5 rounded border border-border/60">${formatDMY(rStart)} &ndash; ${formatDMY(rEnd)}</span>
        <span class="text-accent font-semibold">(${days} ${days === 1 ? 'dia' : 'dias'})</span>
        ${statusHint}
      `;

      if (btnApply) {
        btnApply.textContent = `Aplicar (${days} ${days === 1 ? 'dia' : 'dias'})`;
      }
    }

    bindDelegatedEvents() {
      // Event delegation on the popover element (bound ONCE)
      this.popover.addEventListener('click', (e) => {
        // 1. Preset button click
        const presetBtn = e.target.closest('[data-preset]');
        if (presetBtn) {
          e.stopPropagation();
          const presetId = presetBtn.dataset.preset;
          const range = computePresetRange(presetId);
          this.applyRange(range);
          return;
        }

        // 2. Navigation buttons click
        const navBtn = e.target.closest('[data-nav]');
        if (navBtn) {
          e.stopPropagation();
          const action = navBtn.dataset.nav;
          if (action === 'prev-month') this.changeMonth(-1);
          else if (action === 'next-month') this.changeMonth(1);
          else if (action === 'prev-year') this.changeYear(-1);
          else if (action === 'next-year') this.changeYear(1);
          return;
        }

        // 3. Date cell click (Direct and foolproof)
        const dateCell = e.target.closest('[data-date]');
        if (dateCell) {
          e.stopPropagation();
          const ymd = dateCell.dataset.date;
          this.handleDateClick(ymd);
          return;
        }

        // 4. Cancel button click
        if (e.target.closest('.btn-cancel')) {
          e.stopPropagation();
          this.closePopover();
          return;
        }

        // 5. Apply button click
        if (e.target.closest('.btn-apply')) {
          e.stopPropagation();
          const s = this.tempStartDate;
          const eDate = this.tempEndDate;
          const [rStart, rEnd] = (s && eDate) ? (s <= eDate ? [s, eDate] : [eDate, s]) : [s, s];
          this.applyRange({
            preset: this.tempPreset,
            startDate: rStart,
            endDate: rEnd,
            days: diffDays(rStart, rEnd)
          });
          return;
        }
      });

      // Mouseover event delegation for smooth range preview (WITHOUT any DOM recreation!)
      this.popover.addEventListener('mouseover', (e) => {
        if (!this.isSelectingSecondDate) return;
        const dateCell = e.target.closest('[data-date]');
        if (dateCell) {
          const ymd = dateCell.dataset.date;
          if (this.hoverDate !== ymd) {
            this.hoverDate = ymd;
            this.renderDateCellsHighlight();
          }
        }
      });
    }

    handleDateClick(ymd) {
      if (!this.isSelectingSecondDate) {
        // First click: sets start date
        this.tempStartDate = ymd;
        this.tempEndDate = ymd;
        this.tempPreset = 'custom';
        this.isSelectingSecondDate = true;
        this.hoverDate = null;
        this.renderDateCellsHighlight();
      } else {
        // Second click: sets end date
        if (ymd < this.tempStartDate) {
          this.tempEndDate = this.tempStartDate;
          this.tempStartDate = ymd;
        } else {
          this.tempEndDate = ymd;
        }
        this.tempPreset = 'custom';
        this.isSelectingSecondDate = false;
        this.hoverDate = null;
        this.renderDateCellsHighlight();
      }
    }

    changeMonth(delta) {
      this.viewMonth += delta;
      if (this.viewMonth < 0) {
        this.viewMonth = 11;
        this.viewYear--;
      } else if (this.viewMonth > 11) {
        this.viewMonth = 0;
        this.viewYear++;
      }
      this.renderCalendarMonths();
    }

    changeYear(delta) {
      this.viewYear += delta;
      this.renderCalendarMonths();
    }

    bindGlobalEvents() {
      document.addEventListener('click', (e) => {
        if (this.isOpen && !this.container.contains(e.target)) {
          this.closePopover();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closePopover();
        }
      });
    }

    togglePopover() {
      if (this.isOpen) {
        this.closePopover();
      } else {
        this.openPopover();
      }
    }

    openPopover() {
      this.tempStartDate = this.currentRange.startDate;
      this.tempEndDate = this.currentRange.endDate;
      this.tempPreset = this.currentRange.preset;
      this.isSelectingSecondDate = false;
      this.hoverDate = null;

      const sObj = parseYMD(this.tempStartDate);
      this.viewYear = sObj.getFullYear();
      this.viewMonth = sObj.getMonth();

      this.renderCalendarMonths();
      this.popover.classList.remove('hidden');
      this.isOpen = true;
    }

    closePopover() {
      if (!this.popover) return;
      this.popover.classList.add('hidden');
      this.isOpen = false;
      this.isSelectingSecondDate = false;
      this.hoverDate = null;
    }

    applyRange(range) {
      this.currentRange = range;
      setStoredRange(range);
      this.renderTrigger();
      this.closePopover();

      // Dispatch global event for any active page
      window.dispatchEvent(new CustomEvent('atrium:dateRangeChanged', { detail: range }));

      if (typeof this.options.onChange === 'function') {
        this.options.onChange(range);
      }
    }
  }

  // Global static namespace
  window.DateRangePicker = {
    mount: function (container, options) {
      return new DateRangePickerInstance(container, options);
    },
    getSelectedRange: function () {
      return getStoredRange();
    },
    getQueryString: function () {
      const r = getStoredRange();
      return `days=${r.days}&start_date=${r.startDate}&end_date=${r.endDate}`;
    },
    formatDMY: formatDMY,
    formatYMD: formatYMD,
    computePresetRange: computePresetRange
  };
})();
