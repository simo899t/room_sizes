// ─── 3D Scene (Three.js) ──────────────────────────────────────
const S3D = (() => {
  let renderer, scene, camera, controls, container;
  let state;
  let animId;
  const WALL_H = 240; // cm wall height
  const FLOOR_OFFSET = 320; // cm between floors

  function init(containerEl, appState) {
    container = containerEl;
    state = appState;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x0d1b2a);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0d1b2a, 2000, 8000);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 20000);
    camera.position.set(0, 1200, 1200);
    camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0x1a3a5c, 1.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0x6ab4f5, 2);
    sun.position.set(500, 1500, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 5000;
    sun.shadow.camera.left = -2000;
    sun.shadow.camera.right = 2000;
    sun.shadow.camera.top = 2000;
    sun.shadow.camera.bottom = -2000;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x2a6090, 0.8);
    fill.position.set(-500, 800, -500);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(4000, 40, 0x1e4080, 0x142840);
    scene.add(grid);

    // Simple orbit controls (manual)
    setupControls();

    window.addEventListener('resize', onResize);
  }

  function setupControls() {
    let isDragging = false, lastX, lastY;
    let theta = 45, phi = 55, radius = 1600;
    let target = new THREE.Vector3(0, 0, 0);

    function updateCamera() {
      const t = phi * Math.PI / 180;
      const p = theta * Math.PI / 180;
      camera.position.set(
        target.x + radius * Math.sin(t) * Math.sin(p),
        target.y + radius * Math.cos(t),
        target.z + radius * Math.sin(t) * Math.cos(p)
      );
      camera.lookAt(target);
    }
    updateCamera();

    container.addEventListener('mousedown', e => {
      isDragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => isDragging = false);
    container.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (e.buttons === 1) {
        theta -= dx * 0.4;
        phi = Math.max(5, Math.min(89, phi + dy * 0.4));
      } else if (e.buttons === 2) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(up); up.y = 0; up.normalize();
        right.crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
        target.addScaledVector(right, dx * 0.8);
        target.y -= dy * 0.8;
      }
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    container.addEventListener('wheel', e => {
      radius = Math.max(200, Math.min(8000, radius + e.deltaY * 1.5));
      updateCamera();
    });
    container.addEventListener('contextmenu', e => e.preventDefault());
  }

  function buildScene() {
    // Clear old objects
    while (scene.children.length > 0 && scene.children[scene.children.length - 1].userData.generated) {
      scene.remove(scene.children[scene.children.length - 1]);
    }
    // Remove all generated
    const toRemove = scene.children.filter(c => c.userData.generated);
    toRemove.forEach(c => scene.remove(c));

    state.floors.forEach((floor, fi) => {
      const offsetY = fi * FLOOR_OFFSET;
      buildFloor3D(floor, offsetY, fi === state.activeFloorIdx);
    });
  }

  function buildFloor3D(floor, offsetY, isActive) {
    const opacity = isActive ? 1 : 0.35;

    // Floor slab
    const geo = new THREE.BoxGeometry(3000, 8, 3000);
    const mat = new THREE.MeshLambertMaterial({ color: 0x0d2040, transparent: !isActive, opacity });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.y = offsetY - 4;
    slab.receiveShadow = true;
    slab.userData.generated = true;
    scene.add(slab);

    floor.walls.forEach(wall => {
      if (wall.type === 'shape') {
        buildShapeWall(wall, offsetY, opacity);
      } else if (wall.type === 'wall') {
        buildPolyWall(wall, offsetY, opacity);
      }
    });

    floor.objects.forEach(obj => {
      buildObject3D(obj, offsetY, opacity);
    });
  }

  function buildShapeWall(wall, offsetY, opacity) {
    const { x, y, w, h, shape, thickness = 15 } = wall;
    const wallMat = new THREE.MeshLambertMaterial({
      color: 0x1a4a6a, transparent: opacity < 1, opacity,
      side: THREE.DoubleSide,
    });

    if (shape === 'rect' || shape === 'square') {
      addBoxWall(x, y, w, thickness, offsetY, wallMat); // top
      addBoxWall(x, y + h - thickness, w, thickness, offsetY, wallMat); // bottom
      addBoxWall(x, y, thickness, h, offsetY, wallMat); // left
      addBoxWall(x + w - thickness, y, thickness, h, offsetY, wallMat); // right
    } else if (shape === 'lshape') {
      // simplified: treat as bounding rect walls minus cutout
      addBoxWall(x, y, w, thickness, offsetY, wallMat);
      addBoxWall(x, y, thickness, h, offsetY, wallMat);
      addBoxWall(x, y + h - thickness, w * 0.5, thickness, offsetY, wallMat);
      addBoxWall(x + w * 0.5 - thickness, y + h * 0.5 - thickness, thickness, h * 0.5 + thickness, offsetY, wallMat);
      addBoxWall(x + w * 0.5, y + h * 0.5, w * 0.5 - thickness, thickness, offsetY, wallMat);
      addBoxWall(x + w - thickness, y, thickness, h * 0.5, offsetY, wallMat);
    } else if (shape === 'circle') {
      // approximate cylinder ring
      const cx = x + w / 2, cy = y + h / 2;
      const rx = w / 2, ry = h / 2;
      const segs = 32;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const mx = (cx + Math.cos((a0 + a1) / 2) * rx);
        const mz = (cy + Math.sin((a0 + a1) / 2) * ry);
        const seg = new THREE.BoxGeometry(
          Math.abs(Math.cos(a1) - Math.cos(a0)) * rx + thickness,
          WALL_H, thickness
        );
        const mesh = new THREE.Mesh(seg, wallMat);
        mesh.position.set(mx, offsetY + WALL_H / 2, mz);
        mesh.rotation.y = -(a0 + a1) / 2;
        mesh.castShadow = true;
        mesh.userData.generated = true;
        scene.add(mesh);
      }
      return;
    }
  }

  function addBoxWall(x, y, w, h, offsetY, mat) {
    const geo = new THREE.BoxGeometry(w, WALL_H, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, offsetY + WALL_H / 2, y + h / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.generated = true;
    scene.add(mesh);
  }

  function buildPolyWall(wall, offsetY, opacity) {
    const pts = wall.points;
    const thickness = wall.thickness || 15;
    const mat = new THREE.MeshLambertMaterial({
      color: 0x2060a0, transparent: opacity < 1, opacity,
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.y - a.y;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 1) continue;
      const geo = new THREE.BoxGeometry(len, WALL_H, thickness);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((a.x + b.x) / 2, offsetY + WALL_H / 2, (a.y + b.y) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.generated = true;
      scene.add(mesh);
    }
  }

  function buildObject3D(obj, offsetY, opacity) {
    const height = obj.height3d || Math.min(obj.w, obj.d) * 0.6;
    const geo = new THREE.BoxGeometry(obj.w, height, obj.d);
    const color = new THREE.Color(obj.color || '#4488aa');
    const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.d / 2;
    mesh.position.set(cx, offsetY + height / 2, cy);
    mesh.rotation.y = -(obj.rot || 0) * Math.PI / 180;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.generated = true;
    scene.add(mesh);

    // Label sprite
    const sprite = makeTextSprite(obj.icon || obj.name.slice(0, 6), color);
    sprite.position.set(cx, offsetY + height + 30, cy);
    sprite.userData.generated = true;
    scene.add(sprite);
  }

  function makeTextSprite(text, color) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 64);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#' + color.getHexString();
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(80, 40, 1);
    return sprite;
  }

  function onResize() {
    if (!renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  function start() {
    buildScene();
    animate();
  }

  function stop() {
    if (animId) cancelAnimationFrame(animId);
  }

  function refresh() {
    buildScene();
  }

  return { init, start, stop, refresh };
})();
