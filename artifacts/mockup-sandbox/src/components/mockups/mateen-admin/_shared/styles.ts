export const adminStyles = `
.ma-root {
  --p: #6D4C3D; --s: #994703; --t: #4E3A00; --parch: #FDF9F3;
  --bg: #F7F0E6; --card: #FFFDF9; --line: #E6DACB; --line2: #D8C8B4;
  --ink: #2A1F19; --ink2: #5E4A3F; --ink3: #8B7565;
  --wal: #2A1A13; --wal2: #3A2519; --wal-ink: #F1E6D8; --wal-mute: #B79E8A;
  --ok: #3E6B3A; --ok-bg: #E4EEDF; --warn: #8A5A00; --warn-bg: #F7E9C8; --danger: #8F2F22; --danger-bg: #F6DED8; --info: #395C74; --info-bg: #DEE8EF;
  --p-bg: #EFE4DC; --s-bg: #F6E3D2; --t-bg: #EFE6CE;
  --radius: 14px; --shadow: 0 1px 2px rgba(60,35,20,.06), 0 8px 24px -12px rgba(60,35,20,.18);
  font-family: 'Cairo', system-ui, sans-serif; color: var(--ink); background: var(--bg);
  direction: rtl; min-height: 100dvh; display: flex; font-size: 14px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.ma-root.dark {
  --bg: #17110E; --card: #211915; --line: #33271F; --line2: #463629; --parch: #1D1512;
  --ink: #F0E6DA; --ink2: #CDBBA9; --ink3: #94816F;
  --wal: #120C09; --wal2: #1D1410; --wal-ink: #F1E6D8; --wal-mute: #9A836F;
  --ok: #9CC493; --ok-bg: #22301F; --warn: #E2B25A; --warn-bg: #3A2D12; --danger: #E38B7D; --danger-bg: #3E1F19; --info: #93B7CE; --info-bg: #1D2C36;
  --p: #C9A48F; --s: #E27A2E; --t: #D9B85A; --p-bg: #302219; --s-bg: #3A2313; --t-bg: #33290F;
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
}
.ma-root *, .ma-root *::before, .ma-root *::after { box-sizing: border-box; }
.ma-root button { font-family: inherit; cursor: pointer; }
.ma-root input, .ma-root select, .ma-root textarea { font-family: inherit; }
.ma-display { font-family: 'Kufam', 'Cairo', sans-serif; }
.ma-naskh { font-family: 'Noto Naskh Arabic', serif; }
.ma-root h1,.ma-root h2,.ma-root h3 { font-family: 'Kufam', 'Cairo', sans-serif; margin: 0; letter-spacing: -0.01em; }

/* ---------- shell ---------- */
.ma-side {
  width: 264px; flex-shrink: 0; background: var(--wal); color: var(--wal-ink);
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100dvh;
  background-image: radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px); background-size: 22px 22px;
  border-left: 1px solid rgba(0,0,0,.3);
}
.ma-side-brand { padding: 22px 22px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,.08); }
.ma-logo { height: 40px; width: auto; display: block; filter: brightness(0) invert(1) opacity(.92); }
.ma-side-brand-t { font-family: 'Kufam', sans-serif; font-weight: 700; font-size: 17px; line-height: 1.2; }
.ma-side-brand-s { font-size: 11px; color: var(--wal-mute); }
.ma-nav { padding: 14px 12px; display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
.ma-nav-group { font-size: 10.5px; letter-spacing: .12em; color: var(--wal-mute); padding: 14px 12px 6px; text-transform: uppercase; }
.ma-nav-item {
  display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 10px; color: var(--wal-ink);
  background: transparent; border: 0; width: 100%; text-align: right; font-size: 13.5px; font-weight: 600; position: relative;
  transition: background .15s, transform .15s;
}
.ma-nav-item:hover { background: rgba(255,255,255,.06); }
.ma-nav-item.active { background: rgba(255,255,255,.1); color: #fff; }
.ma-nav-item.active::before { content: ''; position: absolute; right: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: var(--s); }
.ma-nav-item svg { opacity: .8; flex-shrink: 0; }
.ma-nav-count { margin-right: auto; background: var(--s); color: #fff; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 99px; min-width: 20px; text-align: center; }
.ma-side-foot { padding: 14px 16px; border-top: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; gap: 10px; }
.ma-side-foot-n { font-size: 13px; font-weight: 700; line-height: 1.2; }
.ma-side-foot-r { font-size: 11px; color: var(--wal-mute); }

.ma-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ma-topbar {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 10px 24px;
  background: color-mix(in srgb, var(--parch) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line);
}
.ma-topbar-title { font-family: 'Kufam', sans-serif; font-weight: 700; font-size: 15px; }
.ma-crumb { font-size: 12px; color: var(--ink3); }
.ma-demo { font-size: 11px; font-weight: 700; color: var(--t); background: var(--t-bg); padding: 3px 10px; border-radius: 99px; border: 1px dashed color-mix(in srgb, var(--t) 45%, transparent); white-space: nowrap; }
.ma-search { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; min-width: 200px; color: var(--ink3); }
.ma-search input { border: 0; outline: 0; background: transparent; color: var(--ink); width: 100%; font-size: 13px; }
.ma-iconbtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink2); display: inline-flex; align-items: center; justify-content: center; transition: background .15s; }
.ma-iconbtn:hover { background: var(--p-bg); }
.ma-content { padding: 22px 24px 60px; max-width: 1400px; width: 100%; margin: 0 auto; background: var(--parch); flex: 1; animation: ma-in .35s ease both; }
.ma-main { background: var(--parch); }
@keyframes ma-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ma-burger { display: none; }
.ma-scrim { display: none; }
.ma-mobile-tabs { display: none; }

/* ---------- typography blocks ---------- */
.ma-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.ma-h1 { font-size: 24px; font-weight: 700; color: var(--ink); }
.ma-sub { margin: 4px 0 0; color: var(--ink3); font-size: 13px; font-family: 'Noto Naskh Arabic', serif; }
.ma-pagehead-action { display: flex; gap: 8px; flex-wrap: wrap; }

/* ---------- cards ---------- */
.ma-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px 18px; }
.ma-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.ma-card-title { font-size: 14px; font-weight: 700; color: var(--ink); }
.ma-grid { display: grid; gap: 14px; }
.ma-grid-4 { grid-template-columns: repeat(4, 1fr); }
.ma-grid-3 { grid-template-columns: repeat(3, 1fr); }
.ma-grid-2 { grid-template-columns: repeat(2, 1fr); }
.ma-grid-main { grid-template-columns: 1.6fr 1fr; }
.ma-grid-detail { grid-template-columns: 1fr 380px; align-items: start; }

.ma-stat { border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line); background: var(--card); position: relative; overflow: hidden; }
.ma-stat::after { content: ''; position: absolute; left: -20px; top: -20px; width: 80px; height: 80px; border-radius: 50%; opacity: .18; }
.ma-stat-primary::after { background: var(--p); } .ma-stat-secondary::after { background: var(--s); } .ma-stat-tertiary::after { background: var(--t); }
.ma-stat-label { font-size: 12px; color: var(--ink3); font-weight: 600; }
.ma-stat-value { font-family: 'Kufam', sans-serif; font-size: 26px; font-weight: 700; color: var(--ink); line-height: 1.2; font-variant-numeric: tabular-nums; }
.ma-stat-delta { font-size: 11.5px; color: var(--ink2); font-family: 'Noto Naskh Arabic', serif; }

/* ---------- badges & buttons ---------- */
.ma-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 99px; white-space: nowrap; line-height: 1.6; }
.ma-badge-muted { background: var(--p-bg); color: var(--ink2); }
.ma-badge-primary { background: var(--p); color: #fff; }
.ma-badge-ok { background: var(--ok-bg); color: var(--ok); }
.ma-badge-warn { background: var(--warn-bg); color: var(--warn); }
.ma-badge-danger { background: var(--danger-bg); color: var(--danger); }
.ma-badge-info { background: var(--info-bg); color: var(--info); }

.ma-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 10px; font-weight: 700; border: 1px solid transparent; transition: transform .12s, background .15s, opacity .15s; white-space: nowrap; }
.ma-btn:active { transform: translateY(1px); }
.ma-btn:disabled { opacity: .45; cursor: not-allowed; }
.ma-btn-md { padding: 8px 14px; font-size: 13px; } .ma-btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
.ma-btn-primary { background: var(--p); color: #fff; } .ma-btn-primary:hover { background: color-mix(in srgb, var(--p) 88%, black); }
.ma-btn-secondary { background: var(--s); color: #fff; } .ma-btn-secondary:hover { background: color-mix(in srgb, var(--s) 88%, black); }
.ma-btn-outline { background: var(--card); color: var(--ink); border-color: var(--line2); } .ma-btn-outline:hover { background: var(--p-bg); }
.ma-btn-ghost { background: transparent; color: var(--ink2); } .ma-btn-ghost:hover { background: var(--p-bg); }
.ma-btn-danger { background: var(--danger-bg); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); } .ma-btn-danger:hover { background: var(--danger); color: #fff; }

.ma-initials { display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; font-family: 'Kufam', sans-serif; font-weight: 700; flex-shrink: 0; letter-spacing: .02em; }
.ma-initials-primary { background: var(--p-bg); color: var(--p); } .ma-initials-secondary { background: var(--s-bg); color: var(--s); } .ma-initials-tertiary { background: var(--t-bg); color: var(--t); } .ma-initials-muted { background: var(--line); color: var(--ink2); }

/* ---------- tables ---------- */
.ma-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.ma-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
.ma-table th { text-align: right; font-size: 11.5px; color: var(--ink3); font-weight: 700; padding: 10px 14px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--p-bg) 50%, var(--card)); white-space: nowrap; }
.ma-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.ma-table tbody tr { transition: background .12s; cursor: pointer; }
.ma-table tbody tr:hover { background: color-mix(in srgb, var(--p-bg) 55%, var(--card)); }
.ma-table tbody tr.sel { background: var(--p-bg); }
.ma-table tbody tr:last-child td { border-bottom: 0; }
.ma-cell-name { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.ma-cell-sub { font-size: 11.5px; color: var(--ink3); font-weight: 500; display: block; }
.ma-num { font-variant-numeric: tabular-nums; font-family: 'Kufam', sans-serif; }

/* ---------- filters / forms ---------- */
.ma-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.ma-chip { border: 1px solid var(--line2); background: var(--card); color: var(--ink2); border-radius: 99px; padding: 4px 12px; font-size: 12px; font-weight: 700; transition: all .15s; }
.ma-chip:hover { border-color: var(--p); }
.ma-chip.on { background: var(--p); color: #fff; border-color: var(--p); }
.ma-chip.on-s { background: var(--s); color: #fff; border-color: var(--s); }
.ma-field { display: flex; flex-direction: column; gap: 5px; }
.ma-label { font-size: 12px; font-weight: 700; color: var(--ink2); }
.ma-hint { font-size: 11px; color: var(--ink3); }
.ma-input, .ma-select, .ma-textarea { width: 100%; border: 1px solid var(--line2); background: var(--card); color: var(--ink); border-radius: 10px; padding: 8px 12px; font-size: 13px; outline: 0; transition: border .15s, box-shadow .15s; }
.ma-input:focus, .ma-select:focus, .ma-textarea:focus { border-color: var(--s); box-shadow: 0 0 0 3px color-mix(in srgb, var(--s) 18%, transparent); }
.ma-textarea { min-height: 88px; resize: vertical; font-family: 'Noto Naskh Arabic', serif; font-size: 14px; }
.ma-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ma-switch { width: 38px; height: 22px; border-radius: 99px; background: var(--line2); position: relative; border: 0; transition: background .2s; flex-shrink: 0; }
.ma-switch::after { content: ''; position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s; }
.ma-switch.on { background: var(--s); } .ma-switch.on::after { transform: translateX(-16px); }

/* ---------- misc ---------- */
.ma-list { display: flex; flex-direction: column; }
.ma-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.ma-row:last-child { border-bottom: 0; }
.ma-row-main { flex: 1; min-width: 0; }
.ma-row-t { font-weight: 700; font-size: 13px; }
.ma-row-s { font-size: 12px; color: var(--ink3); }
.ma-kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; font-size: 13px; }
.ma-kv dt { color: var(--ink3); font-weight: 600; } .ma-kv dd { margin: 0; }
.ma-note { border-radius: 10px; padding: 10px 12px; font-size: 12.5px; border: 1px solid; font-family: 'Noto Naskh Arabic', serif; line-height: 1.7; }
.ma-note-warn { background: var(--warn-bg); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.ma-note-info { background: var(--info-bg); color: var(--info); border-color: color-mix(in srgb, var(--info) 30%, transparent); }
.ma-note-ok { background: var(--ok-bg); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 30%, transparent); }
.ma-bar { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; }
.ma-bar > span { display: block; height: 100%; border-radius: 99px; background: var(--s); transition: width .5s ease; }
.ma-bar.p > span { background: var(--p); } .ma-bar.t > span { background: var(--t); }
.ma-doc { background: var(--bg); border: 1px solid var(--line2); border-radius: 10px; padding: 16px; position: relative; overflow: hidden; min-height: 180px; }
.ma-doc-lines { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; }
.ma-doc-lines span { display: block; height: 7px; border-radius: 4px; background: var(--line2); }
.ma-doc-seal { position: absolute; left: 18px; bottom: 16px; width: 58px; height: 58px; border-radius: 50%; border: 2px solid var(--s); opacity: .5; display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--s); font-weight: 700; transform: rotate(-12deg); }
.ma-doc-tag { position: absolute; top: 10px; left: 10px; font-size: 10px; background: var(--card); border: 1px solid var(--line2); padding: 1px 7px; border-radius: 6px; color: var(--ink3); }
.ma-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 14px; overflow-x: auto; }
.ma-tab { border: 0; background: transparent; padding: 8px 14px; font-weight: 700; font-size: 13px; color: var(--ink3); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.ma-tab.on { color: var(--s); border-bottom-color: var(--s); }
.ma-empty { text-align: center; padding: 32px 16px; color: var(--ink3); }
.ma-empty-mark { width: 44px; height: 44px; margin: 0 auto 10px; border-radius: 12px; border: 1.5px dashed var(--line2); transform: rotate(45deg); }
.ma-empty-title { font-weight: 700; color: var(--ink2); margin: 0; } .ma-empty-sub { margin: 2px 0 0; font-size: 12px; }
.ma-toast { position: fixed; bottom: 22px; left: 22px; z-index: 60; background: var(--wal); color: var(--wal-ink); padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; box-shadow: var(--shadow); animation: ma-toast .3s ease; display: flex; align-items: center; gap: 8px; max-width: 360px; }
@keyframes ma-toast { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ma-timeline { position: relative; padding-right: 18px; }
.ma-timeline::before { content: ''; position: absolute; right: 5px; top: 6px; bottom: 6px; width: 1.5px; background: var(--line2); }
.ma-tl-item { position: relative; padding: 6px 0 14px; }
.ma-tl-item::before { content: ''; position: absolute; right: -16.5px; top: 12px; width: 9px; height: 9px; border-radius: 50%; background: var(--card); border: 2px solid var(--p); }
.ma-tl-item.k-approve::before { border-color: var(--ok); } .ma-tl-item.k-reject::before { border-color: var(--danger); } .ma-tl-item.k-delete::before { border-color: var(--danger); background: var(--danger); } .ma-tl-item.k-create::before { border-color: var(--s); } .ma-tl-item.k-system::before { border-color: var(--ink3); }
.ma-sparkbars { display: flex; align-items: flex-end; gap: 5px; height: 90px; }
.ma-sparkbars > div { flex: 1; border-radius: 4px 4px 0 0; background: var(--p); opacity: .75; transition: transform .2s; transform-origin: bottom; }
.ma-sparkbars > div:hover { opacity: 1; }
.ma-sparkbars > div.hi { background: var(--s); opacity: 1; }
.ma-detail-empty { border: 1.5px dashed var(--line2); border-radius: var(--radius); padding: 40px 20px; text-align: center; color: var(--ink3); font-size: 13px; background: color-mix(in srgb, var(--card) 60%, transparent); }
.ma-mono { font-family: 'Kufam', sans-serif; font-variant-numeric: tabular-nums; }

/* ---------- overlay ---------- */
.ma-overlay { position: fixed; inset: 0; background: rgba(30,18,12,.5); backdrop-filter: blur(3px); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; animation: ma-fade .2s ease; }
@keyframes ma-fade { from { opacity: 0; } to { opacity: 1; } }
.ma-modal { background: var(--card); color: var(--ink); border-radius: 18px; width: 100%; max-width: 520px; max-height: 90dvh; display: flex; flex-direction: column; box-shadow: 0 30px 60px -20px rgba(0,0,0,.4); border: 1px solid var(--line); animation: ma-pop .25s cubic-bezier(.2,.8,.2,1); direction: rtl; font-family: 'Cairo', sans-serif; }
.ma-modal-wide { max-width: 760px; }
@keyframes ma-pop { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
.ma-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.ma-modal-title { font-size: 16px; font-weight: 700; }
.ma-modal-body { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.ma-modal-foot { padding: 14px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-start; gap: 8px; flex-wrap: wrap; }

/* ---------- responsive ---------- */
@media (max-width: 1100px) {
  .ma-grid-4 { grid-template-columns: repeat(2, 1fr); }
  .ma-grid-main, .ma-grid-detail, .ma-grid-3 { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .ma-side { position: fixed; right: 0; top: 0; z-index: 45; transform: translateX(100%); transition: transform .25s ease; box-shadow: none; }
  .ma-side.open { transform: none; box-shadow: -20px 0 50px rgba(0,0,0,.35); }
  .ma-scrim { display: block; position: fixed; inset: 0; background: rgba(20,10,5,.45); z-index: 40; animation: ma-fade .2s; }
  .ma-burger { display: inline-flex; }
  .ma-content { padding: 16px 14px 90px; }
  .ma-topbar { padding: 10px 14px; }
  .ma-search { display: none; }
  .ma-grid-2, .ma-form-grid { grid-template-columns: 1fr; }
  .ma-mobile-tabs { display: flex; position: fixed; bottom: 0; right: 0; left: 0; z-index: 30; background: var(--wal); color: var(--wal-ink); padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); justify-content: space-around; border-top: 1px solid rgba(255,255,255,.08); }
  .ma-mobile-tab { background: transparent; border: 0; color: var(--wal-mute); display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 8px; position: relative; }
  .ma-mobile-tab.active { color: #fff; }
  .ma-mobile-tab.active::after { content: ''; position: absolute; top: -6px; width: 18px; height: 2px; border-radius: 2px; background: var(--s); }
  .ma-h1 { font-size: 20px; }
}
@media (max-width: 520px) { .ma-grid-4 { grid-template-columns: 1fr 1fr; } .ma-stat-value { font-size: 22px; } }
`;
