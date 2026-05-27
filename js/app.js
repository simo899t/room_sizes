// ─── App State & UI Controller ────────────────────────────────
const App = (() => {
  // ── State ────────────────────────────────────────────────────
  const state = {
    tool: 'select',
    view: '2d',
    sketchMode: 'line',
    wallThickness: 15,
    pendingShape: 'rect',
    pendingObject: null,
    selected: null,
    activeFloorIdx: 0,
    floors: [
      { name: 'Ground Floor', walls: [], objects: [], snapPoints: [] },
    ],

    currentFloor() { return this.floors[this.activeFloorIdx]; },

    setTool(t) {
      this.tool = t;
      activateTool(t);
    },
    setSelected(item) {
      this.selected = item;
      updateSelectionUI(item);
      updatePropertiesUI(item);
      C2D.render();
    },
    markDirty() {
      updateStats();
      updateLayers();
      if (this.view === '3d') S3D.refresh();
    },
  };

  // ── Boot ─────────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('canvas2d');
    const container3d = document.getElementById('canvas3d');

    C2D.init(canvas, state);
    S3D.init(container3d, state);

    bindToolbar();
    bindPanels();
    bindZoom();
    bindFloors();

    populateObjectList('bedroom');
    updateStats();
    updateLayers();
  }

  // ── Toolbar ───────────────────────────────────────────────────
  function bindToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => state.setTool(btn.dataset.tool));
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.getElementById('btn-clear').addEventListener('click', clearAll);

    document.getElementById('scale-select').addEventListener('change', e => {
      // pxPerCm = parseInt(e.target.value) / 100 — handled by canvas scale
    });
  }

  // ── Tool activation / panel switching ─────────────────────────
  function activateTool(tool) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

    const panels = ['select', 'room', 'sketch', 'object', 'measure'];
    panels.forEach(p => {
      const el = document.getElementById('panel-' + p);
      if (el) el.style.display = p === tool ? '' : 'none';
    });
    // show select panel always as fallback when select
    if (tool === 'select') document.getElementById('panel-select-info').style.display = '';

    const statusMsgs = {
      select: 'Select & move objects',
      room:   'Choose shape and drag on canvas to draw a room',
      sketch: 'Click to place wall points — double-click or Enter to finish',
      object: 'Select an object then click on canvas to place it',
      measure:'Click two points to measure distance',
    };
    document.getElementById('status-msg').textContent = statusMsgs[tool] || 'Ready';
  }

  // ── Panels ────────────────────────────────────────────────────
  function bindPanels() {
    // Shape buttons
    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.pendingShape = btn.dataset.shape;
      });
    });

    // Place room button
    document.getElementById('btn-place-room').addEventListener('click', () => {
      const w = parseInt(document.getElementById('room-width').value) || 400;
      const h = parseInt(document.getElementById('room-height').value) || 300;
      const wall = {
        id: uid(), type: 'shape', shape: state.pendingShape,
        x: 50, y: 50, w, h, thickness: state.wallThickness,
      };
      state.currentFloor().walls.push(wall);
      state.setSelected(wall);
      state.markDirty();
      C2D.render();
    });

    // Sketch mode
    document.querySelectorAll('.sketch-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sketch-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.sketchMode = btn.dataset.sketch;
      });
    });

    // Wall thickness
    const wtSlider = document.getElementById('wall-thickness');
    const wtVal    = document.getElementById('wall-thickness-val');
    wtSlider.addEventListener('input', () => {
      state.wallThickness = parseInt(wtSlider.value);
      wtVal.textContent = wtSlider.value;
    });

    // Object categories
    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.cat === 'custom') {
          document.getElementById('object-list').style.display = 'none';
          document.getElementById('custom-object-panel').style.display = '';
        } else {
          document.getElementById('object-list').style.display = '';
          document.getElementById('custom-object-panel').style.display = 'none';
          populateObjectList(btn.dataset.cat);
        }
      });
    });

    // Add custom object
    document.getElementById('btn-add-custom').addEventListener('click', () => {
      const obj = {
        id: uid(),
        name: document.getElementById('custom-name').value || 'Custom',
        icon: '⬛',
        w:    parseInt(document.getElementById('custom-w').value) || 100,
        d:    parseInt(document.getElementById('custom-d').value) || 80,
        color: document.getElementById('custom-color').value,
      };
      state.pendingObject = obj;
      document.getElementById('status-msg').textContent = 'Click on canvas to place ' + obj.name;
    });

    // Delete selected
    document.getElementById('btn-delete-selected').addEventListener('click', () => {
      C2D.deleteSelected();
    });

    // Properties form
    document.getElementById('btn-apply-props').addEventListener('click', applyProperties);
  }

  // ── Object List ───────────────────────────────────────────────
  function populateObjectList(cat) {
    const list = document.getElementById('object-list');
    list.innerHTML = '';
    const items = OBJECTS[cat] || [];
    items.forEach(obj => {
      const div = document.createElement('div');
      div.className = 'obj-item';
      div.innerHTML = `
        <span class="obj-icon">${obj.icon}</span>
        <div class="obj-info">
          <div class="obj-name">${obj.name}</div>
          <div class="obj-size">${obj.w} × ${obj.d} cm</div>
        </div>`;
      div.addEventListener('click', () => {
        document.querySelectorAll('.obj-item').forEach(i => i.classList.remove('active'));
        div.classList.add('active');
        state.pendingObject = { ...obj };
        document.getElementById('status-msg').textContent = 'Click on canvas to place ' + obj.name;
      });
      list.appendChild(div);
    });
  }

  // ── Selection UI ──────────────────────────────────────────────
  function updateSelectionUI(item) {
    const info = document.getElementById('selection-info');
    const details = document.getElementById('selection-details');
    if (!item) { info.style.display = 'none'; return; }
    info.style.display = '';
    if (item.type === 'shape') {
      details.textContent = `${item.shape} room — ${Math.round(item.w)}×${Math.round(item.h)} cm`;
    } else if (item.type === 'wall') {
      const pts = item.points;
      const dx = pts[pts.length - 1].x - pts[0].x;
      const dy = pts[pts.length - 1].y - pts[0].y;
      details.textContent = `Wall — ${pts.length} points — ${Math.round(Math.sqrt(dx*dx+dy*dy))} cm span`;
    } else {
      details.textContent = `${item.name} — ${item.w}×${item.d} cm`;
    }
  }

  // ── Properties UI ─────────────────────────────────────────────
  function updatePropertiesUI(item) {
    const form = document.getElementById('properties-form');
    const empty = document.getElementById('properties-empty');
    if (!item) { form.style.display = 'none'; empty.style.display = ''; return; }
    form.style.display = '';
    empty.style.display = 'none';

    document.getElementById('prop-label').value = item.name || item.shape || 'Wall';
    document.getElementById('prop-w').value     = Math.round(item.w || item.w || 0);
    document.getElementById('prop-d').value     = Math.round(item.d || item.h || 0);
    document.getElementById('prop-rot').value   = item.rot || 0;
    document.getElementById('prop-color').value = item.color || '#4488aa';
  }

  function applyProperties() {
    const item = state.selected;
    if (!item) return;
    item.name  = document.getElementById('prop-label').value;
    const w    = parseInt(document.getElementById('prop-w').value);
    const d    = parseInt(document.getElementById('prop-d').value);
    item.rot   = parseInt(document.getElementById('prop-rot').value) || 0;
    item.color = document.getElementById('prop-color').value;
    if (item.type === 'shape') { item.w = w; item.h = d; }
    else if (!item.type || item.type === 'object') { item.w = w; item.d = d; }
    state.markDirty();
    C2D.render();
  }

  // ── Floors ────────────────────────────────────────────────────
  function bindFloors() {
    // Floor tabs live in layers panel
    renderFloorTabs();
  }

  function renderFloorTabs() {
    const layersEl = document.getElementById('layers-list');
    layersEl.innerHTML = '';

    // Floor row
    const floorsDiv = document.createElement('div');
    floorsDiv.className = 'floors-row';

    state.floors.forEach((floor, i) => {
      const tab = document.createElement('button');
      tab.className = 'floor-tab' + (i === state.activeFloorIdx ? ' active' : '');
      tab.textContent = floor.name;
      tab.addEventListener('click', () => {
        state.activeFloorIdx = i;
        renderFloorTabs();
        C2D.computeSnaps(state.currentFloor());
        state.markDirty();
        C2D.render();
      });
      floorsDiv.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'floor-add';
    addBtn.title = 'Add floor above';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', addFloor);
    floorsDiv.appendChild(addBtn);

    if (state.floors.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'floor-del';
      delBtn.title = 'Delete this floor';
      delBtn.textContent = '−';
      delBtn.addEventListener('click', deleteFloor);
      floorsDiv.appendChild(delBtn);
    }

    layersEl.appendChild(floorsDiv);
    updateLayers();
  }

  function addFloor() {
    const idx = state.activeFloorIdx + 1;
    const names = ['Basement', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Loft'];
    const name = names[state.floors.length] || `Floor ${state.floors.length}`;
    state.floors.splice(idx, 0, { name, walls: [], objects: [], snapPoints: [] });
    state.activeFloorIdx = idx;
    renderFloorTabs();
    state.markDirty();
    C2D.render();
  }

  function deleteFloor() {
    if (state.floors.length <= 1) return;
    state.floors.splice(state.activeFloorIdx, 1);
    state.activeFloorIdx = Math.max(0, state.activeFloorIdx - 1);
    renderFloorTabs();
    state.markDirty();
    C2D.render();
  }

  // ── Layers panel ──────────────────────────────────────────────
  function updateLayers() {
    // Update floor stats per layer list entries
  }

  // ── Stats ─────────────────────────────────────────────────────
  function updateStats() {
    const floor = state.currentFloor();
    let area = 0;
    floor.walls.filter(w => w.type === 'shape').forEach(w => {
      if (w.shape === 'circle') area += Math.PI * (w.w / 2) * (w.h / 2) / 10000;
      else area += w.w * w.h / 10000;
    });
    document.getElementById('stat-area').textContent    = area.toFixed(1);
    document.getElementById('stat-walls').textContent   = floor.walls.length;
    document.getElementById('stat-objects').textContent = floor.objects.length;
  }

  // ── View switching ────────────────────────────────────────────
  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    document.getElementById('canvas2d').style.display  = v === '2d' ? 'block' : 'none';
    document.getElementById('canvas3d').style.display  = v === '3d' ? 'block' : 'none';
    if (v === '3d') { S3D.start(); }
    else { S3D.stop(); C2D.render(); }
  }

  // ── Zoom ──────────────────────────────────────────────────────
  function bindZoom() {
    document.getElementById('btn-zoom-in') .addEventListener('click', () => C2D.zoom(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => C2D.zoom(0.85));
    document.getElementById('btn-zoom-fit').addEventListener('click', () => { C2D.fitView(); C2D.render(); });
  }

  // ── Clear ─────────────────────────────────────────────────────
  function clearAll() {
    if (!confirm('Clear everything?')) return;
    state.floors.forEach(f => { f.walls = []; f.objects = []; f.snapPoints = []; });
    state.selected = null;
    state.markDirty();
    updateSelectionUI(null);
    updatePropertiesUI(null);
    C2D.render();
  }

  function uid() { return Math.random().toString(36).slice(2); }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
