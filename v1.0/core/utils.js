/* MotorLab shared utilities — classic script, no modules. */
(function (global) {
  const ML = global.MotorLab = global.MotorLab || {};
  const THREE = global.THREE;

  ML.THREE = THREE;
  ML.machines = [];
  ML.machineMap = new Map();
  ML.registerMachine = function (definition) {
    if (!definition || !definition.id) return;
    if (ML.machineMap.has(definition.id)) return;
    ML.machines.push(definition);
    ML.machineMap.set(definition.id, definition);
  };

  ML.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  ML.lerp = (a, b, t) => a + (b - a) * t;
  ML.degToRad = (deg) => deg * Math.PI / 180;
  ML.radToDeg = (rad) => rad * 180 / Math.PI;
  ML.easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  ML.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  ML.mod = (value, n) => ((value % n) + n) % n;

  ML.format = (value, digits) => {
    if (!Number.isFinite(value)) return '—';
    const d = digits === undefined ? 1 : digits;
    return Number(value).toFixed(d);
  };

  ML.makeCanvasTexture = function (width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  };

  ML.makeStandard = function (color, metalness, roughness, opts) {
    const options = opts || {};
    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: metalness === undefined ? 0.7 : metalness,
      roughness: roughness === undefined ? 0.35 : roughness,
      emissive: options.emissive === undefined ? 0x000000 : options.emissive,
      emissiveIntensity: options.emissiveIntensity === undefined ? 1 : options.emissiveIntensity,
      envMapIntensity: options.envMapIntensity === undefined ? 0.6 : options.envMapIntensity,
      transparent: !!options.transparent,
      opacity: options.opacity === undefined ? 1 : options.opacity,
      side: options.side || THREE.FrontSide,
      flatShading: !!options.flatShading
    });
    material.userData.baseColor = material.color.clone();
    material.userData.baseEmissive = material.emissive.clone();
    material.userData.baseEmissiveIntensity = material.emissiveIntensity;
    material.userData.baseEnvMapIntensity = material.envMapIntensity;
    return material;
  };

  ML.makeBasic = function (color, opacity, opts) {
    const options = opts || {};
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: opacity !== undefined && opacity < 1 ? true : !!options.transparent,
      opacity: opacity === undefined ? 1 : opacity,
      depthWrite: options.depthWrite === undefined ? true : options.depthWrite,
      depthTest: options.depthTest === undefined ? true : options.depthTest,
      side: options.side || THREE.FrontSide,
      blending: options.blending || THREE.NormalBlending,
      toneMapped: options.toneMapped === undefined ? false : options.toneMapped
    });
    material.userData.baseColor = material.color.clone();
    return material;
  };

  ML.addMesh = function (parent, geometry, material, position, opts) {
    const options = opts || {};
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = options.receiveShadow !== false;
    if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
    if (options.scale) mesh.scale.set(options.scale[0], options.scale[1], options.scale[2]);
    parent.add(mesh);
    if (options.edges) {
      const edgeGeo = new THREE.EdgesGeometry(geometry, options.edgeThreshold === undefined ? 28 : options.edgeThreshold);
      const edgeMat = new THREE.LineBasicMaterial({
        color: options.edgeColor === undefined ? 0x8bb4c5 : options.edgeColor,
        transparent: true,
        opacity: options.edgeOpacity === undefined ? 0.16 : options.edgeOpacity
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.renderOrder = 2;
      mesh.add(edges);
      mesh.userData.edges = edges;
    }
    return mesh;
  };

  ML.addBox = function (parent, width, height, depth, material, x, y, z, opts) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    return ML.addMesh(parent, geo, material, [x || 0, y || 0, z || 0], opts);
  };

  ML.addCylinder = function (parent, topRadius, bottomRadius, height, segments, material, x, y, z, axis, opts) {
    const options = opts || {};
    const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments || 24, options.heightSegments || 1, !!options.openEnded);
    const mesh = ML.addMesh(parent, geo, material, [x || 0, y || 0, z || 0], options);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  };

  ML.addTorus = function (parent, radius, tube, material, x, y, z, rotation, radialSegments, tubularSegments) {
    const geo = new THREE.TorusGeometry(radius, tube, radialSegments || 8, tubularSegments || 64);
    const mesh = ML.addMesh(parent, geo, material, [x || 0, y || 0, z || 0], { castShadow: true, receiveShadow: true });
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    return mesh;
  };

  ML.addTube = function (parent, points, radius, material, opts) {
    const options = opts || {};
    const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(vectors, !!options.closed, options.curveType || 'catmullrom', options.tension === undefined ? 0.5 : options.tension);
    const geo = new THREE.TubeGeometry(curve, options.tubularSegments || 48, radius, options.radialSegments || 8, !!options.closed);
    return ML.addMesh(parent, geo, material, [0, 0, 0], options);
  };

  ML.addBolt = function (parent, x, y, z, axis, material, radius, height) {
    const r = radius || 0.035;
    const h = height || 0.03;
    return ML.addCylinder(parent, r, r, h, 12, material, x, y, z, axis || 'z', { castShadow: true, receiveShadow: true });
  };

  ML.makeTextPlane = function (text, width, height, options) {
    const opts = options || {};
    const fontSize = opts.fontPx || 180;
    const texture = ML.makeCanvasTexture(512, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.color || 'rgba(220,245,255,0.9)';
      ctx.font = `${opts.weight || 500} ${fontSize}px "Microsoft YaHei UI", "Cascadia Mono", sans-serif`;
      ctx.fillText(text, w / 2, h / 2);
    });
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.renderOrder = opts.renderOrder || 4;
    return mesh;
  };

  ML.addTextPlane = function (parent, text, position, width, height, options) {
    const mesh = ML.makeTextPlane(text, width, height, options);
    mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
  };

  ML.roundedRectShape = function (width, height, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  };

  ML.roundedBoxGeometry = function (width, height, depth, radius, curveSegments) {
    const shape = ML.roundedRectShape(width, height, radius);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      curveSegments: curveSegments || 8
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  };

  ML.disposeObject = function (root) {
    if (!root) return;
    const textures = new Set();
    const materials = new Set();
    root.traverse((object) => {
      if (object.geometry && object.geometry.dispose) object.geometry.dispose();
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      list.forEach((material) => materials.add(material));
    });
    materials.forEach((material) => {
      Object.keys(material).forEach((key) => {
        const value = material[key];
        if (value && value.isTexture) textures.add(value);
      });
      if (material.dispose) material.dispose();
    });
    textures.forEach((texture) => texture.dispose && texture.dispose());
  };

  ML.createSectorGeometry = function (innerRadius, outerRadius, startAngle, endAngle, depth, opts) {
    const options = opts || {};
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
    shape.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius);
    shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: options.bevelSize === undefined ? 0.004 : options.bevelSize,
      bevelThickness: options.bevelThickness === undefined ? 0.004 : options.bevelThickness,
      curveSegments: options.curveSegments || 12
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  };

  ML.hexToRgba = function (hex, alpha) {
    const color = new THREE.Color(hex);
    return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
  };

  ML.showToast = function (message, duration) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(ML._toastTimer);
    ML._toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration || 2200);
  };
})(window);
