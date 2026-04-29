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

  // 월 시작 / 월 끝 헬퍼
  const monthStart = (d) => { const x = new Date(d); x.setDate(1); return x; };
  const monthEnd   = (d) => { const x = new Date(d); x.setMonth(x.getMonth()+1, 0); return x; };

  function computePeriod(preset) {
    const now = new Date();
    let start, end;
    switch(preset) {
      case 'yesterday': {
        const d = new Date(now); d.setDate(d.getDate()-1);
        start = end = d; break;
      }
      case 'week': {
        const d = new Date(now);
        const dow = d.getDay() || 7;  // 1=월 ~ 7=일
        d.setDate(d.getDate() - dow + 1);
        start = d; end = now; break;
      }
      case 'mtd': {
        start = monthStart(now); end = now; break;
      }
      case 'last_month': {
        const d = new Date(now); d.setMonth(d.getMonth()-1);
        start = monthStart(d); end = monthEnd(d); break;
      }
      case '30d': {
        const d = new Date(now); d.setDate(d.getDate()-29);
        start = d; end = now; break;
      }
      case '3m': {
        const d = new Date(now); d.setMonth(d.getMonth()-2);
        start = monthStart(d); end = now; break;
      }
      case '6m': {
        const d = new Date(now); d.setMonth(d.getMonth()-5);
        start = monthStart(d); end = now; break;
      }
      case 'ytd': {
        start = new Date(now.getFullYear(), 0, 1); end = now; break;
      }
      default: return null;
    }
    return { preset, start: toStr(start), end: toStr(end) };
  }

  function setPeriod(period) {
    App.state.period = period;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.p === period.preset);
    });
    const inp = document.getElementById('dateRangeInput');
    if (inp) inp.value = `${fmt(period.start)} ~ ${fmt(period.end)}`;
    App.events.dispatchEvent(new CustomEvent('period', { detail: period }));
    // 로드된 iframe 모두 동기화
    syncAllFrames();
  }

  // ── 탭 라우팅 (lazy iframe 로드) ──────────────
  const TABS = ['ops', 'product', 'pl'];

  // 각 iframe 내부에서 숨길 selector (제목 + 자체 필터바)
  const HIDE_SELECTORS = {
    product: '.hdr, .sticky-bar',
    ops:     '.hdr, .ctrl-bar',
    pl:      '.header, .sel-card',
  };

  function injectFrameStyles(name, frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const sel = HIDE_SELECTORS[name];
      if (!sel) return;
      let style = doc.getElementById('__unified_inject_style');
      if (!style) {
        style = doc.createElement('style');
        style.id = '__unified_inject_style';
        doc.head.appendChild(style);
      }
      style.textContent = `
        ${sel} { display: none !important; }
        body { padding-top: 0 !important; }
        .wrap, .container, .main { padding-top: 12px !important; }
      `;
    } catch (e) {
      console.warn('[App] frame style inject failed:', e);
    }
  }

  function lazyLoadFrame(name) {
    const panel = document.getElementById(`tab-${name}`);
    if (!panel) return;
    const frame = panel.querySelector('iframe.tab-frame');
    if (!frame) return;
    if (!frame.src && frame.dataset.src) {
      frame.src = frame.dataset.src;
      frame.addEventListener('load', () => {
        injectFrameStyles(name, frame);
        // 로드 직후 현재 기간으로 동기화
        setTimeout(() => syncFrame(name, frame), 800);
      }, { once: false });
    } else {
      injectFrameStyles(name, frame);
      syncFrame(name, frame);
    }
  }

  // iframe 안의 글로벌 스코프에서 코드 실행 (script 주입 방식 — let/const 변수 접근 가능)
  function runInFrame(frame, code) {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return false;
    try {
      const s = doc.createElement('script');
      s.textContent = code;
      doc.body.appendChild(s);
      doc.body.removeChild(s);
      return true;
    } catch (e) {
      console.warn('[App] runInFrame failed:', e);
      return false;
    }
  }

  // ── iframe 동기화 (탭별 다른 필터 메커니즘 처리) ──────
  function syncFrame(name, frame) {
    const period = App.state.period;
    if (!period || !period.start) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    try {
      if (name === 'product') {
        const fromYM = period.start.slice(0, 7);  // 'YYYY-MM'
        const toYM   = period.end.slice(0, 7);
        const mf = doc.getElementById('month-from');
        const mt = doc.getElementById('month-to');
        // 옵션 2개 이상 있어야 데이터 로드 완료 (placeholder + 월목록)
        if (!mf || !mt || mf.options.length < 2) {
          setTimeout(() => syncFrame(name, frame), 800);
          return;
        }
        // 매칭: 정확 → YYMM('2604') → YY-MM 등 다양한 형식 대비
        const yymmFrom = fromYM.slice(2,4) + fromYM.slice(5,7);  // '2604'
        const yymmTo   = toYM.slice(2,4) + toYM.slice(5,7);
        const findOpt = (el, candidates) => {
          for (const c of candidates) {
            for (const opt of el.options) if (opt.value === c) return c;
          }
          // fallback: 가장 가까운(작거나 같은) 값
          const sorted = [...el.options].map(o => o.value).filter(v => v).sort();
          let best = sorted[0];
          for (const v of sorted) if (v <= candidates[candidates.length-1]) best = v;
          return best;
        };
        const fVal = findOpt(mf, [fromYM, yymmFrom]);
        const tVal = findOpt(mt, [toYM, yymmTo]);
        mf.value = fVal; mt.value = tVal;
        console.log('[product sync]', {fromYM, toYM, fVal, tVal, optCount: mf.options.length});
        runInFrame(frame, `if (typeof onRangeChange === 'function') onRangeChange();`);
      }
      else if (name === 'ops') {
        runInFrame(frame, `
          try {
            if (typeof picker !== 'undefined' && picker.setDateRange) {
              picker.setDateRange('${period.start}', '${period.end}');
            }
            if (typeof fpStart !== 'undefined') fpStart = '${period.start}';
            if (typeof fpEnd !== 'undefined') fpEnd = '${period.end}';
            if (typeof curPreset !== 'undefined') curPreset = '${period.preset || ''}';
            if (typeof render === 'function') render();
          } catch (e) { console.warn('[ops sync]', e); }
        `);
      }
      else if (name === 'pl') {
        // 기간 내 월 목록 계산 후 selMonths 갱신
        const months = [];
        let [y, m] = period.start.slice(0, 7).split('-').map(Number);
        const [endY, endM] = period.end.slice(0, 7).split('-').map(Number);
        while (y < endY || (y === endY && m <= endM)) {
          months.push(`${y}-${String(m).padStart(2,'0')}`);
          m++; if (m > 12) { m = 1; y++; }
        }
        const monthsLit = JSON.stringify(months);
        runInFrame(frame, `
          try {
            if (typeof selMonths !== 'undefined') {
              selMonths.clear();
              ${monthsLit}.forEach(ym => selMonths.add(ym));
            }
            if (typeof buildMonthChecks === 'function') buildMonthChecks();
            if (typeof updateAll === 'function') updateAll();
          } catch (e) { console.warn('[pl sync]', e); }
        `);
      }
    } catch (e) {
      console.warn(`[App] syncFrame(${name}) failed:`, e);
    }
  }

  // 모든 로드된 iframe 동기화
  function syncAllFrames() {
    TABS.forEach(name => {
      const panel = document.getElementById(`tab-${name}`);
      const frame = panel?.querySelector('iframe.tab-frame');
      if (frame && frame.src) syncFrame(name, frame);
    });
  }
  function showTab(name) {
    if (!TABS.includes(name)) name = 'ops';
    App.state.activeTab = name;
    document.body.dataset.tab = name;  // CSS에서 일 단위 프리셋 숨김에 활용
    document.querySelectorAll('.hdr-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.hidden = (p.id !== `tab-${name}`);
    });
    lazyLoadFrame(name);
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    App.events.dispatchEvent(new CustomEvent('tabchange', { detail: name }));

    // 탭별 호환 안 되는 프리셋 자동 보정 (이번 달로 리셋)
    const cur = App.state.period?.preset;
    let needFix = false;
    if (name !== 'ops' && (cur === 'yesterday' || cur === 'week')) needFix = true;
    if (name === 'ops' && (cur === '3m' || cur === '6m')) needFix = true;
    if (needFix) {
      const p = computePeriod('mtd');
      if (p) {
        App._programmaticPicker = true;
        try { if (App.picker?.setDateRange) App.picker.setDateRange(p.start, p.end); }
        finally { App._programmaticPicker = false; }
        setPeriod(p);
      }
    }
  }
  App.showTab = showTab;

  // ── 초기화 ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {

    // 탭 클릭
    document.querySelectorAll('.hdr-tab').forEach(b => {
      b.addEventListener('click', () => showTab(b.dataset.tab));
    });
    window.addEventListener('hashchange', () => {
      const t = (location.hash || '#ops').slice(1);
      if (t !== App.state.activeTab) showTab(t);
    });

    // 프리셋 버튼
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = computePeriod(btn.dataset.p);
        if (!p) return;
        // picker.setDateRange가 selected 이벤트 발화 시 무시하도록 플래그
        App._programmaticPicker = true;
        try {
          if (App.picker && App.picker.setDateRange) {
            App.picker.setDateRange(p.start, p.end);
          }
        } finally {
          App._programmaticPicker = false;
        }
        setPeriod(p);
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

    // Litepicker
    if (window.Litepicker) {
      const def = computePeriod('mtd');
      const picker = new Litepicker({
        element: document.getElementById('dateRangeInput'),
        singleMode: false,
        numberOfMonths: 2,
        numberOfColumns: 2,
        splitView: true,
        lang: 'ko-KR',
        format: 'YYYY-MM-DD',
        startDate: def.start,
        endDate: def.end,
        setup(p) {
          p.on('selected', (s, e) => {
            // 프로그램이 picker.setDateRange() 호출했을 때는 무시
            if (App._programmaticPicker) return;
            setPeriod({ preset: 'custom', start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD') });
          });
        }
      });
      App.picker = picker;
    }

    // 초기 기간: 이번 달
    setPeriod(computePeriod('mtd'));

    // 초기 탭
    const t = (location.hash || '#ops').slice(1);
    showTab(t);
  });

  App.fetchJson = async (url) => {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  };

  console.log('[App] shared.js loaded');
})();
