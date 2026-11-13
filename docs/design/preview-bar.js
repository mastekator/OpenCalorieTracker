/* Prototype preview bar — shared by all docs/design/oct-* prototypes. Not part of the app.
 * Theme: System / Light / Dark → data-theme on <html>; choice is remembered across prototypes.
 * ?theme=light|dark in the URL still wins (used for screenshots). */
(() => {
  const KEY = 'oct-preview-theme';
  const root = document.documentElement;
  const fromUrl = new URLSearchParams(location.search).get('theme');
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  const apply = (v) => {
    if (v === 'light' || v === 'dark') root.dataset.theme = v;
    else delete root.dataset.theme;
  };
  let current = fromUrl || saved || 'system';
  apply(current); // runs in <head>, before first paint

  const css = `
.pv-bar{position:sticky;top:0;z-index:1000;display:flex;align-items:center;gap:var(--space-3);
  margin:calc(-1 * var(--space-10)) calc(-1 * var(--space-8)) var(--space-8);padding:var(--space-2) var(--space-8);
  background:var(--color-surface);border-bottom:1px solid var(--color-separator);
  font:500 var(--text-footnote-size)/1 var(--font-sans);color:var(--color-text-secondary)}
.pv-seg{display:inline-flex;padding:2px;border-radius:var(--radius-md);background:var(--color-surface-2)}
.pv-seg button{min-height:32px;padding:0 var(--space-3);border:0;border-radius:var(--radius-sm);background:none;
  font:inherit;color:var(--color-text);cursor:pointer}
.pv-seg button[aria-pressed="true"]{background:var(--color-accent);color:var(--color-on-accent)}
.pv-seg button:focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
@media print{.pv-bar{display:none}}`;

  const build = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const bar = document.createElement('div');
    bar.className = 'pv-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Prototype preview');
    bar.innerHTML = '<span>Тема</span><div class="pv-seg"></div>';
    const seg = bar.querySelector('.pv-seg');
    const buttons = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        current = v;
        apply(v);
        try { localStorage.setItem(KEY, v); } catch (e) {}
        buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      b.setAttribute('aria-pressed', String(v === current));
      seg.appendChild(b);
      return b;
    });
    document.body.prepend(bar);
  };
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
