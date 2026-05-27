// ─── 2D Canvas Editor ─────────────────────────────────────────
const C2D = (() => {
  let canvas, ctx, state;
  let W = 0, H = 0;

  // viewport transform
  let vx = 0, vy = 0, vscale = 1;

  // interaction
  let mouse = { x: 0, y: 0, world: { x: 0, y: 0 } };
  let dragging = null;
  let panning = false;
  let panStart = null;

  // sketch state
  let sketchPoints = [];
  let sketchPreview = null;

  // room placement drag
  let roomDrag = null;

  // measure
  let measureA = null;

  const GRID = 10; // px per cm at scale 1

  function init(canvasEl, appState) {
    canvas = canvasEl;
    state = appState;
    ctx = canvas.getContext('2d');
    resize();
    fitView();

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('wheel',     onWheel, { passive: false });
    canvas.addEventListener('dblclick',  onDblClick);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown',   onKeyDown);
    window.addEventListener('resize',    resize);
  }

  function resize() {
    W = canvas.parentElement.clientWidth;
    H = canvas.parentElement.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    render();
  }

  function fitView() {
    vscale = 1;
    vx = W * 0.15;
    vy = H * 0.1;
    updateZoomLabel();
  }

  // ── Coordinate utils ──────────────────────────────────────────
  function toWorld(sx, sy) {
    return { x: (sx - vx) / vscale, y: (sy - vy) / vscale };
  }
  function toScreen(wx, wy) {
    return { x: wx * vscale + vx, y: wy * vscale + vy };
  }
  function snap(v) {
    return Math.round(v / GRID) * GRID;
  }
  function snapPt(pt, shift) {
    let x = snap(pt.x), y = snap(pt.y);
    if (shift && sketchPoints.length > 0) {
      const last = sketchPoints[sketchPoints.length - 1];
      const dx = x - last.x, dy = y - last.y;
      const angle = Math.atan2(dy, dx);
      const snap45 = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const dist = Math.sqrt(dx * dx + dy * dy);
      x = last.x + Math.round(Math.cos(snap45) * dist / GRID) * GRID;
      y = last.y + Math.round(Math.sin(snap45) * dist / GRID) * GRID;
    }
    return { x, y };
  }

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vscale, vscale);

    drawGrid();
    drawFloorGhost();
    drawWalls();
    drawObjects();
    drawSketch();
    drawRoomDrag();
    drawMeasure();

    ctx.restore();
  }

  function drawGrid() {
    const minorSize = GRID;
    const majorSize = GRID * 10;

    const wx0 = -vx / vscale;
    const wy0 = -vy / vscale;
    const wx1 = (W - vx) / vscale;
    const wy1 = (H - vy) / vscale;

    const startX = Math.floor(wx0 / minorSize) * minorSize;
    const startY = Math.floor(wy0 / minorSize) * minorSize;

    ctx.beginPath();
    for (let x = startX; x < wx1; x += minorSize) {
      ctx.moveTo(x, wy0); ctx.lineTo(x, wy1);
    }
    for (let y = startY; y < wy1; y += minorSize) {
      ctx.moveTo(wx0, y); ctx.lineTo(wx1, y);
    }
    ctx.strokeStyle = 'rgba(220,101,95,0.10)';
    ctx.lineWidth = 0.5 / vscale;
    ctx.stroke();

    ctx.beginPath();
    for (let x = Math.floor(wx0 / majorSize) * majorSize; x < wx1; x += majorSize) {
      ctx.moveTo(x, wy0); ctx.lineTo(x, wy1);
    }
    for (let y = Math.floor(wy0 / majorSize) * majorSize; y < wy1; y += majorSize) {
      ctx.moveTo(wx0, y); ctx.lineTo(wx1, y);
    }
    ctx.strokeStyle = 'rgba(220,101,95,0.20)';
    ctx.lineWidth = 1 / vscale;
    ctx.stroke();

    // Axis
    ctx.beginPath();
    ctx.moveTo(wx0, 0); ctx.lineTo(wx1, 0);
    ctx.moveTo(0, wy0); ctx.lineTo(0, wy1);
    ctx.strokeStyle = 'rgba(220,101,95,0.35)';
    ctx.lineWidth = 1.5 / vscale;
    ctx.stroke();

    // Ruler labels
    const labelStep = majorSize;
    ctx.fillStyle = 'rgba(96,81,79,0.7)';
    ctx.font = `${10 / vscale}px monospace`;
    ctx.textAlign = 'center';
    for (let x = Math.floor(wx0 / labelStep) * labelStep; x < wx1; x += labelStep) {
      if (Math.abs(x) < 0.1) continue;
      ctx.fillText(`${Math.round(x)}`, x, 12 / vscale);
    }
    ctx.textAlign = 'right';
    for (let y = Math.floor(wy0 / labelStep) * labelStep; y < wy1; y += labelStep) {
      if (Math.abs(y) < 0.1) continue;
      ctx.fillText(`${Math.round(y)}`, -4 / vscale, y + 4 / vscale);
    }
  }

  function drawFloorGhost() {
    const floor = state.currentFloor();
    if (!floor) return;
    // ghost other floors
    state.floors.forEach((f, i) => {
      if (i === state.activeFloorIdx) return;
      ctx.save();
      ctx.globalAlpha = 0.12;
      drawFloorData(f);
      ctx.restore();
    });
  }

  function drawWalls() {
    const floor = state.currentFloor();
    if (!floor) return;
    drawFloorData(floor);
  }

  function drawFloorData(floor) {
    const wallThick = (state.wallThickness || 15) / 2;

    floor.walls.forEach(wall => {
      const sel = state.selected === wall;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (wall.type === 'shape' || wall.type === 'poly') {
        ctx.beginPath();
        if (wall.type === 'poly') buildPolyPath(ctx, wall);
        else buildShapePath(ctx, wall);
        ctx.fillStyle   = sel ? 'rgba(220,101,95,0.13)' : 'rgba(19,8,7,0.06)';
        ctx.strokeStyle = sel ? '#dc655f' : '#130807';
        ctx.lineWidth   = wall.thickness / vscale;
        ctx.fill();
        ctx.stroke();
        drawSqmLabel(wall);
        if (sel) {
          drawDimensions(wall);
          if (wall.type === 'poly') drawPolyHandles(wall);
        }
      } else if (wall.type === 'wall') {
        const pts = wall.points;
        if (pts.length < 2) { ctx.restore(); return; }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (wall.closed) ctx.closePath();
        ctx.strokeStyle = sel ? '#dc655f' : '#130807';
        ctx.lineWidth   = (wall.thickness || 15) / vscale;
        ctx.stroke();

        wall.snaps && wall.snaps.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 / vscale, 0, Math.PI * 2);
          ctx.fillStyle = '#dc655f';
          ctx.fill();
        });

        if (sel) {
          ctx.save();
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 / vscale, 0, Math.PI * 2);
            ctx.fillStyle = '#fdfcf8';
            ctx.strokeStyle = '#dc655f';
            ctx.lineWidth = 2 / vscale;
            ctx.fill(); ctx.stroke();
          });
          ctx.restore();
          drawWallDimension(wall);
        }
      }
      ctx.restore();
    });

    // snap intersection highlights
    floor.snapPoints && floor.snapPoints.forEach(sp => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8 / vscale, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2 / vscale;
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawObjects() {
    const floor = state.currentFloor();
    if (!floor) return;
    floor.objects.forEach(obj => {
      const sel = state.selected === obj;
      ctx.save();
      ctx.translate(obj.x + obj.w / 2, obj.y + obj.d / 2);
      ctx.rotate((obj.rot || 0) * Math.PI / 180);

      const hw = obj.w / 2, hd = obj.d / 2;

      // shadow
      ctx.shadowColor = 'rgba(19,8,7,0.18)';
      ctx.shadowBlur = 8 / vscale;
      ctx.shadowOffsetY = 4 / vscale;

      ctx.fillStyle   = obj.color + (sel ? 'ee' : '99');
      ctx.strokeStyle = sel ? '#dc655f' : (obj.color + 'ff');
      ctx.lineWidth   = (sel ? 2.5 : 1.5) / vscale;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-hw, -hd, obj.w, obj.d, 4 / vscale);
      else ctx.rect(-hw, -hd, obj.w, obj.d);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(19,8,7,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fsize = Math.max(8, Math.min(14, obj.d * 0.22));
      ctx.font = `bold ${fsize / vscale}px sans-serif`;
      ctx.fillText(obj.icon || obj.name.slice(0, 8), 0, 0);

      // Dim label
      ctx.fillStyle = 'rgba(96,81,79,0.7)';
      ctx.font = `${9 / vscale}px monospace`;
      ctx.fillText(`${obj.w}×${obj.d}cm`, 0, hd + 12 / vscale);

      if (sel) {
        // resize handle
        ctx.fillStyle = '#dc655f';
        ctx.beginPath();
        ctx.arc(hw, hd, 6 / vscale, 0, Math.PI * 2);
        ctx.fill();
        // rotate handle
        ctx.beginPath();
        ctx.arc(0, -hd - 16 / vscale, 5 / vscale, 0, Math.PI * 2);
        ctx.fillStyle = '#b8413c';
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawSketch() {
    if (state.tool !== 'sketch' || sketchPoints.length === 0) return;
    const pts = sketchPoints;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#130807';
    ctx.lineWidth = (state.wallThickness || 15) / vscale;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (sketchPreview) ctx.lineTo(sketchPreview.x, sketchPreview.y);
    ctx.stroke();

    // Start dot
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 6 / vscale, 0, Math.PI * 2);
    ctx.fillStyle = '#dc655f';
    ctx.fill();

    // Angle snap indicator
    if (sketchPreview && pts.length > 0) {
      const last = pts[pts.length - 1];
      const dx = sketchPreview.x - last.x, dy = sketchPreview.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(0,229,255,0.7)';
      ctx.font = `${10 / vscale}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(angle * 180 / Math.PI)}° / ${Math.round(dist)}cm`, last.x + 8 / vscale, last.y - 8 / vscale);
    }
    ctx.restore();
  }

  function drawRoomDrag() {
    if (!roomDrag) return;
    const { shape, x1, y1, x2, y2 } = roomDrag;
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    ctx.save();
    ctx.strokeStyle = '#4fc3f7';
    ctx.fillStyle = 'rgba(79,195,247,0.08)';
    ctx.lineWidth = 15 / vscale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (shape === 'circle') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const r = Math.min(rw, rh) / 2;
      ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,229,255,0.8)';
    ctx.font = `${11 / vscale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(rw)} × ${Math.round(rh)} cm`, (x1 + x2) / 2, Math.min(y1, y2) - 10 / vscale);
    ctx.restore();
  }

  function drawMeasure() {
    if (state.tool !== 'measure') return;
    if (!measureA) return;
    const b = mouse.world;
    const dx = b.x - measureA.x, dy = b.y - measureA.y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    ctx.save();
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 2 / vscale;
    ctx.setLineDash([6 / vscale, 4 / vscale]);
    ctx.beginPath();
    ctx.moveTo(measureA.x, measureA.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#ffeb3b';
    ctx.font = `bold ${12 / vscale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${dist} cm`, (measureA.x + b.x) / 2, (measureA.y + b.y) / 2 - 8 / vscale);
    ctx.restore();
  }

  // ── Area helper ────────────────────────────────────────────────
  function shapeAreaSqm(wall) {
    if (wall.type === 'poly') return polygonAreaSqm(wall.points);
    const { w, h, shape } = wall;
    if (shape === 'circle') return Math.PI * (w / 2) * (h / 2) / 10000;
    if (shape === 'lshape') return (w * h - (w / 2) * (h / 2)) / 10000;
    return w * h / 10000;
  }

  function polygonAreaSqm(pts) {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    }
    return Math.abs(area) / 2 / 10000;
  }

  function drawSqmLabel(wall) {
    const b = wallBounds(wall);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const sqm = shapeAreaSqm(wall).toFixed(1);
    const label = wall.name ? `${wall.name}\n${sqm} m²` : `${sqm} m²`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = label.split('\n');
    const fs = Math.max(10, Math.min(18, b.w * 0.12));
    ctx.font = `600 ${fs / vscale}px 'Geist', sans-serif`;
    ctx.fillStyle = 'rgba(19,8,7,0.65)';
    lines.forEach((line, i) => {
      const offset = (i - (lines.length - 1) / 2) * (fs + 2) / vscale;
      ctx.fillText(line, cx, cy + offset);
    });
    ctx.restore();
  }

  function drawDimensions(wall) {
    const { x, y, w, h } = wallBounds(wall);
    ctx.save();
    ctx.strokeStyle = '#dc655f';
    ctx.fillStyle = '#dc655f';
    ctx.font = `${11 / vscale}px monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 1 / vscale;
    ctx.setLineDash([4 / vscale, 3 / vscale]);
    ctx.beginPath(); ctx.moveTo(x, y - 14 / vscale); ctx.lineTo(x + w, y - 14 / vscale); ctx.stroke();
    ctx.fillText(`${Math.round(w)} cm`, x + w / 2, y - 18 / vscale);
    ctx.save();
    ctx.translate(x - 14 / vscale, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${Math.round(h)} cm`, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawWallDimension(wall) {
    const pts = wall.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.fillStyle = '#dc655f';
      ctx.font = `${10 / vscale}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist} cm`, 0, -10 / vscale);
      ctx.restore();
    }
  }


  // ── Poly room (polygon with editable vertices) ─────────────────
  function buildPolyPath(ctx, wall) {
    const pts = wall.points;
    if (!pts || pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  function drawPolyHandles(wall) {
    const pts = wall.points;
    ctx.save();
    // edge midpoint handles — click to split / drag to move new vertex
    ctx.fillStyle = 'rgba(248,245,238,0.9)';
    ctx.strokeStyle = 'rgba(220,101,95,0.6)';
    ctx.lineWidth = 1.5 / vscale;
    pts.forEach((p, i) => {
      const next = pts[(i + 1) % pts.length];
      const mx = (p.x + next.x) / 2, my = (p.y + next.y) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, 4 / vscale, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    // vertex handles — drag to move; double-click to delete
    ctx.fillStyle = '#fdfcf8';
    ctx.strokeStyle = '#dc655f';
    ctx.lineWidth = 2 / vscale;
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 / vscale, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  function hitPointsVertex(wx, wy, pts) {
    const r = 10 / vscale;
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(wx - pts[i].x, wy - pts[i].y) < r) return i;
    }
    return -1;
  }

  function hitPolyVertex(wx, wy, wall) {
    if (wall.type !== 'poly') return -1;
    return hitPointsVertex(wx, wy, wall.points);
  }

  function hitPolyMidpoint(wx, wy, wall) {
    if (wall.type !== 'poly') return -1;
    const pts = wall.points;
    const r = 8 / vscale;
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      const mx = (pts[i].x + next.x) / 2, my = (pts[i].y + next.y) / 2;
      if (Math.hypot(wx - mx, wy - my) < r) return i;
    }
    return -1;
  }

function shapeToPolyPoints(wall) {
    const { x, y, w, h, shape } = wall;
    if (shape === 'rect' || shape === 'square') {
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    }
    if (shape === 'lshape') {
      return [
        { x, y }, { x: x + w, y }, { x: x + w, y: y + h * 0.5 },
        { x: x + w * 0.5, y: y + h * 0.5 }, { x: x + w * 0.5, y: y + h }, { x, y: y + h },
      ];
    }
    return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }

  // ── Shape path builder ─────────────────────────────────────────
  function buildShapePath(ctx, wall) {
    const { x, y, w, h, shape } = wall;
    if (shape === 'rect' || shape === 'square') {
      ctx.rect(x, y, w, h);
    } else if (shape === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shape === 'lshape') {
      ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h * 0.5);
      ctx.lineTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * 0.5, y + h);
      ctx.lineTo(x, y + h); ctx.closePath();
    }
  }

  function wallBounds(wall) {
    if (wall.type === 'shape') return { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
    if (wall.type === 'poly') {
      const xs = wall.points.map(p => p.x), ys = wall.points.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    const xs = wall.points.map(p => p.x), ys = wall.points.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  // ── Hit testing ────────────────────────────────────────────────
  function hitTest(wx, wy) {
    const floor = state.currentFloor();
    if (!floor) return null;

    // objects first (top layer)
    for (let i = floor.objects.length - 1; i >= 0; i--) {
      const o = floor.objects[i];
      if (hitObject(wx, wy, o)) return o;
    }
    // walls
    for (let i = floor.walls.length - 1; i >= 0; i--) {
      const w = floor.walls[i];
      if (hitWall(wx, wy, w)) return w;
    }
    return null;
  }

  function hitObject(wx, wy, o) {
    const hw = o.w / 2, hd = o.d / 2;
    const cx = o.x + hw, cy = o.y + hd;
    const dx = wx - cx, dy = wy - cy;
    const rot = -(o.rot || 0) * Math.PI / 180;
    const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
    return Math.abs(rx) <= hw && Math.abs(ry) <= hd;
  }

  function hitWall(wx, wy, wall) {
    const thresh = (wall.thickness || 15) / 2 + 8;
    if (wall.type === 'shape' || wall.type === 'poly') {
      const b = wallBounds(wall);
      if (wx < b.x - thresh || wx > b.x + b.w + thresh) return false;
      if (wy < b.y - thresh || wy > b.y + b.h + thresh) return false;
      return true;
    }
    const pts = wall.points;
    for (let i = 0; i < pts.length - 1; i++) {
      if (ptToSegDist(wx, wy, pts[i], pts[i + 1]) < thresh) return true;
    }
    return false;
  }

  function ptToSegDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // ── Snap intersections ─────────────────────────────────────────
  function computeSnaps(floor) {
    const snaps = [];
    const walls = floor.walls.filter(w => w.type === 'wall');
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const pts = segmentsIntersections(walls[i].points, walls[j].points);
        snaps.push(...pts);
      }
    }
    floor.snapPoints = snaps;
    return snaps;
  }

  function segmentsIntersections(ptsA, ptsB) {
    const results = [];
    for (let i = 0; i < ptsA.length - 1; i++) {
      for (let j = 0; j < ptsB.length - 1; j++) {
        const p = segIntersect(ptsA[i], ptsA[i + 1], ptsB[j], ptsB[j + 1]);
        if (p) results.push(p);
      }
    }
    return results;
  }

  function segIntersect(a, b, c, d) {
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = d.x - c.x, dy2 = d.y - c.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / denom;
    const u = ((c.x - a.x) * dy1 - (c.y - a.y) * dx1) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: a.x + t * dx1, y: a.y + t * dy1 };
    }
    return null;
  }

  // find nearest snap point within radius
  function nearestSnap(wx, wy, radius) {
    const floor = state.currentFloor();
    if (!floor || !floor.snapPoints) return null;
    let best = null, bestD = radius;
    for (const sp of floor.snapPoints) {
      const d = Math.hypot(sp.x - wx, sp.y - wy);
      if (d < bestD) { bestD = d; best = sp; }
    }
    return best;
  }

  // ── Mouse Handlers ─────────────────────────────────────────────
  function updateMouseWorld(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.world = toWorld(mouse.x, mouse.y);
    updateCoordsDisplay();
  }

  function onMouseDown(e) {
    updateMouseWorld(e);
    const wx = mouse.world.x, wy = mouse.world.y;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning = true;
      panStart = { x: mouse.x - vx, y: mouse.y - vy };
      return;
    }

    if (e.button === 2) {
      if (state.tool === 'sketch' && sketchPoints.length > 0) { finalizeSketch(); }
      return;
    }

    const tool = state.tool;

    if (tool === 'select') {
      const sel = state.selected;

      // ── Sketch-wall vertex handles ───────────────────────────────
      if (sel && sel.type === 'wall') {
        const vi = hitPointsVertex(wx, wy, sel.points);
        if (vi >= 0) {
          dragging = { type: 'wall-vertex', wall: sel, vi };
          render(); return;
        }
      }

      // ── Poly vertex/midpoint handles (checked before hit-testing the room) ──
      if (sel && sel.type === 'poly') {
        const vi = hitPolyVertex(wx, wy, sel);
        if (vi >= 0) {
          dragging = { type: 'poly-vertex', wall: sel, vi };
          render(); return;
        }
        const mi = hitPolyMidpoint(wx, wy, sel);
        if (mi >= 0) {
          // insert new vertex at the midpoint and immediately drag it
          const j = (mi + 1) % sel.points.length;
          const nx = snap((sel.points[mi].x + sel.points[j].x) / 2);
          const ny = snap((sel.points[mi].y + sel.points[j].y) / 2);
          sel.points.splice(j, 0, { x: nx, y: ny });
          dragging = { type: 'poly-vertex', wall: sel, vi: j };
          state.markDirty(); render(); return;
        }
      }

      // ── Normal hit test ──────────────────────────────────────────
      const hit = hitTest(wx, wy);
      if (hit) {
        state.setSelected(hit);
        if (!hit.type || hit.type === 'object') {
          // furniture object — resize / rotate / move handles
          const hw = hit.w / 2, hd = hit.d / 2;
          const cx = hit.x + hw, cy = hit.y + hd;
          const rot = -(hit.rot || 0) * Math.PI / 180;
          const dx = wx - cx, dy = wy - cy;
          const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
          const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
          if (Math.abs(rx - hw) < 14 / vscale && Math.abs(ry - hd) < 14 / vscale) {
            dragging = { type: 'resize', obj: hit, startW: hit.w, startD: hit.d, ox: wx, oy: wy };
          } else if (Math.abs(rx) < 8 / vscale && Math.abs(ry + hd + 16 / vscale) < 8 / vscale) {
            dragging = { type: 'rotate', obj: hit, ox: wx, oy: wy, startRot: hit.rot || 0 };
          } else {
            dragging = { type: 'move', obj: hit, offX: wx - hit.x, offY: wy - hit.y };
          }
        } else {
          // room or sketch wall — move the whole thing
          dragging = {
            type: 'move-wall', wall: hit, offX: wx, offY: wy,
            origX: hit.x, origY: hit.y,
            origPts: hit.points ? hit.points.map(p => ({ ...p })) : null,
          };
        }
      } else {
        state.setSelected(null);
      }
    }

    if (tool === 'sketch') {
      const sp = snapPt({ x: wx, y: wy }, e.shiftKey);
      // snap to existing snap point if close
      const ns = nearestSnap(sp.x, sp.y, 20 / vscale);
      const pt = ns || sp;

      if (sketchPoints.length === 0) {
        sketchPoints = [pt];
      } else {
        if (state.sketchMode === 'line') {
          // single line segment → commit immediately
          sketchPoints.push(pt);
          finalizeSketch();
        } else {
          sketchPoints.push(pt);
        }
      }
    }

    if (tool === 'room') {
      if (state.pendingShape) {
        const sp = { x: snap(wx), y: snap(wy) };
        roomDrag = { shape: state.pendingShape, x1: sp.x, y1: sp.y, x2: sp.x, y2: sp.y };
      }
    }

    if (tool === 'measure') {
      if (!measureA) {
        measureA = { x: wx, y: wy };
      } else {
        const dx = wx - measureA.x, dy = wy - measureA.y;
        const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
        document.getElementById('measure-result').textContent = dist + ' cm';
        measureA = null;
      }
    }

    if (tool === 'object' && state.pendingObject) {
      placePendingObject(wx, wy);
    }

    render();
  }

  function onMouseMove(e) {
    updateMouseWorld(e);
    const wx = mouse.world.x, wy = mouse.world.y;

    if (panning && panStart) {
      vx = mouse.x - panStart.x;
      vy = mouse.y - panStart.y;
      render(); return;
    }

    if (dragging) {
      if (dragging.type === 'move') {
        dragging.obj.x = snap(wx - dragging.offX);
        dragging.obj.y = snap(wy - dragging.offY);
      } else if (dragging.type === 'resize') {
        const o = dragging.obj;
        const rot = (o.rot || 0) * Math.PI / 180;
        const dx = wx - dragging.ox, dy = wy - dragging.oy;
        const rx = dx * Math.cos(rot) + dy * Math.sin(rot);
        const ry = -dx * Math.sin(rot) + dy * Math.cos(rot);
        o.w = Math.max(20, snap(dragging.startW + rx));
        o.d = Math.max(20, snap(dragging.startD + ry));
      } else if (dragging.type === 'rotate') {
        const o = dragging.obj;
        const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
        const angle = Math.atan2(wy - cy, wx - cx) * 180 / Math.PI + 90;
        o.rot = Math.round(angle / 5) * 5;
      } else if (dragging.type === 'wall-vertex') {
        dragging.wall.points[dragging.vi] = { x: snap(wx), y: snap(wy) };
      } else if (dragging.type === 'poly-vertex') {
        const pts = dragging.wall.points;
        const vi = dragging.vi;
        let x = snap(wx), y = snap(wy);
        // orthogonal snap — if close to alignment with either neighbor, lock to it
        const ORTHO = 15 / vscale;
        const prev = pts[(vi - 1 + pts.length) % pts.length];
        const next = pts[(vi + 1) % pts.length];
        if      (Math.abs(x - prev.x) < ORTHO) x = prev.x;
        else if (Math.abs(y - prev.y) < ORTHO) y = prev.y;
        if      (Math.abs(x - next.x) < ORTHO) x = next.x;
        else if (Math.abs(y - next.y) < ORTHO) y = next.y;
        pts[vi] = { x, y };
      } else if (dragging.type === 'move-wall') {
        const dx = snap(wx) - snap(dragging.offX);
        const dy = snap(wy) - snap(dragging.offY);
        dragging.offX = wx; dragging.offY = wy;
        const w = dragging.wall;
        if (w.points) {
          w.points = w.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else {
          w.x = snap(w.x + dx); w.y = snap(w.y + dy);
        }
      }
      state.markDirty();
      render(); return;
    }

    if (roomDrag) {
      roomDrag.x2 = snap(wx);
      roomDrag.y2 = snap(wy);
      render(); return;
    }

    if (state.tool === 'sketch' && sketchPoints.length > 0) {
      sketchPreview = snapPt({ x: wx, y: wy }, e.shiftKey);
      const ns = nearestSnap(sketchPreview.x, sketchPreview.y, 20 / vscale);
      if (ns) sketchPreview = ns;
      render(); return;
    }

    // hover cursor
    if (state.tool === 'select') {
      const hit = hitTest(wx, wy);
      canvas.style.cursor = hit ? 'move' : 'default';
    }

    render();
  }

  function onMouseUp(e) {
    updateMouseWorld(e);
    const wx = mouse.world.x, wy = mouse.world.y;

    if (panning) { panning = false; panStart = null; return; }

    if (roomDrag) {
      const { shape, x1, y1, x2, y2 } = roomDrag;
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      if (rw > 10 && rh > 10) {
        const wall = {
          id: uid(), type: 'shape', shape, x: rx, y: ry, w: rw, h: rh,
          thickness: state.wallThickness || 15,
        };
        state.currentFloor().walls.push(wall);
        state.setSelected(wall);
        state.markDirty();
      }
      roomDrag = null;
      render(); return;
    }

    if (dragging) {
      dragging = null;
      state.markDirty();
      computeSnaps(state.currentFloor());
      render(); return;
    }
  }

  function onDblClick(e) {
    if (state.tool === 'sketch' && sketchPoints.length >= 2) {
      finalizeSketch();
      return;
    }
    if (state.tool === 'select') {
      updateMouseWorld(e);
      const wx = mouse.world.x, wy = mouse.world.y;
      const sel = state.selected;
      if (sel && sel.type === 'poly') {
        const vi = hitPolyVertex(wx, wy, sel);
        if (vi >= 0 && sel.points.length > 3) {
          sel.points.splice(vi, 1);
          state.markDirty();
          render();
        }
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    vx = mx - (mx - vx) * factor;
    vy = my - (my - vy) * factor;
    vscale = Math.max(0.1, Math.min(8, vscale * factor));
    updateZoomLabel();
    render();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      sketchPoints = [];
      sketchPreview = null;
      measureA = null;
      roomDrag = null;
      render();
    }
    if (e.key === 'Enter' && state.tool === 'sketch') {
      finalizeSketch();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      deleteSelected();
      e.preventDefault();
    }
    if (e.key === 'v' || e.key === 'V') state.setTool('select');
    if (e.key === 'r' || e.key === 'R') state.setTool('room');
    if (e.key === 'w' || e.key === 'W') state.setTool('sketch');
    if (e.key === 'o' || e.key === 'O') state.setTool('object');
    if (e.key === 'm' || e.key === 'M') state.setTool('measure');
  }

  // ── Sketch finalization ─────────────────────────────────────────
  function finalizeSketch() {
    if (sketchPoints.length < 2) { sketchPoints = []; sketchPreview = null; render(); return; }
    const wall = {
      id: uid(), type: 'wall',
      points: sketchPoints.map(p => ({ ...p })),
      thickness: state.wallThickness || 15,
      closed: false,
    };
    state.currentFloor().walls.push(wall);
    computeSnaps(state.currentFloor());
    state.setSelected(wall);
    state.markDirty();
    sketchPoints = [];
    sketchPreview = null;
    render();
  }

  // ── Object placement ───────────────────────────────────────────
  function placePendingObject(wx, wy) {
    const obj = state.pendingObject;
    const placed = {
      ...obj,
      id: uid(),
      x: snap(wx - obj.w / 2),
      y: snap(wy - obj.d / 2),
      rot: 0,
    };
    state.currentFloor().objects.push(placed);
    state.setSelected(placed);
    state.markDirty();
    render();
  }

  // ── Delete ─────────────────────────────────────────────────────
  function deleteSelected() {
    const sel = state.selected;
    const floor = state.currentFloor();
    floor.walls   = floor.walls.filter(w => w !== sel);
    floor.objects = floor.objects.filter(o => o !== sel);
    state.setSelected(null);
    computeSnaps(floor);
    state.markDirty();
    render();
  }

  // ── Zoom ───────────────────────────────────────────────────────
  function zoom(factor) {
    vx = W / 2 - (W / 2 - vx) * factor;
    vy = H / 2 - (H / 2 - vy) * factor;
    vscale = Math.max(0.1, Math.min(8, vscale * factor));
    updateZoomLabel();
    render();
  }

  function updateZoomLabel() {
    document.getElementById('zoom-label').textContent = Math.round(vscale * 100) + '%';
  }

  function updateCoordsDisplay() {
    document.getElementById('coords-display').textContent =
      `${Math.round(mouse.world.x)}, ${Math.round(mouse.world.y)} cm`;
  }

  function uid() {
    return Math.random().toString(36).slice(2);
  }

  function convertToPolyAndEdit(wall) {
    if (!wall || wall.type !== 'shape') return;
    wall.points = shapeToPolyPoints(wall);
    wall.type = 'poly';
    const { x, y, w, h } = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
    delete wall.shape; delete wall.w; delete wall.h; delete wall.x; delete wall.y;
    state.setSelected(wall);
    state.markDirty();
    render();
  }

  return {
    init,
    render,
    zoom,
    fitView,
    deleteSelected,
    computeSnaps,
    convertToPolyAndEdit,
  };
})();
