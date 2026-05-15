/* Shared resizable / collapsible panel system for all preview variants.
   Usage:
     <main class="app">
       <aside data-panel="sidebar" data-initial="304" data-min="220" data-max="520">…</aside>
       <section data-panel="workspace" data-flex="1">…</section>
       <aside data-panel="inspector" data-initial="380" data-min="260" data-max="560">…</aside>
     </main>
     <button data-collapse-panel="sidebar">…</button>
     <button data-collapse-panel="inspector">…</button>
     <script>PREVIEW_PANELS.setup({ root: '.app', key: 'atlas' });</script>

   Features:
   - Drag handles inserted between consecutive resizable panels.
   - Width and collapsed state persisted in localStorage per `key`.
   - Pointer-event based (mouse + touch).
   - Respects data-min / data-max on each panel.
   - Skips panels marked data-fixed="1" (e.g. nav-rail).
   - Collapse buttons hide a panel and its adjacent splitter.
*/
(function () {
  const STORE = 'preview-panels-v2';

  function readAll() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
  }
  function read(key) { return readAll()[key] || {}; }
  function write(key, val) {
    try { const all = readAll(); all[key] = val; localStorage.setItem(STORE, JSON.stringify(all)); } catch {}
  }

  function setup(opts) {
    const root = document.querySelector(opts.root);
    if (!root) return null;
    const key = opts.key || 'default';
    const state = read(key);

    const children = [...root.children];
    const panels = children.filter(c => c.dataset.panel);

    // Apply saved widths
    panels.forEach(p => {
      const id = p.dataset.panel;
      const w = state[id];
      if (w && p.dataset.flex !== '1' && p.dataset.fixed !== '1') {
        p.style.width = w + 'px';
      }
      if (state['__c_' + id]) p.dataset.collapsed = '1';
    });

    // Insert splitters between consecutive resizable panels.
    // Skip if either neighbor is data-fixed (e.g. a 56px icon nav-rail) — those don't resize.
    const splitters = [];
    for (let i = 0; i < panels.length - 1; i++) {
      const a = panels[i], b = panels[i + 1];
      if (a.dataset.fixed === '1' || b.dataset.fixed === '1') continue;
      const sp = document.createElement('div');
      sp.className = 'panel-splitter';
      sp.setAttribute('role', 'separator');
      sp.setAttribute('aria-orientation', 'vertical');
      sp.setAttribute('aria-label', 'Resize');
      root.insertBefore(sp, b);
      splitters.push(sp);
      attachDrag(sp, a, b, root, key);
    }

    rebuildGrid(root);

    // Hook up external collapse buttons
    document.querySelectorAll('[data-collapse-panel]').forEach(btn => {
      btn.addEventListener('click', () => togglePanel(root, key, btn.dataset.collapsePanel, btn));
      const panel = root.querySelector(`[data-panel="${btn.dataset.collapsePanel}"]`);
      if (panel) btn.setAttribute('aria-pressed', panel.dataset.collapsed === '1' ? 'true' : 'false');
    });

    return { rebuildGrid: () => rebuildGrid(root) };
  }

  function togglePanel(root, key, id, btn) {
    const panel = root.querySelector(`[data-panel="${id}"]`);
    if (!panel) return;
    const isCol = panel.dataset.collapsed === '1';
    panel.dataset.collapsed = isCol ? '0' : '1';
    const all = read(key);
    all['__c_' + id] = !isCol;
    write(key, all);
    rebuildGrid(root);
    if (btn) btn.setAttribute('aria-pressed', !isCol ? 'true' : 'false');
  }

  function rebuildGrid(root) {
    const tracks = [];
    const kids = [...root.children];
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.classList.contains('panel-splitter')) {
        const prev = kids[i - 1], next = kids[i + 1];
        const hide = (prev && prev.dataset.collapsed === '1') || (next && next.dataset.collapsed === '1');
        if (hide) {
          c.style.display = 'none';
        } else {
          c.style.display = '';
          tracks.push('var(--splitter-w, 6px)');
        }
      } else if (c.dataset.panel) {
        if (c.dataset.collapsed === '1') {
          c.style.display = 'none';
        } else {
          c.style.display = '';
          if (c.dataset.flex === '1') tracks.push('minmax(0, 1fr)');
          else if (c.dataset.fixed === '1') tracks.push((c.dataset.initial || c.offsetWidth) + 'px');
          else if (c.style.width) tracks.push(c.style.width);
          else tracks.push((c.dataset.initial || 260) + 'px');
        }
      } else {
        // Unknown child (e.g. status bar, floating element) — leave it
        // If it participates in the grid, fall back to auto
        tracks.push('auto');
      }
    }
    root.style.gridTemplateColumns = tracks.join(' ');
  }

  function attachDrag(handle, a, b, root, key) {
    let startX, startW, target, dir;
    handle.addEventListener('pointerdown', (e) => {
      // Pick the side that has a fixed width (not flex/fixed-rail) as the resize target
      const aFlex = a.dataset.flex === '1' || a.dataset.fixed === '1';
      const bFlex = b.dataset.flex === '1' || b.dataset.fixed === '1';
      if (!aFlex && !bFlex) { target = a; dir = 1; }
      else if (!aFlex) { target = a; dir = 1; }
      else if (!bFlex) { target = b; dir = -1; }
      else { return; } // both flex/fixed — nothing to resize
      e.preventDefault();
      startX = e.clientX;
      startW = target.offsetWidth;
      try { handle.setPointerCapture(e.pointerId); } catch {}
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    handle.addEventListener('pointermove', (e) => {
      if (!target) return;
      const delta = (e.clientX - startX) * dir;
      const min = Number(target.dataset.min) || 200;
      const max = Number(target.dataset.max) || 640;
      const newW = Math.max(min, Math.min(max, startW + delta));
      target.style.width = newW + 'px';
      rebuildGrid(root);
    });
    function end(e) {
      if (!target) return;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const all = read(key);
      all[target.dataset.panel] = target.offsetWidth;
      write(key, all);
      target = undefined;
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    // Double-click splitter resets the panel to its initial width
    handle.addEventListener('dblclick', () => {
      const a2 = handle.previousElementSibling, b2 = handle.nextElementSibling;
      const aFlex = a2.dataset.flex === '1' || a2.dataset.fixed === '1';
      const t = aFlex ? b2 : a2;
      if (!t) return;
      const init = Number(t.dataset.initial) || 280;
      t.style.width = init + 'px';
      const all = read(key); delete all[t.dataset.panel]; write(key, all);
      rebuildGrid(root);
    });
  }

  window.PREVIEW_PANELS = { setup, toggle: (rootSel, key, id) => togglePanel(document.querySelector(rootSel), key, id) };
})();
