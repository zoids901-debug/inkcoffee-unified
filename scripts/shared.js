// 공통 유틸 + 탭 라우팅
(function () {
  'use strict';

  // ── 공통 유틸 (각 탭에서 재사용) ─────────────────
  window.App = window.App || {};
  App.util = {
    comma: (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR')),
    M: (n) => (n == null ? '-' : (Math.round(n / 1e4) / 100).toLocaleString('ko-KR') + 'M'),
    pct: (n, total) => (total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '-'),
    fmtKRW: (n) => '₩' + (n == null ? '-' : Math.round(n).toLocaleString('ko-KR')),
    qs: (sel, root) => (root || document).querySelector(sel),
    qsa: (sel, root) => Array.from((root || document).querySelectorAll(sel)),
  };

  // ── 전역 상태 (탭 간 공유될 기간/매장 등) ─────────
  App.state = {
    period: null,    // {start: 'YYMM', end: 'YYMM'}
    stores: null,    // ['전체'] 또는 ['가산','다산'...]
    activeTab: null,
  };
  App.events = new EventTarget();

  // 상태 갱신은 항상 이 헬퍼를 통해 (이벤트 발행 자동)
  App.setPeriod = (period) => {
    App.state.period = period;
    App.events.dispatchEvent(new CustomEvent('period', { detail: period }));
    renderHeader();
  };
  App.setStores = (stores) => {
    App.state.stores = stores;
    App.events.dispatchEvent(new CustomEvent('stores', { detail: stores }));
    renderHeader();
  };

  function renderHeader() {
    const p = App.state.period;
    const s = App.state.stores;
    const pe = document.getElementById('header-period');
    const se = document.getElementById('header-store');
    if (pe) pe.textContent = p ? `기간 · ${p.start}~${p.end}` : '기간 · -';
    if (se) se.textContent = s ? `매장 · ${s.length === 1 ? s[0] : s.length + '개'}` : '매장 · -';
  }

  // ── 탭 라우팅 ───────────────────────────────────
  const TABS = ['product', 'ops', 'pl'];
  function showTab(name) {
    if (!TABS.includes(name)) name = 'product';
    App.state.activeTab = name;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.hidden = (p.id !== `tab-${name}`);
    });
    if (location.hash !== `#${name}`) {
      history.replaceState(null, '', `#${name}`);
    }
    App.events.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
  }

  // 클릭 핸들러
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab) showTab(tab.dataset.tab);
  });

  // 해시 변경 / 초기 진입
  window.addEventListener('hashchange', () => {
    const t = (location.hash || '#product').slice(1);
    if (t !== App.state.activeTab) showTab(t);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const t = (location.hash || '#product').slice(1);
    showTab(t);
  });

  // ── GitHub Raw fetch 헬퍼 (3개 탭에서 데이터 가져올 때 공통) ──
  App.fetchJson = async (url) => {
    const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  };

  console.log('[App] shared.js loaded — tabs:', TABS);
})();
