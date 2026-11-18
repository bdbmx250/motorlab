/* 三相油浸式配电变压器 — structural cutaway + teaching simulation. */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  const ACCENT = '#ffc66b';
  const RATED_KVA = 630;
  const V1_RATED = 10;
  const V2_RATED = 400;

  function addCoilBand(parent, radius, height, y, x, z, material, cutaway) {
    const thetaLength = cutaway ? Math.PI * 1.34 : Math.PI * 2;
    const thetaStart = cutaway ? Math.PI * 0.33 : 0;
    const geo = new THREE.CylinderGeometry(radius, radius, height, 30, 1, true, thetaStart, thetaLength);
    return ML.addMesh(parent, geo, material, [x, y, z], { castShadow: true, receiveShadow: true });
  }

  function addBushing(parent, x, y, z, height, radius, material, metal) {
    ML.addCylinder(parent, radius * 0.28, radius * 0.28, height * 1.16, 12, metal, x, y + height / 2, z, 'y');
    ML.addCylinder(parent, radius * 0.7, radius * 0.9, 0.16, 18, material, x, y + 0.08, z, 'y');
    for (let i = 0; i < 5; i += 1) {
      const r = radius * (0.9 - i * 0.08);
      ML.addCylinder(parent, r, r, 0.12, 20, material, x, y + 0.22 + i * height * 0.17, z, 'y');
      ML.addTorus(parent, r * 0.94, 0.025, material, x, y + 0.285 + i * height * 0.17, z, [Math.PI / 2, 0, 0], 5, 20);
    }
    ML.addCylinder(parent, radius * 0.22, radius * 0.3, 0.22, 14, metal, x, y + height * 0.93, z, 'y');
    ML.addCylinder(parent, radius * 0.1, radius * 0.1, 0.16, 10, metal, x, y + height * 1.02, z, 'y');
  }

  function addFluxArrow(parent, from, to, color) {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = dir.length();
    const mid = new THREE.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    const mat = ML.Materials.field(color, 0.7);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len * 0.74, 6), mat);
    shaft.position.copy(mid);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    parent.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), mat);
    head.position.copy(new THREE.Vector3(to[0], to[1], to[2]).addScaledVector(dir.clone().normalize(), -0.06));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    parent.add(head);
    return mat;
  }

  ML.registerMachine({
    id: 'transformer',
    order: 1,
    title: '变压器',
    en: 'POWER TRANSFORMER',
    cardEn: 'OIL-IMMERSED DISTRIBUTION TRANSFORMER',
    accent: ACCENT,
    blurb: '三柱式铁心、同心式绕组和油浸冷却。改变一次电压与负载，观察二次电压、损耗和效率如何一起变化。',
    topics: ['磁路与变比', '相量图', '损耗与效率', 'Dyn11 联结'],
    structureTitle: '铁心与绕组',
    structureNote: '三柱式铁心构成闭合磁路，同心式高、低压绕组套在铁心柱上。前面板被剖开，便于观察内部。',
    structureFoot: '630 kVA · 10 / 0.4 kV · Dyn11',
    consoleTitle: '运行控制',
    consoleKicker: '负载与电压',
    consoleLead: '调节一次电压、负载率和功率因数，观察二次侧与损耗。',
    consoleTag: 'TRANSFORMER / 50 Hz',
    stageMode: 'OIL-IMMERSED / CUTAWAY',
    fieldLabel: '主磁通',
    ctaSub: '等效电路 · 相量 · 效率',
    knowledgeMeta: 'MAGNETIC CIRCUIT / PHASOR / LOSS',
    viewDirection: [0.6, 0.28, 0.75],
    fitPadding: 1.03,
    explodePadding: 1.12,
    explodeDuration: 1050,
    legend: [
      { color: '#ffc66b', label: '一次侧' },
      { color: '#57dcff', label: '二次侧' }
    ],
    cardArt: `
      <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" stroke-width="1.3">
        <rect x="45" y="58" width="150" height="125" rx="6" opacity=".55"/>
        <path d="M78 78h84v42H78zM78 134h84v34H78z" opacity=".65"/>
        <path d="M82 74v106M118 74v106M154 74v106" stroke-width="2.4" opacity=".9"/>
        <path d="M78 92h84M78 118h84M78 148h84" opacity=".4"/>
        <path d="M75 78h90M75 162h90" stroke-width="3" opacity=".9"/>
        <path d="M92 126c8-10 18-10 26 0s18 10 26 0" stroke-width="2" opacity=".85"/>
        <path d="M62 58V42M102 58V36M138 58V42M178 58V36" stroke-width="3" opacity=".8"/>
        <path d="M58 42h8M98 36h8M134 42h8M174 36h8" stroke-width="4" stroke-linecap="round"/>
        <path d="M56 183h128" opacity=".5"/>
        <circle cx="118" cy="121" r="80" stroke-dasharray="2 7" opacity=".25"/>
      </svg>
    `,
    parts: [
      {
        id: 'core', index: '01', name: '铁心', en: 'LAMINATED CORE', mass: 980,
        description: '三柱式硅钢叠片铁心为磁通提供低磁阻通路，同时把一次侧能量耦合到二次侧。',
        specs: [['材料', '0.3 mm 冷轧硅钢'], ['结构', '三柱式'], ['绝缘', '表面绝缘漆']],
        material: '冷轧硅钢片', accent: '#ffc66b', anchor: [0, 0.9, 0.35],
        explode: [0, 0, 0]
      },
      {
        id: 'hvWinding', index: '02', name: '高压绕组', en: 'HV WINDING', mass: 320,
        description: '10 kV 侧同心式绕组，匝数多、电流小。剖切后可以看到绕组层和端部绝缘。',
        specs: [['额定电压', '10 kV'], ['连接', 'D 接'], ['导线', '铜扁线']],
        material: '铜导线 / 绝缘纸', accent: '#ffcf86', anchor: [0.6, 0, 0.72],
        explode: [0.3, 0.3, 1.7]
      },
      {
        id: 'lvWinding', index: '03', name: '低压绕组', en: 'LV WINDING', mass: 240,
        description: '0.4 kV 侧绕组靠近铁心布置，匝数少、截面积大，承担较大的负载电流。',
        specs: [['额定电压', '0.4 kV'], ['连接', 'yn 接'], ['导线', '铜箔 / 铜排']],
        material: '铜导线 / 绝缘纸', accent: '#57dcff', anchor: [-0.4, -0.6, 0.56],
        explode: [0, 0.3, 2.8]
      },
      {
        id: 'insulation', index: '04', name: '绝缘与夹件', en: 'INSULATION & CLAMPS', mass: 95,
        description: '端部绝缘筒、撑条和夹紧结构固定绕组，并保证主绝缘与纵绝缘距离。',
        specs: [['材料', '电工纸板'], ['耐热等级', 'A 级'], ['结构', '端圈 + 撑条']],
        material: '绝缘纸板 / 层压木', accent: '#c8ab7c', anchor: [0.2, 1.2, 0.75],
        explode: [0, 0.2, -1.5]
      },
      {
        id: 'tank', index: '05', name: '油箱', en: 'OIL TANK', mass: 420,
        description: '油箱容纳变压器油和器身，前面板剖开。油既绝缘又通过循环把热量带到散热器。',
        specs: [['形式', '密封式'], ['油', '矿物绝缘油'], ['表面', '防腐涂装']],
        material: '钢板 / 绝缘油', accent: '#8fb7c6', anchor: [-1.9, 0.2, 1.16],
        explode: [3.0, 1.2, -0.4]
      },
      {
        id: 'radiator', index: '06', name: '散热器', en: 'RADIATOR BANK', mass: 150,
        description: '片式散热器增大散热面积，热油上升、冷油下降形成自然循环。',
        specs: [['数量', '两侧片式'], ['冷却', 'ONAN'], ['接口', '法兰连接']],
        material: '薄钢板', accent: '#76cfe4', anchor: [2.5, 0.2, 0],
        explode: [-3.0, 0.3, 0]
      },
      {
        id: 'hvBushing', index: '07', name: '高压套管', en: 'HV BUSHINGS', mass: 85,
        description: '把 10 kV 高压导体安全引出油箱，瓷套与油纸电容芯保证外绝缘和电场分布。',
        specs: [['电压等级', '12 kV'], ['材料', '瓷套'], ['数量', '3 只']],
        material: '电瓷 / 铜导体', accent: '#e7dcc7', anchor: [0, 3.05, 0],
        explode: [0, 2.8, -0.3]
      },
      {
        id: 'lvBushing', index: '08', name: '低压套管', en: 'LV BUSHINGS', mass: 55,
        description: '低压侧引出端子，连接 0.4 kV 母线；低压套管通常带接线板与绝缘罩。',
        specs: [['电压等级', '1 kV'], ['数量', '4 只'], ['连接', '铜排']],
        material: '环氧 / 铜导体', accent: '#b89a6a', anchor: [0.8, 2.45, 0.78],
        explode: [0, 2.1, 1.2]
      },
      {
        id: 'tapChanger', index: '09', name: '分接开关', en: 'TAP CHANGER', mass: 28,
        description: '在高压绕组上切换少量匝数，改变变比，用于补偿电网电压偏差。',
        specs: [['档位', '±2 × 2.5%'], ['操作', '手动'], ['位置', '高压侧']],
        material: '铜触头 / 绝缘件', accent: '#f0a75f', anchor: [-1.35, 2.12, 0.28],
        explode: [1.8, 1.6, 0.6]
      },
      {
        id: 'base', index: '10', name: '底座与铭牌', en: 'BASE & NAMEPLATE', mass: 45,
        description: '底座支撑器身并固定安装；铭牌记录额定容量、电压、联结组和绝缘等级。',
        specs: [['安装', '槽钢底座'], ['联结组', 'Dyn11'], ['标准', 'GB 1094']],
        material: '型钢 / 铝铭牌', accent: '#adc0c8', anchor: [0, -1.72, 1.1],
        explode: [0, -1.2, 1.0]
      }
    ],
    controls: [
      { id: 'primaryVoltage', label: '一次电压', en: 'PRIMARY VOLTAGE', min: 9.5, max: 10.5, step: 0.1, value: 10, unit: 'kV', digits: 1, accent: '#ffc66b', scaleMin: '9.5', scaleMax: '10.5' },
      { id: 'load', label: '负载率', en: 'LOAD RATE', min: 0, max: 120, step: 1, value: 60, unit: '%', digits: 0, accent: '#57dcff', scaleMin: '0', scaleMax: '120', className: '' },
      { id: 'powerFactor', label: '负载功率因数', en: 'LOAD POWER FACTOR', min: 0.6, max: 1, step: 0.01, value: 0.85, unit: '', digits: 2, accent: '#66e6c2', scaleMin: '0.60', scaleMax: '1.00', className: 'accent-mint' }
    ],
    metrics: [
      { id: 'u2', label: 'SECONDARY VOLTAGE', unit: 'V', digits: 0, max: 500, accent: '#57dcff' },
      { id: 'i1', label: 'PRIMARY CURRENT', unit: 'A', digits: 1, max: 60, accent: '#ffc66b' },
      { id: 'efficiency', label: 'EFFICIENCY', unit: '%', digits: 1, max: 100, accent: '#66e6c2' },
      { id: 'capacity', label: 'LOAD CAPACITY', unit: 'kVA', digits: 0, max: 800, accent: '#b49bff' }
    ],
    dataFields: [
      { id: 'i2', label: 'I₂' },
      { id: 'p2', label: 'P₂' },
      { id: 'regulation', label: 'ΔU' },
      { id: 'losses', label: 'P_loss' }
    ],
    charts: [
      { id: 'phasor', label: '相量图', title: '负载相量关系' },
      { id: 'efficiency', label: '效率曲线', title: '效率—负载率' },
      { id: 'regulation', label: '电压调整', title: '二次电压—负载率' }
    ],
    sim: {
      create() {
        return { t: 0 };
      },
      step(state, dt) {
        state.t += dt;
      },
      onInput() {},
      readout(state, inputs) {
        const load = inputs.load / 100;
        const pf = inputs.powerFactor;
        const v1 = inputs.primaryVoltage;
        const s = RATED_KVA * load;
        const p2 = s * pf;
        const q2 = s * Math.sqrt(Math.max(0, 1 - pf * pf));
        const i2 = s * 1000 / (Math.sqrt(3) * (V2_RATED * (v1 / V1_RATED)));
        const iLoad = s * 1000 / (Math.sqrt(3) * v1 * 1000);
        /* 励磁分量：空载电流约为额定电流的 1.8%，随一次电压近似线性变化。 */
        const i0 = 0.018 * RATED_KVA * 1000 / (Math.sqrt(3) * V1_RATED * 1000) * (v1 / V1_RATED);
        const i1 = Math.hypot(iLoad, i0);
        const ur = 0.012;
        const ux = 0.048;
        const regulation = load * (ur * pf + ux * Math.sqrt(Math.max(0, 1 - pf * pf)));
        const u2 = V2_RATED * (v1 / V1_RATED) * (1 - regulation);
        const pFe = 1.15 * Math.pow(v1 / V1_RATED, 2);
        const pCu = 4.7 * load * load;
        const p1 = p2 + pFe + pCu;
        const efficiency = p1 > 0 ? p2 / p1 * 100 : 0;
        const losses = pFe + pCu;
        const phase = Math.acos(pf);
        const phi = ML.radToDeg(phase);
        const legend = this.legendFor();
        return {
          metrics: { u2, i1, efficiency, capacity: s },
          data: {
            i2: i2.toFixed(1) + ' A',
            p2: p2.toFixed(0) + ' kW',
            regulation: (regulation * 100).toFixed(2) + ' %',
            losses: losses.toFixed(2) + ' kW'
          },
          chartNote: 'PF ' + pf.toFixed(2) + ' · φ ' + phi.toFixed(1) + '°',
          chartReadout: 'η ' + efficiency.toFixed(1) + '% · ΔU ' + (regulation * 100).toFixed(2) + '%',
          legend: legend,
          stageMode: 'OIL-IMMERSED / CUTAWAY',
          stageAngleText: 'f 50.0 Hz'
        };
      },
      legendFor() {
        return '<span class="legend-item" style="color:#ffc66b"><i style="background:#ffc66b"></i>一次侧 U₁ / I₁</span>' +
          '<span class="legend-item" style="color:#57dcff"><i style="background:#57dcff"></i>二次侧 U₂ / I₂</span>' +
          '<span class="legend-item" style="color:#66e6c2"><i style="background:#66e6c2"></i>励磁分量</span>';
      },
      drawChart(mode, ctx, w, h, state, inputs) {
        const C = ML.Charts;
        C.clear(ctx, w, h);
        if (mode === 'phasor') return drawPhasor(ctx, w, h, inputs);
        if (mode === 'efficiency') return drawEfficiency(ctx, w, h, inputs);
        return drawRegulation(ctx, w, h, inputs);
      },
      animate(state, dt, inputs, visual) {
        const extras = visual.extras || {};
        const load = Math.abs(inputs.load || 0) / 100;
        const voltage = Math.abs(inputs.primaryVoltage || 10) / 10;
        if (extras.fieldMaterials) {
          const p = (0.48 + voltage * 0.2) + Math.sin(state.t * 3.0) * 0.12;
          extras.fieldMaterials.forEach((m) => { m.opacity = p; });
        }
        if (extras.coolingFans) {
          state.fanAngle = (state.fanAngle || 0) + dt * (7 + load * 34 + voltage * 3);
          extras.coolingFans.forEach((fan) => { fan.rotation.x = state.fanAngle; });
        }
        if (extras.oilParticles) {
          const speed = 0.12 + load * 0.72;
          extras.oilParticles.forEach((item) => {
            item.phase = (item.phase + dt * speed) % 1;
            item.mesh.position.y = -1.1 + item.phase * 2.25;
            item.mesh.position.x = item.x + Math.sin((state.t + item.phase * 6) * 2.2) * 0.035;
          });
          if (extras.oilParticles[0]) {
            extras.oilParticles[0].mesh.material.opacity = load > 0.04 ? 0.18 + load * 0.42 : 0.03;
          }
        }
      }
    },
    build(ctx) {
      const root = new THREE.Group();
      const groups = {};
      const iron = ML.Materials.ironCore();
      const ironDark = ML.Materials.ironDark();
      const copper = ML.Materials.copper();
      const copperBright = ML.Materials.copperBright();
      const copperDark = ML.Materials.copperDark();
      const paint = ML.Materials.paint();
      const paintLight = ML.Materials.paintLight();
      const insulation = ML.Materials.insulation();
      const ceramic = ML.Materials.ceramic();
      const metal = ML.Materials.steel();
      const brass = ML.Materials.brass();
      const rubber = ML.Materials.rubber();
      const fieldGroup = new THREE.Group();
      const fieldMaterials = [];
      const coolingFans = [];
      const oilParticles = [];
      const oilMaterial = new THREE.MeshBasicMaterial({ color: 0xffc66b, transparent: true, opacity: 0.0, depthWrite: false });

      /* core */
      const core = new THREE.Group();
      groups.core = core;
      root.add(core);
      const limbX = [-1.15, 0, 1.15];
      limbX.forEach((x) => {
        ML.addBox(core, 0.5, 2.55, 0.64, iron, x, 0, 0, { edges: true, edgeColor: 0x708e9d, edgeOpacity: 0.12 });
        for (let i = 0; i < 9; i += 1) {
          ML.addBox(core, 0.512, 0.03, 0.652, ironDark, x, -1.02 + i * 0.25, 0, { castShadow: false });
        }
      });
      [-1.47, 1.47].forEach((y) => {
        ML.addBox(core, 3.25, 0.48, 0.64, iron, 0, y, 0, { edges: true, edgeColor: 0x708e9d, edgeOpacity: 0.12 });
        for (let i = 0; i < 8; i += 1) {
          ML.addBox(core, 3.25, 0.03, 0.652, ironDark, 0, y - 0.16 + i * 0.045, 0, { castShadow: false });
        }
      });

      /* HV / LV windings */
      const hv = new THREE.Group();
      const lv = new THREE.Group();
      groups.hvWinding = hv;
      groups.lvWinding = lv;
      root.add(hv);
      root.add(lv);
      limbX.forEach((x, index) => {
        // LV conductor bands are visible through the HV cutaway.
        for (let i = 0; i < 8; i += 1) {
          addCoilBand(lv, 0.43, 0.17, -0.78 + i * 0.22, x, 0, index === 1 ? copperBright : copper, false);
        }
        ML.addTorus(lv, 0.445, 0.018, copperDark, x, 0.95, 0, [Math.PI / 2, 0, 0], 5, 28);
        ML.addTorus(lv, 0.445, 0.018, copperDark, x, -0.95, 0, [Math.PI / 2, 0, 0], 5, 28);
        for (let i = 0; i < 9; i += 1) {
          addCoilBand(hv, 0.62, 0.18, -0.85 + i * 0.21, x, 0, index === 1 ? copper : copperBright, true);
        }
        ML.addTorus(hv, 0.65, 0.022, copperDark, x, 1.03, 0, [Math.PI / 2, 0, 0], 5, 32);
        ML.addTorus(hv, 0.65, 0.022, copperDark, x, -1.03, 0, [Math.PI / 2, 0, 0], 5, 32);
      });

      /* end insulation and clamping */
      const insulationGroup = new THREE.Group();
      groups.insulation = insulationGroup;
      root.add(insulationGroup);
      limbX.forEach((x) => {
        [-1.1, 1.1].forEach((y) => {
          ML.addCylinder(insulationGroup, 0.7, 0.7, 0.075, 32, insulation, x, y, 0, 'y', { edges: false });
        });
        for (let i = 0; i < 4; i += 1) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          ML.addBox(insulationGroup, 0.045, 2.2, 0.045, insulation, x + Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66, { castShadow: false });
        }
        ML.addBox(insulationGroup, 0.9, 0.1, 0.9, ML.Materials.insulationBlue(), x, 1.2, 0, { castShadow: false });
      });
      [-1.55, 1.55].forEach((y) => {
        ML.addBox(insulationGroup, 3.15, 0.08, 0.92, ML.Materials.insulationBlue(), 0, y, 0, { castShadow: false });
      });

      /* tank, cutaway front */
      const tank = new THREE.Group();
      groups.tank = tank;
      root.add(tank);
      ML.addBox(tank, 4.25, 3.55, 0.1, paint, 0, 0, -1.18, { edges: true, edgeColor: 0x7895a2, edgeOpacity: 0.15 });
      ML.addBox(tank, 0.1, 3.55, 2.4, paint, -2.08, 0, 0, { edges: true, edgeColor: 0x7895a2, edgeOpacity: 0.13 });
      ML.addBox(tank, 0.1, 3.55, 2.4, paint, 2.08, 0, 0, { edges: true, edgeColor: 0x7895a2, edgeOpacity: 0.13 });
      ML.addBox(tank, 4.25, 0.14, 2.4, paintLight, 0, -1.7, 0, { edges: true, edgeColor: 0x89a6b1, edgeOpacity: 0.12 });
      ML.addBox(tank, 4.25, 0.16, 2.4, paintLight, 0, 1.78, 0, { edges: true, edgeColor: 0x89a6b1, edgeOpacity: 0.12 });
      // cut-away front frame
      ML.addBox(tank, 0.11, 3.4, 0.12, paintLight, -2.08, 0, 1.16);
      ML.addBox(tank, 0.11, 3.4, 0.12, paintLight, 2.08, 0, 1.16);
      ML.addBox(tank, 4.2, 0.12, 0.12, paintLight, 0, -1.62, 1.16);
      ML.addBox(tank, 4.2, 0.12, 0.12, paintLight, 0, 1.68, 1.16);
      for (let i = 0; i < 5; i += 1) {
        ML.addBox(tank, 4.05, 0.035, 0.03, paintLight, 0, -1.3 + i * 0.62, 1.165, { castShadow: false });
      }
      // The front plate is intentionally removed so the tank reads as a cutaway.

      /* radiators */
      const radiator = new THREE.Group();
      groups.radiator = radiator;
      root.add(radiator);
      [-1, 1].forEach((side) => {
        const x = side * 2.48;
        [1.2, -1.15].forEach((y) => {
          ML.addCylinder(radiator, 0.14, 0.14, 2.0, 16, paintLight, x, y, 0, 'z', { rotation: [Math.PI / 2, 0, 0] });
        });
        for (let i = 0; i < 7; i += 1) {
          const z = -0.82 + i * 0.27;
          ML.addCylinder(radiator, 0.055, 0.055, 2.15, 10, paint, x, 0.02, z, 'y');
          ML.addBox(radiator, 0.04, 1.88, 0.18, paintLight, x + side * 0.03, 0.02, z, { castShadow: false });
        }

        /* 可动冷却风扇：负载越大，转速越高。 */
        const fan = new THREE.Group();
        fan.position.set(x + side * 0.24, 0.38, 0.95);
        ML.addCylinder(fan, 0.12, 0.12, 0.12, 16, metal, 0, 0, 0, 'x', { castShadow: false });
        for (let i = 0; i < 5; i += 1) {
          const a = i / 5 * Math.PI * 2;
          const blade = ML.addBox(fan, 0.045, 0.5, 0.14, paintLight, 0, 0, 0, { castShadow: false });
          blade.position.set(0, Math.cos(a) * 0.26, Math.sin(a) * 0.26);
          blade.rotation.x = a;
        }
        ML.addTorus(fan, 0.48, 0.025, metal, 0, 0, 0, [0, Math.PI / 2, 0], 6, 24);
        radiator.add(fan);
        coolingFans.push(fan);

        /* 油流粒子：负载建立后开始沿散热器循环。 */
        for (let i = 0; i < 5; i += 1) {
          const particle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), oilMaterial);
          particle.position.set(x, -1.05 + i * 0.52, 0.55);
          radiator.add(particle);
          oilParticles.push({ mesh: particle, phase: i / 5, x: x });
        }
      });

      /* bushings */
      const hvBushing = new THREE.Group();
      groups.hvBushing = hvBushing;
      root.add(hvBushing);
      limbX.forEach((x) => addBushing(hvBushing, x, 1.9, -0.18, 1.25, 0.16, ceramic, brass));
      const lvBushing = new THREE.Group();
      groups.lvBushing = lvBushing;
      root.add(lvBushing);
      [-1.32, -0.44, 0.44, 1.32].forEach((x) => addBushing(lvBushing, x, 1.9, 0.62, 0.62, 0.1, ML.Materials.insulation(), brass));

      /* tap changer */
      const tap = new THREE.Group();
      groups.tapChanger = tap;
      root.add(tap);
      ML.addBox(tap, 0.45, 0.42, 0.4, paintLight, -1.38, 2.05, 0.1, { edges: true, edgeColor: 0x87a4af, edgeOpacity: 0.16 });
      ML.addCylinder(tap, 0.16, 0.16, 0.08, 20, brass, -1.38, 2.28, 0.1, 'y');
      ML.addBox(tap, 0.28, 0.07, 0.18, metal, -1.38, 2.34, 0.1, { castShadow: false });
      ML.addBox(tap, 0.55, 0.06, 0.08, metal, -1.12, 2.18, 0.1, { rotation: [0, 0, 0.2] });

      /* base / nameplate */
      const base = new THREE.Group();
      groups.base = base;
      root.add(base);
      [-1.3, 1.3].forEach((x) => ML.addBox(base, 0.22, 0.22, 3.0, paintLight, x, -1.92, 0, { edges: true, edgeColor: 0x7e9ca8, edgeOpacity: 0.14 }));
      ML.addBox(base, 3.6, 0.12, 0.6, paintLight, 0, -1.78, 0.95, { castShadow: false });
      ML.addTextPlane(base, '630 kVA  ·  10 / 0.4 kV  ·  Dyn11', [0, -1.68, 1.26], 2.2, 0.18, {
        color: 'rgba(226,215,185,0.82)', fontPx: 64, opacity: 0.9
      });

      /* magnetic flux overlay */
      fieldGroup.position.z = 0.52;
      root.add(fieldGroup);
      limbX.forEach((x, index) => {
        const color = index === 1 ? 0xffb46b : 0x6fe8d0;
        fieldMaterials.push(addFluxArrow(fieldGroup, [x, -1.15, 0], [x, 1.05, 0], color));
        fieldMaterials.push(addFluxArrow(fieldGroup, [x, 1.05, 0], [x, 1.42, 0], color));
      });
      fieldMaterials.push(addFluxArrow(fieldGroup, [-1.15, 1.47, 0], [-0.35, 1.47, 0], 0xffb46b));
      fieldMaterials.push(addFluxArrow(fieldGroup, [1.15, 1.47, 0], [0.35, 1.47, 0], 0xffb46b));
      fieldMaterials.push(addFluxArrow(fieldGroup, [-1.15, -1.47, 0], [-0.35, -1.47, 0], 0x6fe8d0));
      fieldMaterials.push(addFluxArrow(fieldGroup, [1.15, -1.47, 0], [0.35, -1.47, 0], 0x6fe8d0));

      return {
        root: root,
        groups: groups,
        extras: { fieldGroup: fieldGroup, fieldMaterials: fieldMaterials, coolingFans: coolingFans, oilParticles: oilParticles }
      };
    },
    knowledge: [
      {
        id: 'magnetic', kicker: '01 / MAGNETIC CIRCUIT', title: '磁路与变比',
        lead: '变压器通过交变主磁通把一次侧能量传递到二次侧。铁心负责提供低磁阻磁路，绕组负责建立磁动势。',
        html: `
          <div class="topic-section"><h4>感应电动势</h4><p>忽略漏阻抗时，一次、二次绕组每匝感应电动势近似相等，因此电压比等于匝数比。改变分接开关实际上就是改变高压侧有效匝数。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>INDUCED EMF</span><strong>E = 4.44 f N Φ<em>m</em></strong></div>
            <div class="formula-card"><span>TURNS RATIO</span><strong>U₁ / U₂ ≈ N₁ / N₂</strong></div>
            <div class="formula-card"><span>CURRENT RATIO</span><strong>I₁ / I₂ ≈ N₂ / N₁</strong></div>
            <div class="formula-card"><span>THIS MACHINE</span><strong>10 kV / 0.4 kV ≈ 25</strong></div>
          </div>
          <div class="topic-section"><h4>三相磁路</h4><p>三柱式铁心的三相磁通在上下铁轭中闭合。三相电压对称时，磁通也近似对称；实际铁心需要考虑磁阻、饱和、涡流和叠片绝缘。</p></div>
          <div class="callout"><b>观察</b><p>调节一次电压，二次电压近似按比例变化；调节负载后，由于漏阻抗压降，二次电压还会随负载率下降。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="field">显示主磁通方向</button></div>
        `
      },
      {
        id: 'load', kicker: '02 / PHASOR', title: '空载、负载与相量图',
        lead: '空载时励磁电流建立主磁通；带上负载后，二次电流产生的磁动势会削弱主磁通，一次电流随之增加以维持磁通近似不变。',
        html: `
          <div class="topic-section"><h4>磁动势平衡</h4><p>一次侧电流包含励磁分量和负载分量。负载电流越大，一次电流越大；负载性质决定电流相量相对于电压的相位。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>MMF BALANCE</span><strong>N₁ I₁ + N₂ I₂ = N₁ I₀</strong></div>
            <div class="formula-card"><span>ACTIVE POWER</span><strong>P₂ = S cosφ</strong></div>
            <div class="formula-card"><span>REACTIVE POWER</span><strong>Q₂ = S sinφ</strong></div>
            <div class="formula-card"><span>LOAD CURRENT</span><strong>I₂ = S / (√3 U₂)</strong></div>
          </div>
          <div class="topic-section"><h4>相量关系</h4><p>在右侧切换到“相量图”标签，可以看到 U₂、I₂ 的相位差，以及一次侧电压、电流和励磁分量。功率因数从 1 降低到 0.6 时，I₂ 与 U₂ 的夹角增大。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="run">运行并观察相量</button></div>
        `
      },
      {
        id: 'loss', kicker: '03 / LOSS & EFFICIENCY', title: '损耗与效率',
        lead: '变压器没有机械损耗，主要损耗是铁耗和铜耗。铁耗近似恒定，铜耗随负载电流平方增长。',
        html: `
          <div class="formula-grid">
            <div class="formula-card"><span>IRON LOSS</span><strong>P<em>Fe</em> ≈ 常数</strong></div>
            <div class="formula-card"><span>COPPER LOSS</span><strong>P<em>Cu</em> = I²R ∝ β²</strong></div>
            <div class="formula-card"><span>EFFICIENCY</span><strong>η = P₂ / (P₂ + P<em>Fe</em> + P<em>Cu</em>)</strong></div>
            <div class="formula-card"><span>MAX EFFICIENCY</span><strong>P<em>Cu</em> = P<em>Fe</em></strong></div>
          </div>
          <div class="topic-section"><h4>效率曲线</h4><p>效率先随负载上升，在铜耗等于铁耗时达到最大，之后因铜耗增长过快而下降。配电变压器通常把最大效率点设计在 50%–75% 额定负载附近。</p></div>
          <div class="callout"><b>注意</b><p>功率因数降低时，为输出同样的有功功率需要更大的视在容量和电流，铜耗增加，效率下降。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="explode">剖解观察器身</button></div>
        `
      },
      {
        id: 'operation', kicker: '04 / OPERATION', title: 'Dyn11 与运行条件',
        lead: '三相变压器需要关注联结组、绝缘、温升和并列运行条件。Dyn11 表示高压侧三角形接、低压侧星形接并引出中性点。',
        html: `
          <div class="topic-section"><h4>联结组</h4><p>Dyn11 的低压侧线电压超前高压侧对应线电压 30°。联结组别影响并联运行、继电保护和三相不平衡负载的零序通路。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>HIGH SIDE</span><strong>D — 三角形</strong></div>
            <div class="formula-card"><span>LOW SIDE</span><strong>yn — 星形 + 中性点</strong></div>
            <div class="formula-card"><span>PARALLEL CONDITION</span><strong>同容量比 · 同变比 · 同联结组</strong></div>
            <div class="formula-card"><span>COOLING</span><strong>ONAN — 油自然循环 / 空气自然循环</strong></div>
          </div>
          <div class="topic-section"><h4>冷却与温升</h4><p>油在器身中吸收热量后上升，经散热器冷却后下降，形成自然循环。负载过高、散热不良或环境温度过高都会导致温升超限，加速绝缘老化。</p></div>
          <div class="callout"><b>教学口径</b><p>本页采用 630 kVA / 10 kV / 0.4 kV 教学样机参数，损耗与电压调整为等效模型，不对应具体产品铭牌。</p></div>
        `
      }
    ]
  });

  /* chart implementations */
  function drawPhasor(ctx, w, h, inputs) {
    const C = ML.Charts;
    const box = C.frame(w, h, { left: 40, right: 30, top: 18, bottom: 20 });
    C.grid(ctx, box, 4, 4);
    const cx = w * 0.42;
    const cy = h * 0.51;
    const scale = Math.min(w * 0.28, h * 0.42);
    const pf = inputs.powerFactor;
    const phi = Math.acos(pf);
    const load = inputs.load / 100;
    ctx.save();
    ctx.strokeStyle = 'rgba(126, 182, 208, 0.18)';
    ctx.beginPath();
    ctx.moveTo(cx - scale * 1.1, cy);
    ctx.lineTo(cx + scale * 1.2, cy);
    ctx.moveTo(cx, cy - scale * 1.2);
    ctx.lineTo(cx, cy + scale * 1.2);
    ctx.stroke();
    ctx.restore();
    C.arrow(ctx, cx, cy, cx + scale * 0.95, cy, '#ffc66b', 1.8, 'U₁', { labelSize: 10 });
    C.arrow(ctx, cx, cy, cx + scale * 0.78, cy, '#57dcff', 1.8, 'U₂', { labelSize: 10, labelDy: 12 });
    const i2len = scale * (0.2 + load * 0.62);
    C.arrow(ctx, cx, cy, cx + Math.cos(phi) * i2len, cy + Math.sin(phi) * i2len, '#57dcff', 1.7, 'I₂', { labelSize: 10 });
    C.arrow(ctx, cx, cy, cx + scale * 0.18, cy - scale * 0.45, '#66e6c2', 1.4, 'I₀', { labelSize: 9 });
    C.arrow(ctx, cx, cy, cx + Math.cos(phi) * i2len * 0.3 + scale * 0.2, cy + Math.sin(phi) * i2len * 0.3 - scale * 0.12, '#ffc66b', 1.4, 'I₁', { labelSize: 10 });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,198,107,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, phi);
    ctx.stroke();
    ctx.restore();
    C.label(ctx, 'φ', cx + 40, cy + 20, { color: 'rgba(255,198,107,0.8)', size: 9 });
    C.label(ctx, '滞后电流 / 负载 ' + Math.round(inputs.load) + '%', box.left, box.bottom + 16, { color: 'rgba(111,154,172,0.72)', size: 8 });
    C.note(ctx, 'PHASOR / REFERENCE U₂', box.right, box.top + 8, 'rgba(107,155,174,0.68)');
  }

  function drawEfficiency(ctx, w, h, inputs) {
    const C = ML.Charts;
    const box = C.frame(w, h, { left: 38, right: 16, top: 16, bottom: 25 });
    C.grid(ctx, box, 6, 4);
    C.border(ctx, box);
    const frame = C.frameFor(box, 0, 120, 94, 100);
    C.axisTicks(ctx, frame, { xTicks: 6, yTicks: 3, yDigits: 1, xUnit: '负载率 %', yUnit: 'η %' });
    const pf = inputs.powerFactor;
    const points = [];
    for (let load = 0; load <= 120; load += 2) {
      const p2 = RATED_KVA * (load / 100) * pf;
      const eff = p2 > 0 ? p2 / (p2 + 1.15 + 4.7 * Math.pow(load / 100, 2)) * 100 : 0;
      points.push([frame.x(load), frame.y(eff)]);
    }
    C.line(ctx, points, C.colors.amber, 1.8, { glow: 6 });
    const load = inputs.load;
    const p2 = RATED_KVA * (load / 100) * pf;
    const eff = p2 > 0 ? p2 / (p2 + 1.15 + 4.7 * Math.pow(load / 100, 2)) * 100 : 0;
    const px = frame.x(load);
    const py = frame.y(eff);
    ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(255,198,107,0.3)'; ctx.beginPath(); ctx.moveTo(px, box.bottom); ctx.lineTo(px, py); ctx.stroke(); ctx.restore();
    C.dot(ctx, px, py, C.colors.amber, 3.5);
    C.label(ctx, '当前 η ' + eff.toFixed(1) + '%', px + 8, py - 8, { color: C.colors.amber, size: 8 });
  }

  function drawRegulation(ctx, w, h, inputs) {
    const C = ML.Charts;
    const box = C.frame(w, h, { left: 42, right: 16, top: 16, bottom: 25 });
    C.grid(ctx, box, 6, 4);
    C.border(ctx, box);
    const frame = C.frameFor(box, 0, 120, 350, 420);
    C.axisTicks(ctx, frame, { xTicks: 6, yTicks: 4, yDigits: 0, xUnit: '负载率 %', yUnit: 'U₂ V' });
    const pf = inputs.powerFactor;
    const curves = [
      { pf: 1, color: 'rgba(102,230,194,0.82)', label: 'cosφ 1.0' },
      { pf: 0.85, color: 'rgba(87,220,255,0.82)', label: 'cosφ 0.85' },
      { pf: 0.7, color: 'rgba(255,126,155,0.82)', label: 'cosφ 0.70' }
    ];
    curves.forEach((curve) => {
      const pts = [];
      for (let load = 0; load <= 120; load += 2) {
        const beta = load / 100;
        const ur = 0.012;
        const ux = 0.048;
        const reg = beta * (ur * curve.pf + ux * Math.sqrt(Math.max(0, 1 - curve.pf * curve.pf)));
        pts.push([frame.x(load), frame.y(V2_RATED * (inputs.primaryVoltage / V1_RATED) * (1 - reg))]);
      }
      C.line(ctx, pts, curve.color, 1.4, { glow: 3 });
    });
    const load = inputs.load;
    const beta = load / 100;
    const reg = beta * (0.012 * pf + 0.048 * Math.sqrt(Math.max(0, 1 - pf * pf)));
    const u2 = V2_RATED * (inputs.primaryVoltage / V1_RATED) * (1 - reg);
    C.dot(ctx, frame.x(load), frame.y(u2), C.colors.cyan, 3.5);
    C.legendDot(ctx, box.right - 70, box.top + 10, '#66e6c2', 'cosφ 1.0');
    C.legendDot(ctx, box.right - 70, box.top + 22, '#57dcff', 'cosφ 0.85');
    C.legendDot(ctx, box.right - 70, box.top + 34, '#ff7e9b', 'cosφ 0.70');
  }
})(window);
