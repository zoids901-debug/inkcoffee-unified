// 공통 + 탭 라우팅 + 운영 대시보드 패턴의 기간/매장 컨트롤
(function () {
  'use strict';

  window.App = window.App || {};
  App.util = {
    comma: (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR')),
    M: (n) => (n == null ? '-' : (Math.round(n / 1e4) / 100).toLocaleString('ko-KR') + 'M'),
  };

  // ── 매장 정의 (운영 대시보드와 동일 순서/색) ─────
  const STORES = ['하남','다산','가산','수원','광주','운정'];
  const COLORS = {
    하남: '#3B82F6', 다산: '#10B981', 가산: '#F59E0B',
    수원: '#8B5CF6', 광주: '#EF4444', 운정: '#06B6D4'
  };
  App.STORES = STORES;
  App.COLORS = COLORS;

  // ── 전역 상태 ─────────────────────────────────
  App.state = {
    period: { preset: 'mtd', start: null, end: null },
    activeStores: new Set(STORES),
    activeTab: null,
  };
  App.events = new EventTarget();

  // ── 날짜 유틸 ─────────────────────────────────
  const toStr = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };
  const fmt = s => s ? s.replaceAll('-', '.') : '';

  function computePeriod(preset) {
    const now = new Date();
    const today = toStr(now);
    let start, end;
    switch(preset) {
      case 'yesterday': {
        const d = new Date(now); d.setDate(d.getDate()-1);
        start = end = toStr(d); break;
      }
      case 'week': {
        const d = new Date(now);
        const dow = d.getDay() || 7;  // 1=월 ~ 7=일
        d.setDate(d.getDate() - dow + 1);
        start = toStr(d); end = today; break;
      }
      case 'mtd': {
        const d = new Date(now); d.setDate(1);
        start = toStr(d); end = today; break;
      }
      case 'last_month': {
        const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth()-1);
        start = toStr(d);
        const e = new Date(d); e.setMonth(e.getMonth()+1); e.setDate(0);
        end = toStr(e); break;
      }
      case '30d': {
        const d = new Date(now); d.setDate(d.getDate()-29);
        start = toStr(d); end = today; break;
      }
      case '3m': {
        const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth()-2);
        start = toStr(d); end = today; break;
      }
      default: return null;
    }
    return { preset, start, end };
  }

  function setPeriod(period) {
    App.state.period = period;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.p === period.preset);
    });
    const inp = document.getElementById('dateRangeInput');
    if (inp) inp.value = `${fmt(period.start)} ~ ${fmt(period.end)}`;
    App.events.dispatchEvent(new CustomEvent('period', { detail: period }));
  }

  // ── 탭 라우팅 ─────────────────────────────────
  const TABS = ['product', 'ops', 'pl'];
  function showTab(name) {
    if (!TABS.includes(name)) name = 'product';
    App.state.activeTab = name;
    document.querySelectorAll('.hdr-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.hidden = (p.id !== `tab-${name}`);
    });
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    App.events.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
  }
  App.showTab = showTab;

  // ── 초기화 ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {

    // 탭 클릭
    document.querySelectorAll('.hdr-tab').forEach(b => {
      b.addEventListener('click', () => showTab(b.dataset.tab));
    });
    window.addEventListener('hashchange', () => {
      const t = (location.hash || '#product').slice(1);
      if (t !== App.state.activeTab) showTab(t);
    });

    // 프리셋 버튼
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = computePeriod(btn.dataset.p);
        if (p) setPeriod(p);
      });
    });

    // 매장 pills
    const pillsEl = document.getElementById('storePills');
    const allBtn = document.getElementById('pillAll');

    function updateAllBtn() {
      const allOn = STORES.every(s => App.state.activeStores.has(s));
      allBtn.classList.toggle('on', allOn);
      allBtn.style.background = allOn ? '#1E293B' : '';
      allBtn.style.borderColor = '#1E293B';
      allBtn.style.color = allOn ? '#fff' : '#1E293B';
    }
    allBtn.addEventListener('click', () => {
      const allOn = STORES.every(s => App.state.activeStores.has(s));
      if (allOn) {
        App.state.activeStores.clear();
        document.querySelectorAll('.pill[data-store]').forEach(el => {
          el.classList.remove('on');
          el.style.background = '';
        });
      } else {
        STORES.forEach(s => App.state.activeStores.add(s));
        document.querySelectorAll('.pill[data-store]').forEach(el => {
          el.classList.add('on');
          el.style.background = COLORS[el.dataset.store] + '22';
        });
      }
      updateAllBtn();
      App.events.dispatchEvent(new CustomEvent('stores', { detail: [...App.state.activeStores] }));
    });

    STORES.forEach(s => {
      const el = document.createElement('button');
      el.className = 'pill on';
      el.innerHTML = `<span class="store-dot" style="background:${COLORS[s]}"></span>${s}`;
      el.style.borderColor = COLORS[s];
      el.style.color = COLORS[s];
      el.style.background = COLORS[s] + '22';
      el.dataset.store = s;
      el.addEventListener('click', () => {
        if (App.state.activeStores.has(s)) {
          App.state.activeStores.delete(s);
          el.classList.remove('on');
          el.style.background = '';
        } else {
          App.state.activeStores.add(s);
          el.classList.add('on');
          el.style.background = COLORS[s] + '22';
        }
        updateAllBtn();
        App.events.dispatchEvent(new CustomEvent('stores', { detail: [...App.state.activeStores] }));
      });
      pillsEl.appendChild(el);
    });
    updateAllBtn();

    // Litepicker (날짜 범위 선택)
    if (window.Litepicker) {
      const picker = new Litepicker({
        element: document.getElementById('dateRangeInput'),
        singleMode: false,
        format: 'YYYY-MM-DD',
        numberOfMonths: 2,
        numberOfColumns: 2,
        autoApply: true,
        setup: (p) => {
          p.on('selected', (start, end) => {
            setPeriod({ preset: 'custom', start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') });
          });
        }
      });
      App.picker = picker;
    }

    // 초기 기간: 이번 달
    setPeriod(computePeriod('mtd'));

    // 초기 탭
    const t = (location.hash || '#product').slice(1);
    showTab(t);
  });

  App.fetchJson = async (url) => {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  };

  console.log('[App] shared.js loaded');
})();
