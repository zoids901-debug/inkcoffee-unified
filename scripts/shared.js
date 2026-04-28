// 공통 유틸 + 탭 라우팅 + 전역 기간/매장 컨트롤
(function () {
  'use strict';

  // ── 공통 유틸 ─────────────────────────────────
  window.App = window.App || {};
  App.util = {
    comma: (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR')),
    M: (n) => (n == null ? '-' : (Math.round(n / 1e4) / 100).toLocaleString('ko-KR') + 'M'),
    pct: (n, total) => (total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '-'),
    qs: (sel, root) => (root || document).querySelector(sel),
    qsa: (sel, root) => Array.from((root || document).querySelectorAll(sel)),
    fmtMonth: (d) => d.toISOString().slice(0,7),  // 'YYYY-MM'
    addMonths: (d, n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; },
  };
  const U = App.util;

  // ── 전역 상태 ─────────────────────────────────
  App.state = {
    period: { preset: '3m', from: null, to: null },
    stores: ['전체','가산','다산','수원','하남','광주','운정'],
    activeTab: null,
  };
  App.events = new EventTarget();

  // ── 기간 프리셋 계산 ──────────────────────────
  function computePeriod(preset) {
    const today = new Date(); today.setDate(1);
    const tm = U.fmtMonth(today);
    let from, to;
    switch(preset) {
      case 'thismonth': from = tm; to = tm; break;
      case 'lastmonth': { const d = U.addMonths(today, -1); from = U.fmtMonth(d); to = from; break; }
      case '3m': from = U.fmtMonth(U.addMonths(today,-2)); to = tm; break;
      case '6m': from = U.fmtMonth(U.addMonths(today,-5)); to = tm; break;
      case 'ytd': from = `${today.getFullYear()}-01`; to = tm; break;
      default: return null;  // custom
    }
    return { preset, from, to };
  }

  function applyPeriod(period, fromUI = false) {
    App.state.period = period;
    const fromInput = document.getElementById('date-from');
    const toInput = document.getElementById('date-to');
    if (fromInput && period.from) fromInput.value = period.from;
    if (toInput && period.to) toInput.value = period.to;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === period.preset);
    });
    App.events.dispatchEvent(new CustomEvent('period', { detail: period }));
  }

  function applyStores(stores) {
    App.state.stores = stores;
    document.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('checked', stores.includes(p.dataset.store));
    });
    App.events.dispatchEvent(new CustomEvent('stores', { detail: stores }));
  }

  // ── 이벤트 바인딩 ─────────────────────────────
  document.addEventListener('click', (e) => {
    // 탭 전환
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab) { showTab(tab.dataset.tab); return; }

    // 프리셋 버튼
    const preset = e.target.closest('.preset-btn');
    if (preset) {
      const p = computePeriod(preset.dataset.preset);
      if (p) applyPeriod(p);
      else applyPeriod({ preset: 'custom', from: App.state.period.from, to: App.state.period.to });
      return;
    }

    // 매장 pill
    const pill = e.target.closest('.pill');
    if (pill) {
      const store = pill.dataset.store;
      let cur = [...App.state.stores];
      if (store === '전체') {
        if (cur.includes('전체') && cur.length === 7) {
          cur = ['전체'];  // 전체만 선택
        } else {
          cur = ['전체','가산','다산','수원','하남','광주','운정'];
        }
      } else {
        cur = cur.filter(s => s !== '전체');
        if (cur.includes(store)) cur = cur.filter(s => s !== store);
        else cur.push(store);
        if (cur.length === 6) cur = ['전체','가산','다산','수원','하남','광주','운정'];
        if (cur.length === 0) cur = ['전체','가산','다산','수원','하남','광주','운정'];
      }
      applyStores(cur);
      return;
    }
  });

  // 직접 month input 변경
  document.addEventListener('change', (e) => {
    if (e.target.id === 'date-from' || e.target.id === 'date-to') {
      const from = document.getElementById('date-from').value;
      const to = document.getElementById('date-to').value;
      if (from && to) applyPeriod({ preset: 'custom', from, to });
    }
  });

  // ── 탭 라우팅 ───────────────────────────────────
  const TABS = ['product', 'ops', 'pl'];
  function showTab(name) {
    if (!TABS.includes(name)) name = 'product';
    App.state.activeTab = name;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.hidden = (p.id !== `tab-${name}`);
    });
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    App.events.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
  }

  window.addEventListener('hashchange', () => {
    const t = (location.hash || '#product').slice(1);
    if (t !== App.state.activeTab) showTab(t);
  });

  document.addEventListener('DOMContentLoaded', () => {
    // 초기 기간: 최근 3개월
    applyPeriod(computePeriod('3m'));
    applyStores(App.state.stores);
    // 초기 탭
    const t = (location.hash || '#product').slice(1);
    showTab(t);
  });

  // ── 헬퍼 ─────────────────────────────────────
  App.fetchJson = async (url) => {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  };

  App.setPeriod = applyPeriod;
  App.setStores = applyStores;

  console.log('[App] shared.js loaded');
})();
