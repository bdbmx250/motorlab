/* 直流电机 — 他励直流电动机，剖切结构 + 实时教学仿真。 */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  const ACCENT = '#57dcff';

  /* 教学样机参数（SI 单位，标注为教学样机，不对应厂家铭牌） */
  const Ke = 1.6;              // V·s/rad，反电动势系数（归一到每极磁通）
  const Kt = 1.6;              // N·m/A，转矩系数
  const Ra = 0.6;              // Ω，电枢回路总电阻
  const J = 0.08;              // kg·m²，转动惯量（教学样机，小惯量便于快速响应）
  const B = 0.004;             // N·m·s/rad，粘性阻尼
  const UF = 110;              // V，他励励磁电源
  const PHI0 = 1.0;            // 每极磁通饱和值（标幺）
  const PHI_R = 0.03;          // 剩磁（标幺）
  const IF0 = 0.9;             // A，磁化曲线拐点电流
  const IA_LIMIT = 900;        // A，显示/数值保护
  const OMEGA_MAX = Math.PI * 2 * 3600 / 60; // 机械限速（约 3600 rpm）
  const VISUAL_SCALE = 0.045;  // 3D 转子可视转速缩放
  const RATED_U = 220;         // V，教学样机额定电枢电压

  function fluxOf(ifA) {
    return PHI_R + (PHI0 - PHI_R) * Math.tanh(Math.max(0, ifA) / IF0);
  }

  function rpmOf(omega) {
    return omega * 60 / (2 * Math.PI);
  }

  /* 稳态解析解：用于特性曲线，和时域积分共用同一组方程。 */
  function steadyState(U, If, TL) {
    const phi = fluxOf(If);
    const k = Math.max(0.02, Kt * phi);
    const kE = Math.max(0.02, Ke * phi);
    const omega = ML.clamp((U - Ra * TL / k) / (kE + Ra * B / k), -OMEGA_MAX, OMEGA_MAX);
    const ia = (TL + B * omega) / k;
    const p1 = U * ia + UF * If;
    const p2 = TL * omega;
    return {
      phi: phi,
      omega: omega,
      ia: ia,
      e: kE * omega,
      torque: k * ia,
      p1: p1,
      p2: p2,
      eta: p1 > 1 ? ML.clamp(p2 / p1 * 100, 0, 100) : 0
    };
  }

  function updateRotor(visual, state) {
    if (!visual || !visual.groups) return;
    const g = visual.groups;
    const angle = state.visualAngle;
    if (g.armatureCore) g.armatureCore.rotation.x = angle;
    if (g.armatureWinding) g.armatureWinding.rotation.x = angle;
    if (g.commutator) g.commutator.rotation.x = angle;
    if (g.shaft) g.shaft.rotation.x = angle;
  }

  /* 磁通箭头：普通混合、半透明、参与深度测试，只作为场线提示，不遮挡模型。 */
  function addFluxArrow(parent, from, to, color) {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = Math.max(0.001, dir.length());
    const axis = dir.clone().normalize();
    const material = ML.makeBasic(color, 0.36, {
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len * 0.74, 6), material);
    shaft.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    parent.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), material);
    head.position.set(to[0], to[1], to[2]).addScaledVector(axis, -0.07);
    head.quaternion.copy(shaft.quaternion);
    parent.add(head);
    return material;
  }

  ML.registerMachine({
    id: 'dc',
    order: 2,
    title: '直流电机',
    en: 'DC MACHINE',
    cardEn: 'SEPARATELY EXCITED DC MOTOR',
    accent: ACCENT,
    blurb: '主磁极、电枢与换向器共同完成直流的机电能量转换。改变电枢电压、励磁电流和负载转矩，观察启动电流冲击、转速与机械特性。',
    topics: ['换向与电刷', 'E/T 公式', '启动与调速', '机械特性'],
    structureTitle: '磁极、电枢与换向器',
    structureNote: '机座内壁安装主磁极与换向极，电枢铁心嵌放电枢绕组，换向器与电刷把外部直流转换为绕组内的交变电流。前端剖开，换向器与电刷完全暴露。',
    structureFoot: '3 kW · 220 V · 1500 rpm',
    consoleTitle: '运行控制',
    consoleKicker: '电枢与励磁',
    consoleLead: '调节电枢电压、励磁与负载，观察转速、电流与效率。',
    consoleTag: 'DC MACHINE / SIM',
    stageMode: 'DC MACHINE / CUTAWAY',
    fieldLabel: '主磁场',
    ctaSub: '公式 · 换向 · 启动 · 特性',
    knowledgeMeta: 'COMMUTATION / EMF / TORQUE / CHARACTERISTIC',
    viewDirection: [0.62, 0.3, 0.72],
    fitPadding: 1.0,
    explodePadding: 0.92,
    explodeDuration: 1000,
    legend: [
      { color: '#57dcff', label: '电枢与主磁场' },
      { color: '#ffc66b', label: '励磁回路' },
      { color: '#66e6c2', label: '机械输出' }
    ],
    cardArt: `
      <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" stroke-width="1.3">
        <circle cx="104" cy="120" r="76" opacity=".52"/>
        <path d="M104 44a76 76 0 0 1 0 152" stroke-width="2.2" opacity=".9"/>
        <path d="M18 120h10M180 120h10" opacity=".5"/>
        <rect x="72" y="48" width="64" height="17" rx="3" opacity=".85"/>
        <rect x="72" y="175" width="64" height="17" rx="3" opacity=".85"/>
        <path d="M58 66c-9 14-9 96 0 110M150 66c9 14 9 96 0 110" opacity=".42"/>
        <circle cx="104" cy="120" r="44" opacity=".9"/>
        <circle cx="104" cy="120" r="30" opacity=".35" stroke-dasharray="3 5"/>
        <path d="M104 76v-7M104 171v-7M60 120h-7M155 120h-7M73 89l-5-5M136 151l5 5M135 89l5-5M73 151l-5 5" opacity=".55"/>
        <path d="M104 120h96" stroke-width="2.2" opacity=".92"/>
        <rect x="184" y="108" width="24" height="24" rx="3" opacity=".9"/>
        <path d="M196 108v-12M196 132v12" opacity=".55"/>
        <path d="M160 94v52M188 96v48" opacity=".5"/>
        <circle cx="104" cy="120" r="10" opacity=".85"/>
        <rect x="76" y="24" width="56" height="10" rx="2" opacity=".8"/>
        <path d="M86 34v10M104 34v9M122 34v10" opacity=".55"/>
        <path d="M58 206c10 8 22 11 36 12M150 206c-10 8-22 11-36 12" opacity=".3"/>
      </svg>
    `,
    parts: [
      {
        id: 'frame', index: '01', name: '机座', en: 'FRAME / YOKE', mass: 96,
        description: '机座由铸铁或钢板焊接而成，既是主磁极的安装基础，也构成主磁通回路的一部分。前端剖开后可以看到磁极与电枢之间的气隙。',
        specs: [['材料', '灰铸铁 / 钢板'], ['结构', '整体式机座'], ['安装', '底脚式']],
        material: '铸铁 / 结构钢', accent: '#7fb2c4', anchor: [0.9, 1.34, 0.42],
        explode: [0, 0, -2.6]
      },
      {
        id: 'mainPole', index: '02', name: '主磁极与励磁绕组', en: 'MAIN POLES & FIELD WINDING', mass: 48,
        description: '主磁极铁心套有励磁绕组，通入直流励磁电流后建立主磁场。磁极极性沿圆周交替排列，本模型采用 N、S 两极限教学结构。',
        specs: [['极数', '2 极'], ['励磁', '他励 DC'], ['绕组', '铜线绕制']],
        material: '硅钢 / 铜绕组', accent: '#ffc66b', anchor: [-0.15, 0.84, 0.34],
        explode: [0, 2.5, 0]
      },
      {
        id: 'interpole', index: '03', name: '换向极', en: 'COMMUTATING POLES', mass: 12,
        description: '换向极装在主磁极之间，其绕组与电枢串联。换向极磁场抵消换向区电枢反应磁通，减小电刷下的火花。',
        specs: [['数量', '2 个'], ['绕组', '与电枢串联'], ['作用', '改善换向']],
        material: '硅钢 / 铜绕组', accent: '#8fd7e8', anchor: [-0.15, 0.12, 1.22],
        explode: [0, 2.0, 1.6]
      },
      {
        id: 'armatureCore', index: '04', name: '电枢铁心', en: 'ARMATURE CORE', mass: 42,
        description: '电枢铁心由硅钢片叠压而成，外圆冲有槽，用于嵌放电枢绕组。叠片结构可以减小旋转时磁通交变引起的涡流损耗。',
        specs: [['材料', '0.5 mm 硅钢叠片'], ['槽数', '18'], ['直径', 'Ø156 mm']],
        material: '冷轧硅钢片', accent: '#57dcff', anchor: [-0.15, 0.62, 0.56],
        explode: [0, 0, 0]
      },
      {
        id: 'armatureWinding', index: '05', name: '电枢绕组', en: 'ARMATURE WINDING', mass: 26,
        description: '电枢绕组嵌放在电枢槽内，通过换向器与电刷接入外部电路。转子旋转时，绕组中的感应电动势方向随位置交变，经换向器整流后输出。',
        specs: [['导线', '高强度漆包铜线'], ['槽数', '18'], ['连接', '换向器']],
        material: '铜绕组 / 绝缘漆', accent: '#7ce7ff', anchor: [0.55, 0.52, 0.5],
        explode: [0, 0, 0]
      },
      {
        id: 'commutator', index: '06', name: '换向器', en: 'COMMUTATOR', mass: 18,
        description: '换向器由若干铜换向片和云母绝缘片组成，随电枢一起旋转。它与静止电刷滑动接触，把外部直流电流分配给不断换位的电枢绕组。',
        specs: [['换向片', '24 片'], ['绝缘', '云母'], ['安装', '压装在转轴上']],
        material: '硬铜 / 云母', accent: '#ffd27a', anchor: [1.75, 0.34, 0.34],
        explode: [1.9, 0, 0]
      },
      {
        id: 'brushes', index: '07', name: '电刷与刷架', en: 'BRUSHES & BRUSH GEAR', mass: 6,
        description: '电刷由石墨制成，被弹簧压在换向器表面，静止不动。刷架、刷握与引线把电刷电流引到外部端子，换向质量直接影响火花与寿命。',
        specs: [['电刷', '石墨'], ['数量', '2 组'], ['压紧', '弹簧']],
        material: '石墨 / 黄铜 / 绝缘件', accent: '#ffb066', anchor: [1.75, 0.96, 0.05],
        explode: [0, 2.2, 1.6]
      },
      {
        id: 'endShield', index: '08', name: '前后端盖', en: 'END SHIELDS', mass: 30,
        description: '端盖固定轴承并支撑转轴，同时把电枢封闭在机座内。剖切后可以看到端盖上的轴承室与固定螺栓。',
        specs: [['材料', '铸铁'], ['轴承', '滚动轴承'], ['固定', '螺栓连接']],
        material: '灰铸铁 / 轴承钢', accent: '#9ab6c2', anchor: [1.31, 0.62, 1.0],
        explode: [0, 1.3, -2.2]
      },
      {
        id: 'shaft', index: '09', name: '转轴', en: 'SHAFT', mass: 22,
        description: '转轴传递电磁转矩并支撑电枢、换向器与轴承。轴伸端通过联轴器拖动负载，剖切模型中可以清楚看到轴与电枢的同轴关系。',
        specs: [['材料', '45 钢'], ['轴伸', '单轴伸'], ['连接', '联轴器']],
        material: '优质碳素钢', accent: '#c3d6de', anchor: [2.2, 0.16, 0.1],
        explode: [-2.9, 0, 0]
      },
      {
        id: 'terminalBox', index: '10', name: '接线盒', en: 'TERMINAL BOX', mass: 5,
        description: '接线盒内设电枢与励磁端子，把外部电源引到电刷和励磁绕组。盒体带密封结构，可防止粉尘与油污进入。',
        specs: [['端子', '电枢 2 / 励磁 2'], ['防护', 'IP54'], ['进线', '电缆格兰']],
        material: '钢板 / 绝缘端子', accent: '#b8cdd6', anchor: [-0.75, 2.1, 0.2],
        explode: [-2.2, 1.6, 0]
      }
    ],
    controls: [
      { id: 'armatureVoltage', label: '电枢电压', en: 'ARMATURE VOLTAGE', min: 0, max: 440, step: 1, value: 220, unit: 'V', digits: 0, accent: '#57dcff', scaleMin: '0', scaleMax: '440' },
      { id: 'fieldCurrent', label: '励磁电流', en: 'FIELD CURRENT', min: 0, max: 2, step: 0.02, value: 1.1, unit: 'A', digits: 2, accent: '#ffc66b', scaleMin: '0', scaleMax: '2.0', className: 'accent-amber' },
      { id: 'loadTorque', label: '负载转矩', en: 'LOAD TORQUE', min: 0, max: 40, step: 0.5, value: 12, unit: 'N·m', digits: 1, accent: '#66e6c2', scaleMin: '0', scaleMax: '40', className: 'accent-mint' }
    ],
    metrics: [
      { id: 'speed', label: 'MECHANICAL SPEED', unit: 'rpm', digits: 0, max: 3600, accent: '#57dcff' },
      { id: 'current', label: 'ARMATURE CURRENT', unit: 'A', digits: 1, max: 300, accent: '#ffc66b' },
      { id: 'torque', label: 'ELECTROMAGNETIC TORQUE', unit: 'N·m', digits: 1, max: 60, accent: '#66e6c2' },
      { id: 'efficiency', label: 'EFFICIENCY', unit: '%', digits: 1, max: 100, accent: '#b49bff' }
    ],
    dataFields: [
      { id: 'emf', label: 'E' },
      { id: 'flux', label: 'Φ' },
      { id: 'copper', label: 'P_Cu' },
      { id: 'power', label: 'P₂' }
    ],
    charts: [
      { id: 'mech', label: '机械特性', title: '转速—电磁转矩特性' },
      { id: 'current', label: '电流—负载', title: '电枢电流—负载转矩' },
      { id: 'eff', label: '效率—负载', title: '效率—负载转矩' }
    ],
    sim: {
      create() {
        /* 默认工况（220 V / 1.1 A / 12 N·m）从稳态出发，首屏即为稳定工作点。 */
        const initial = steadyState(220, 1.1, 12);
        return {
          t: 0,
          animT: 0,
          omega: initial.omega,
          ia: initial.ia,
          torque: initial.torque,
          phi: initial.phi,
          theta: 0,
          visualAngle: 0
        };
      },
      onInput(state, inputs) {
        const phi = fluxOf(inputs.fieldCurrent);
        state.phi = phi;
        state.ia = ML.clamp((inputs.armatureVoltage - Ke * phi * state.omega) / Ra, -IA_LIMIT, IA_LIMIT);
        state.torque = Kt * phi * state.ia;
      },
      step(state, dt, inputs, visual) {
        const U = inputs.armatureVoltage;
        const If = inputs.fieldCurrent;
        const TL = inputs.loadTorque;
        const phi = fluxOf(If);
        state.phi = phi;
        const h = Math.min(dt, 0.05);
        const substeps = Math.max(1, Math.min(40, Math.ceil(h / 0.004)));
        const hs = h / substeps;
        for (let i = 0; i < substeps; i += 1) {
          const e = Ke * phi * state.omega;
          const ia = ML.clamp((U - e) / Ra, -IA_LIMIT, IA_LIMIT);
          const torque = Kt * phi * ia;
          const dOmega = (torque - TL - B * state.omega) / J;
          state.omega = ML.clamp(state.omega + dOmega * hs, -OMEGA_MAX, OMEGA_MAX);
          state.ia = ia;
          state.torque = torque;
          state.theta += state.omega * hs;
          state.t += hs;
        }
        state.visualAngle += state.omega * h * VISUAL_SCALE;
        updateRotor(visual, state);
      },
      animate(state, dt, inputs, visual) {
        state.animT += dt;
        const phi = fluxOf(inputs.fieldCurrent);
        const norm = ML.clamp((phi - PHI_R) / (PHI0 - PHI_R), 0, 1);
        const pulse = (0.08 + norm * 0.5) * (0.86 + 0.14 * Math.sin(state.animT * 3.2));
        const materials = (visual && visual.extras && visual.extras.fieldMaterials) || [];
        for (let i = 0; i < materials.length; i += 1) materials[i].opacity = pulse;
        const sparks = (visual && visual.extras && visual.extras.sparks) || [];
        const level = ML.clamp(Math.abs(state.ia) / 140, 0, 1);
        for (let i = 0; i < sparks.length; i += 1) {
          const mesh = sparks[i];
          if (!mesh || !mesh.material) continue;
          const flicker = 0.5 + 0.5 * Math.sin(state.animT * (46 + i * 13) + i * 1.9);
          mesh.material.opacity = (0.08 + level * 0.5) * flicker;
        }
      },
      readout(state, inputs) {
        const U = inputs.armatureVoltage;
        const If = inputs.fieldCurrent;
        const TL = inputs.loadTorque;
        const phi = state.phi || fluxOf(If);
        const e = Ke * phi * state.omega;
        const p1 = U * state.ia + UF * If;
        const p2 = TL * state.omega;
        const copper = state.ia * state.ia * Ra;
        const efficiency = p1 > 1 ? ML.clamp(p2 / p1 * 100, 0, 100) : 0;
        const notes = [];
        if (If < 0.12) notes.push('励磁过弱');
        if (Math.abs(state.omega) >= OMEGA_MAX * 0.98) notes.push('转速受限');
        if (state.ia > 120) notes.push('启动电流冲击');
        const legend = '<span class="legend-item" style="color:#57dcff"><i style="background:#57dcff"></i>电枢回路 Ia</span>' +
          '<span class="legend-item" style="color:#ffc66b"><i style="background:#ffc66b"></i>励磁回路 If</span>' +
          '<span class="legend-item" style="color:#66e6c2"><i style="background:#66e6c2"></i>机械输出 T·ω</span>';
        return {
          metrics: {
            speed: rpmOf(state.omega),
            current: state.ia,
            torque: state.torque,
            efficiency: efficiency
          },
          data: {
            emf: e.toFixed(1) + ' V',
            flux: phi.toFixed(3) + ' p.u.',
            copper: copper.toFixed(0) + ' W',
            power: p2.toFixed(0) + ' W'
          },
          chartNote: 'U ' + U.toFixed(0) + ' V · If ' + If.toFixed(2) + ' A · TL ' + TL.toFixed(1) + ' N·m' +
            (notes.length ? ' · ' + notes.join(' / ') : ''),
          chartReadout: 'E ' + e.toFixed(1) + ' V · Ia ' + state.ia.toFixed(1) + ' A · η ' + efficiency.toFixed(1) + '%',
          legend: legend,
          stageMode: 'SEPARATELY EXCITED / CUTAWAY',
          stageAngle: ML.mod(ML.radToDeg(state.theta), 360)
        };
      },
      drawChart(mode, ctx, w, h, state, inputs, visual) {
        const C = ML.Charts;
        C.clear(ctx, w, h);
        if (mode === 'mech') return drawMechanicalChart(ctx, w, h, state, inputs);
        if (mode === 'current') return drawCurrentChart(ctx, w, h, state, inputs);
        return drawEfficiencyChart(ctx, w, h, state, inputs);
      }
    },
    build(ctx) {
      const root = new THREE.Group();
      const groups = {};
      const M = ML.Materials;

      /* 每个部件独立材质，便于选中高亮与调暗。 */
      const paint = M.paint();
      const paintLight = M.paintLight();
      const castIron = M.castIron();
      const steel = M.steel();
      const darkSteel = M.darkSteel();
      const ironCore = M.ironCore();
      const ironDark = M.ironDark();
      const copper = M.copper();
      const copperBright = M.copperBright();
      const copperDark = M.copperDark();
      const polymer = M.polymer();
      const insulation = M.insulation();
      const brass = M.brass();
      const magnetN = M.magnetNorth();
      const magnetS = M.magnetSouth();
      const innerWall = ML.makeStandard(0x16262f, 0.3, 0.66, { side: THREE.DoubleSide, envMapIntensity: 0.18 });
      const shieldMat = ML.makeStandard(0x3f5b66, 0.5, 0.48, { side: THREE.DoubleSide, envMapIntensity: 0.5 });
      const shieldMatDark = ML.makeStandard(0x2b424c, 0.5, 0.52, { side: THREE.DoubleSide, envMapIntensity: 0.4 });

      const EDGE = { edges: true, edgeColor: 0x8fb6c6, edgeOpacity: 0.14 };
      const EDGE_DIM = { edges: true, edgeColor: 0x6f97a8, edgeOpacity: 0.1, castShadow: false };

      const R = 1.55;              // 机座外半径
      const YOKE_LEN = 2.9;
      const YOKE_X = -0.15;
      const CORE_R = 0.78;
      const CORE_LEN = 2.5;
      const CORE_X = -0.15;
      const SHAFT_R = 0.17;
      const COMM_X = 1.75;
      const COMM_R = 0.52;
      const COMM_LEN = 0.6;

      /* ---------- 01 机座：剖开前端窗口的圆筒 ---------- */
      const frame = new THREE.Group();
      groups.frame = frame;
      root.add(frame);

      const ringMat = ML.makeStandard(0x46626e, 0.48, 0.5, { side: THREE.DoubleSide, envMapIntensity: 0.45 });

      /* 机座分两段：后段保留顶部支撑接线盒，前段开大窗口露出主磁极与励磁绕组。 */
      function addYokeSegment(length, centerX, thetaStart, thetaLength) {
        const outer = new THREE.CylinderGeometry(R, R, length, 48, 1, true, thetaStart, thetaLength);
        ML.addMesh(frame, outer, paint, [centerX, 0, 0], { rotation: [0, 0, Math.PI / 2] });
        const inner = new THREE.CylinderGeometry(R - 0.12, R - 0.12, length, 48, 1, true, thetaStart, thetaLength);
        ML.addMesh(frame, inner, innerWall, [centerX, 0, 0], { rotation: [0, 0, Math.PI / 2], castShadow: false });
      }
      addYokeSegment(1.25, -0.975, Math.PI * 0.30, Math.PI * 1.40);
      addYokeSegment(1.65, 0.475, Math.PI * 0.57, Math.PI * 1.12);
      /* 两段窗口宽度不同处的台阶剖面 */
      const stepRing = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R, 26, 1, Math.PI * 0.43, Math.PI * 0.27), ringMat);
      stepRing.rotation.y = Math.PI / 2;
      stepRing.position.set(-0.35, 0, 0);
      stepRing.castShadow = false;
      frame.add(stepRing);

      /* 端部法兰环，表现机座壁厚 */
      [-YOKE_LEN / 2, YOKE_LEN / 2].forEach((dx) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.13, R, 48), ringMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(YOKE_X + dx, 0, 0);
        ring.castShadow = true;
        ring.receiveShadow = true;
        frame.add(ring);
      });

      /* 剖切边：各段窗口的轴向切面，强化“剖开”的读图感 */
      function addCutEdges(centerX, length, thetas) {
        thetas.forEach((theta) => {
          const rr = R - 0.065;
          const edge = ML.addBox(frame, length, 0.12, 0.032, paintLight, centerX, rr * Math.sin(theta), rr * Math.cos(theta), { castShadow: false });
          edge.rotation.x = Math.PI / 2 - theta;
        });
      }
      addCutEdges(-0.975, 1.25, [Math.PI * 0.30, Math.PI * 1.70]);
      addCutEdges(0.475, 1.65, [Math.PI * 0.57, Math.PI * 1.69]);

      /* 底脚与安装板 */
      [-1.0, 0.72].forEach((x) => {
        ML.addBox(frame, 0.8, 0.24, 1.9, paintLight, x, -R - 0.02, 0, EDGE);
        ML.addBox(frame, 0.95, 0.06, 2.02, darkSteel, x, -R - 0.16, 0, EDGE_DIM);
        [-0.62, 0.62].forEach((dz) => {
          ML.addBolt(frame, x, -R - 0.13, dz, 'y', steel, 0.055, 0.05);
        });
      });

      /* ---------- 02 主磁极 + 励磁绕组（上下两极限教学结构） ---------- */
      const mainPole = new THREE.Group();
      groups.mainPole = mainPole;
      root.add(mainPole);

      [1, -1].forEach((sign) => {
        ML.addBox(mainPole, 1.75, 0.44, 0.8, steel, -0.15, sign * 1.16, 0, EDGE);
        ML.addBox(mainPole, 1.9, 0.16, 1.06, castIron, -0.15, sign * 0.90, 0, EDGE);
        ML.addBox(mainPole, 1.84, 0.055, 0.92, sign > 0 ? magnetN : magnetS, -0.15, sign * 0.815, 0, { castShadow: false });
        for (let i = 0; i < 4; i += 1) {
          const coil = new THREE.Group();
          coil.position.set(-0.15, sign * (1.0 + i * 0.12), 0);
          coil.rotation.x = Math.PI / 2;
          coil.scale.set(1.55, 0.86, 1);
          const torus = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 8, 30), i % 2 === 0 ? copperBright : copper);
          torus.castShadow = true;
          torus.receiveShadow = true;
          coil.add(torus);
          mainPole.add(coil);
        }
      });
      /* 励磁引线：从主磁极绕组引向接线盒 */
      ML.addTube(mainPole, [[0.4, 1.3, 0.55], [0.0, 1.62, 0.5], [-0.4, 1.78, 0.32], [-0.55, 1.86, 0.18]], 0.022, copper, { tubularSegments: 10, radialSegments: 5 });
      ML.addTube(mainPole, [[-0.7, -1.3, 0.55], [-0.7, -1.55, 0.6], [-0.75, -1.66, 0.3]], 0.022, copperDark, { tubularSegments: 8, radialSegments: 5 });

      /* ---------- 03 换向极 ---------- */
      const interpole = new THREE.Group();
      groups.interpole = interpole;
      root.add(interpole);

      function buildInterpole(sign, cutaway) {
        if (cutaway) {
          /* 剖切面切掉换向极的前半部，保留带切口的短段 */
          ML.addBox(interpole, 0.62, 0.56, 0.26, steel, -0.15, 0, sign * 1.27, EDGE);
          ML.addBox(interpole, 0.6, 0.54, 0.03, brass, -0.15, 0, sign * 1.13, { castShadow: false });
        } else {
          ML.addBox(interpole, 0.62, 0.56, 0.5, steel, -0.15, 0, sign * 1.13, EDGE);
          ML.addBox(interpole, 0.74, 0.68, 0.14, castIron, -0.15, 0, sign * 0.90, EDGE);
          [-0.13, 0, 0.13].forEach((dz) => {
            const coil = new THREE.Group();
            coil.position.set(-0.15, 0, sign * (1.13 + dz));
            coil.scale.set(1.06, 0.96, 1);
            const torus = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.075, 7, 26), copper);
            torus.castShadow = true;
            coil.add(torus);
            interpole.add(coil);
          });
        }
      }
      buildInterpole(-1, false);
      buildInterpole(1, true);

      /* ---------- 04 电枢铁心（随转子旋转） ---------- */
      const armatureCore = new THREE.Group();
      groups.armatureCore = armatureCore;
      root.add(armatureCore);
      ML.addCylinder(armatureCore, CORE_R, CORE_R, CORE_LEN, 44, ironCore, CORE_X, 0, 0, 'x', { edges: false });
      for (let i = 0; i < 11; i += 1) {
        ML.addTorus(armatureCore, CORE_R * 0.995, 0.0085, ironDark, CORE_X - 1.25 + i * 0.25, 0, 0, [0, Math.PI / 2, 0], 4, 44);
      }
      for (let i = 0; i < 18; i += 1) {
        const a = i / 18 * Math.PI * 2;
        ML.addBox(armatureCore, CORE_LEN * 0.94, 0.05, 0.13, ironDark, CORE_X, Math.cos(a + Math.PI / 18) * 0.79, Math.sin(a + Math.PI / 18) * 0.79, {
          rotation: [a + Math.PI / 18, 0, 0], castShadow: false
        });
      }
      /* 电枢压圈 */
      [CORE_X - CORE_LEN / 2 - 0.03, CORE_X + CORE_LEN / 2 + 0.03].forEach((x) => {
        ML.addCylinder(armatureCore, CORE_R * 0.92, CORE_R * 0.92, 0.07, 32, darkSteel, x, 0, 0, 'x', { edges: false });
      });

      /* ---------- 05 电枢绕组（随转子旋转） ---------- */
      const armatureWinding = new THREE.Group();
      groups.armatureWinding = armatureWinding;
      root.add(armatureWinding);
      for (let i = 0; i < 18; i += 1) {
        const a = i / 18 * Math.PI * 2;
        ML.addBox(armatureWinding, CORE_LEN * 0.9, 0.075, 0.105, copperBright, CORE_X, Math.cos(a) * 0.815, Math.sin(a) * 0.815, {
          rotation: [a, 0, 0], castShadow: false
        });
      }
      [CORE_X - CORE_LEN / 2 - 0.1, CORE_X + CORE_LEN / 2 + 0.1].forEach((x) => {
        ML.addTorus(armatureWinding, 0.58, 0.1, copper, x, 0, 0, [0, Math.PI / 2, 0], 8, 34);
      });
      /* 绕组端部与换向片的连接线 */
      for (let i = 0; i < 18; i += 1) {
        const a = i / 18 * Math.PI * 2;
        ML.addTube(armatureWinding, [
          [CORE_X + CORE_LEN / 2 + 0.02, Math.cos(a) * 0.7, Math.sin(a) * 0.7],
          [1.24, Math.cos(a) * 0.64, Math.sin(a) * 0.64],
          [1.46, Math.cos(a) * 0.52, Math.sin(a) * 0.52]
        ], 0.026, copperBright, { tubularSegments: 4, radialSegments: 5 });
      }

      /* ---------- 06 换向器（随转子旋转） ---------- */
      const commutator = new THREE.Group();
      groups.commutator = commutator;
      root.add(commutator);
      ML.addCylinder(commutator, COMM_R - 0.09, COMM_R - 0.09, COMM_LEN, 28, ironDark, COMM_X, 0, 0, 'x', { edges: false });
      for (let i = 0; i < 24; i += 1) {
        const a = i / 24 * Math.PI * 2;
        ML.addBox(commutator, COMM_LEN, 0.11, 0.1, i % 2 ? copper : copperBright, COMM_X, Math.cos(a) * (COMM_R - 0.05), Math.sin(a) * (COMM_R - 0.05), {
          rotation: [a, 0, 0], castShadow: false
        });
      }
      [COMM_X - COMM_LEN / 2 - 0.012, COMM_X + COMM_LEN / 2 + 0.012].forEach((x) => {
        ML.addTorus(commutator, COMM_R - 0.01, 0.022, copperDark, x, 0, 0, [0, Math.PI / 2, 0], 6, 30);
      });
      ML.addCylinder(commutator, 0.2, 0.2, 0.12, 18, brass, COMM_X + COMM_LEN / 2 + 0.08, 0, 0, 'x', { edges: false });

      /* ---------- 07 电刷与刷架（静止） ---------- */
      const brushes = new THREE.Group();
      groups.brushes = brushes;
      root.add(brushes);
      ML.addTorus(brushes, 0.9, 0.045, brass, COMM_X, 0, 0, [0, Math.PI / 2, 0], 6, 36);
      ML.addTube(brushes, [[1.3, 1.3, 0], [1.55, 1.08, 0], [COMM_X, 0.95, 0]], 0.035, steel, { tubularSegments: 8, radialSegments: 6 });

      function addBrush(angle) {
        const g = new THREE.Group();
        g.position.set(COMM_X, 0, 0);
        g.rotation.x = angle;
        ML.addBox(g, 0.26, 0.18, 0.12, polymer, 0, 0.61, 0, { castShadow: false });
        ML.addBox(g, 0.32, 0.3, 0.2, darkSteel, 0, 0.84, 0, EDGE);
        ML.addBox(g, 0.34, 0.06, 0.22, insulation, 0, 1.0, 0, { castShadow: false });
        ML.addCylinder(g, 0.03, 0.03, 0.12, 8, brass, 0, 0.72, 0, 'y');
        ML.addTube(g, [[0.0, 0.9, 0.1], [0.0, 0.98, 0.14], [0.0, 1.02, 0.06]], 0.016, copper, { tubularSegments: 5, radialSegments: 5 });
        brushes.add(g);
      }
      addBrush(0);
      addBrush(Math.PI);
      ML.addBox(brushes, 0.3, 0.1, 0.22, insulation, COMM_X, 1.06, 0, { castShadow: false });
      ML.addTube(brushes, [[COMM_X, 1.06, 0.02], [1.62, 1.35, 0.08], [0.9, 1.68, 0.12], [0.1, 1.85, 0.14], [-0.42, 1.93, 0.14]], 0.022, insulation, { tubularSegments: 14, radialSegments: 5 });

      /* 换向火花（电刷与换向器接触处，亮度随电流变化） */
      const sparkMaterial = ML.makeBasic(0xffb066, 0, { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const sparks = [];
      [0.55, -0.55].forEach((y) => {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), sparkMaterial);
        spark.position.set(COMM_X, y, 0);
        spark.renderOrder = 8;
        brushes.add(spark);
        sparks.push(spark);
      });

      /* ---------- 08 前后端盖（静止） ---------- */
      const endShield = new THREE.Group();
      groups.endShield = endShield;
      root.add(endShield);

      function addEndShield(x, front) {
        const plate = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.48, 46), front ? shieldMat : shieldMatDark);
        plate.rotation.y = Math.PI / 2;
        plate.position.x = x;
        plate.castShadow = true;
        plate.receiveShadow = true;
        endShield.add(plate);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.16, 46, 1, true), shieldMatDark);
        band.rotation.z = Math.PI / 2;
        band.position.x = x;
        band.castShadow = true;
        endShield.add(band);
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 28, 1, true), shieldMat);
        boss.rotation.z = Math.PI / 2;
        boss.position.x = x;
        boss.castShadow = true;
        endShield.add(boss);
        ML.addTorus(endShield, 0.24, 0.055, brass, x, 0, 0, [0, Math.PI / 2, 0], 6, 22);
        for (let i = 0; i < 8; i += 1) {
          const a = i / 8 * Math.PI * 2;
          ML.addBolt(endShield, x + (front ? 0.09 : -0.09), Math.cos(a) * 1.3, Math.sin(a) * 1.3, 'x', steel, 0.045, 0.1);
        }
      }
      addEndShield(1.3, true);
      addEndShield(-1.68, false);

      /* ---------- 09 转轴（随转子旋转） ---------- */
      const shaft = new THREE.Group();
      groups.shaft = shaft;
      root.add(shaft);
      ML.addCylinder(shaft, SHAFT_R, SHAFT_R, 4.3, 24, steel, 0.15, 0, 0, 'x', { edges: false });
      ML.addCylinder(shaft, 0.13, 0.13, 0.4, 16, darkSteel, -1.95, 0, 0, 'x', { edges: false });
      ML.addCylinder(shaft, 0.13, 0.13, 0.5, 16, darkSteel, 2.15, 0, 0, 'x', { edges: false });
      ML.addCylinder(shaft, 0.3, 0.3, 0.14, 20, castIron, 2.24, 0, 0, 'x', EDGE);
      ML.addBox(shaft, 0.3, 0.06, 0.07, brass, 2.12, 0.14, 0, { castShadow: false });
      [-1.42, 1.42].forEach((x) => {
        ML.addTorus(shaft, 0.2, 0.04, brass, x, 0, 0, [0, Math.PI / 2, 0], 6, 20);
      });

      /* 轴伸风扇：跟随转轴旋转，给“电机在转”一个明显的视觉参照。 */
      const shaftFan = new THREE.Group();
      shaftFan.position.set(2.72, 0, 0);
      ML.addCylinder(shaftFan, 0.1, 0.1, 0.12, 14, darkSteel, 0, 0, 0, 'x', { castShadow: false });
      for (let i = 0; i < 5; i += 1) {
        const a = i / 5 * Math.PI * 2;
        const blade = ML.addBox(shaftFan, 0.045, 0.44, 0.13, paintLight, 0, 0, 0, { castShadow: false });
        blade.position.set(0, Math.cos(a) * 0.23, Math.sin(a) * 0.23);
        blade.rotation.x = a;
      }
      ML.addTorus(shaftFan, 0.42, 0.022, brass, 0, 0, 0, [0, Math.PI / 2, 0], 6, 22);
      shaft.add(shaftFan);

      /* ---------- 10 接线盒（静止） ---------- */
      const terminalBox = new THREE.Group();
      groups.terminalBox = terminalBox;
      root.add(terminalBox);
      ML.addBox(terminalBox, 0.5, 0.26, 0.4, paintLight, -0.75, 1.66, 0, EDGE);
      ML.addBox(terminalBox, 0.78, 0.32, 0.6, paint, -0.75, 1.98, 0, EDGE);
      ML.addBox(terminalBox, 0.84, 0.05, 0.66, paintLight, -0.75, 2.16, 0, EDGE);
      [-0.3, 0, 0.3].forEach((dx) => {
        ML.addCylinder(terminalBox, 0.07, 0.07, 0.12, 12, brass, -0.75 + dx, 2.24, 0.06, 'y');
      });
      [-0.18, 0.18].forEach((dx) => {
        ML.addCylinder(terminalBox, 0.045, 0.045, 0.1, 10, brass, -0.75 + dx, 2.24, -0.19, 'y');
      });
      ML.addTextPlane(terminalBox, 'DC MOTOR · 220 V', [-0.75, 1.98, 0.305], 0.66, 0.14, {
        color: 'rgba(214,244,255,0.88)', fontPx: 44, opacity: 0.94
      });

      /* ---------- 主磁场叠加层（F 键显示/隐藏） ---------- */
      const fieldGroup = new THREE.Group();
      root.add(fieldGroup);
      const fieldMaterials = [];
      /* 主磁通穿过电枢向下，经机座两侧返回；箭线放在剖切窗口内，避免被模型遮挡。 */
      fieldMaterials.push(addFluxArrow(fieldGroup, [-0.55, 1.1, 0.95], [-0.55, -1.1, 0.95], 0x57dcff));
      fieldMaterials.push(addFluxArrow(fieldGroup, [0.45, 1.1, 0.95], [0.45, -1.1, 0.95], 0x57dcff));
      fieldMaterials.push(addFluxArrow(fieldGroup, [-1.15, -1.0, 0.95], [-1.15, 1.0, 0.95], 0x4fb6d8));
      fieldMaterials.push(addFluxArrow(fieldGroup, [1.05, -1.0, 0.95], [1.05, 1.0, 0.95], 0x4fb6d8));

      return {
        root: root,
        groups: groups,
        extras: {
          fieldGroup: fieldGroup,
          fieldMaterials: fieldMaterials,
          sparks: sparks
        }
      };
    },
    knowledge: [
      {
        id: 'commutation', kicker: '01 / COMMUTATION', title: '换向与电刷',
        lead: '换向器与电刷是直流电机独有的机械整流装置。转子旋转时，绕组元件从一个支路换到另一个支路，元件中的电流必须反向，这个过程就叫换向。',
        html: `
          <div class="topic-section"><h4>换向器怎样工作</h4><p>换向片随电枢旋转，静止的电刷依次与不同的换向片接触。每个绕组元件经过电刷下方时，电流从 +Ia 变为 −Ia；正是这种“机械式逆变”，让外部直流在电枢内部变成交变电流，从而产生方向稳定的电磁转矩。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>COMMUTATION PERIOD</span><strong>T<em>c</em> = 60 / (2p · n)</strong></div>
            <div class="formula-card"><span>BRUSH CURRENT</span><strong>I<em>brush</em> = 2 I<em>a</em> / (2p)</strong></div>
            <div class="formula-card"><span>INDUCTIVE EMF</span><strong>e<em>L</em> = −L dI/dt</strong></div>
            <div class="formula-card"><span>INTERPOLE EMF</span><strong>e<em>k</em> ≈ −e<em>L</em></strong></div>
          </div>
          <div class="topic-section"><h4>火花从哪里来</h4><p>换向元件是电感，电流不能瞬间反向，自感电动势会阻碍换向。换向极（本模型的小磁极）与电枢串联，在换向区建立抵消电枢反应的磁场，把换向电动势补偿掉，从而减小电刷下的火花。</p></div>
          <div class="callout"><b>观察</b><p>运行时把电枢电压调高、负载加大，换向器与电刷接触处的火花会变亮；实际电机中的火花会烧蚀换向片与电刷，所以需要定期维护。</p></div>
          <div class="knowledge-actions">
            <button type="button" data-knowledge-action="field">显示主磁场</button>
            <button type="button" data-knowledge-action="explode">剖解结构观察电刷</button>
          </div>
        `
      },
      {
        id: 'equations', kicker: '02 / EMF & TORQUE', title: '电动势与转矩公式',
        lead: '直流电机把电枢电流与主磁通的乘积转换为转矩，同时旋转的电枢又会产生反电动势。这两条公式是整个直流电机分析的起点。',
        html: `
          <div class="topic-section"><h4>反电动势</h4><p>电枢在磁场中旋转，导体切割磁通产生感应电动势。反电动势的方向总是与电枢电压相反，因此电枢电流由电压差决定。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>BACK EMF</span><strong>E = K<em>e</em> Φ n = K<em>e</em>′ Φ ω</strong></div>
            <div class="formula-card"><span>TORQUE</span><strong>T = K<em>t</em> Φ I<em>a</em></strong></div>
            <div class="formula-card"><span>ARMATURE CURRENT</span><strong>I<em>a</em> = (U − E) / R<em>a</em></strong></div>
            <div class="formula-card"><span>ELECTROMAGNETIC POWER</span><strong>P<em>em</em> = E I<em>a</em> = T ω</strong></div>
          </div>
          <div class="topic-section"><h4>磁路饱和</h4><p>励磁电流增大时，磁通随之增大，但铁心逐渐饱和，磁通增长越来越慢。本模型用 Φ = Φ<em>r</em> + Φ<em>0</em>·tanh(I<em>f</em>/I<em>f0</em>) 描述这一趋势，所以继续增大励磁电流，转速与转矩的收益会明显下降。</p></div>
          <div class="callout"><b>注意</b><p>稳态时电磁转矩 T 与负载转矩加摩擦转矩平衡。看右侧“机械特性”曲线的当前工作点，它总是落在当前电压、励磁对应的 n–T 曲线上。</p></div>
          <div class="knowledge-actions">
            <button type="button" data-knowledge-action="run">运行并观察 E 与 T</button>
          </div>
        `
      },
      {
        id: 'starting', kicker: '03 / START & SPEED', title: '启动与调速',
        lead: '启动瞬间转速为零、反电动势为零，电枢电流只由电阻限制，因此直接启动会产生很大的电流冲击；这也是直流电机必须考虑启动方式的原因。',
        html: `
          <div class="topic-section"><h4>启动电流冲击</h4><p>合闸瞬间 E = 0，I<em>a</em> = U / R<em>a</em>。本教学样机 220 V、0.6 Ω，直接启动电流可达数百安，是额定电流的几十倍。随着转速建立、反电动势上升，电流会快速回落到负载对应值。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>STARTING CURRENT</span><strong>I<em>st</em> = U / R<em>a</em></strong></div>
            <div class="formula-card"><span>STARTING TORQUE</span><strong>T<em>st</em> = K<em>t</em> Φ I<em>st</em></strong></div>
            <div class="formula-card"><span>SPEED EQUATION</span><strong>n = (U − I<em>a</em>R<em>a</em>) / (K<em>e</em>′ Φ)</strong></div>
            <div class="formula-card"><span>MECHANICS</span><strong>J dω/dt = T − T<em>L</em> − Bω</strong></div>
          </div>
          <div class="topic-section"><h4>三种调速方式</h4><p><b>调压调速</b>：改变电枢电压，机械特性平行移动，可实现宽范围无级调速，是直流电机最常用的方式。<b>调磁调速</b>：减小励磁电流使磁通下降，转速升高，属于恒功率调速。<b>电枢串电阻</b>：特性变软、有级调速，损耗较大。</p></div>
          <div class="callout"><b>实验</b><p>把电压从 440 V 调到 0，观察电流从正向冲击逐渐变为反向制动电流；把励磁电流调到 0.2 A 以下，会看到“弱磁升速”甚至触发转速限制提示。</p></div>
          <div class="knowledge-actions">
            <button type="button" data-knowledge-action="run">运行启动过程</button>
            <button type="button" data-knowledge-action="explode">剖解观察电枢</button>
          </div>
        `
      },
      {
        id: 'characteristic', kicker: '04 / CHARACTERISTIC', title: '机械特性',
        lead: '机械特性描述稳态转速与电磁转矩（或负载）之间的关系。他励直流电机的机械特性接近一条略向下倾斜的直线，属于“硬特性”。',
        html: `
          <div class="topic-section"><h4>特性方程</h4><p>把 I<em>a</em> = T / (K<em>t</em>Φ) 代入转速公式，就得到机械特性方程。斜率由电枢电阻和磁通决定：电阻越大、磁通越小，特性越软。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>MECHANICAL CHARACTERISTIC</span><strong>n = U / (K<em>e</em>′Φ) − R<em>a</em> T / (K<em>e</em>′K<em>t</em>Φ²)</strong></div>
            <div class="formula-card"><span>NO-LOAD SPEED</span><strong>n<em>0</em> ≈ U / (K<em>e</em>′Φ)</strong></div>
            <div class="formula-card"><span>STALL TORQUE</span><strong>T<em>k</em> = K<em>t</em> Φ U / R<em>a</em></strong></div>
            <div class="formula-card"><span>SPEED REGULATION</span><strong>Δn% = (n<em>0</em> − n<em>N</em>) / n<em>N</em> × 100%</strong></div>
          </div>
          <div class="topic-section"><h4>曲线怎么读</h4><p>机械特性图上，青色实线是当前电压与励磁下的 n–T 曲线，虚线是额定 220 V 的参考曲线。黄色竖线标出当前负载转矩，青色圆点就是当前工作点。负载转矩增大，工作点沿曲线向右下移动：转速略降、电流与转矩增大。</p></div>
          <div class="callout"><b>风险</b><p>励磁回路不能开路。磁通接近剩磁时，反电动势很小，转速会急剧上升（飞车），电枢电流也会过大。所以运行中要保证励磁可靠。</p></div>
          <div class="knowledge-actions">
            <button type="button" data-knowledge-action="field">显示主磁场方向</button>
            <button type="button" data-knowledge-action="reset">重置视角</button>
          </div>
        `
      }
    ]
  });

  /* ---------------- 曲线 ---------------- */

  function chartFrame(ctx, w, h, pad) {
    const box = ML.Charts.frame(w, h, pad || { left: 42, right: 16, top: 22, bottom: 30 });
    ML.Charts.grid(ctx, box, 6, 4);
    ML.Charts.border(ctx, box);
    return box;
  }

  function drawMechanicalChart(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const box = chartFrame(ctx, w, h);
    const U = inputs.armatureVoltage;
    const If = inputs.fieldCurrent;
    const TL = inputs.loadTorque;
    const phi = fluxOf(If);
    const k = Math.max(0.02, Kt * phi);
    const kE = Math.max(0.02, Ke * phi);
    const Tmax = ML.clamp(Math.max(45, TL * 1.5), 45, 160);
    const nNL = rpmOf(Math.max(0, U) / kE);
    const nMax = ML.clamp(Math.max(1200, nNL * 1.08, Math.abs(rpmOf(state.omega)) * 1.2), 600, 4200);
    const frame = C.frameFor(box, 0, Tmax, 0, nMax);
    const clampY = (value) => Math.max(box.top, Math.min(box.bottom, frame.y(value)));

    if (Math.abs(U - RATED_U) > 4) {
      const ghost = [];
      for (let T = 0; T <= Tmax; T += Tmax / 90) {
        const n = rpmOf((RATED_U - Ra * T / k) / kE);
        if (n < 0) break;
        ghost.push([frame.x(T), clampY(n)]);
      }
      C.line(ctx, ghost, 'rgba(125,166,185,0.42)', 1.2, { glow: 2, dash: [3, 4] });
    }

    const points = [];
    for (let T = 0; T <= Tmax; T += Tmax / 90) {
      const n = rpmOf((U - Ra * T / k) / kE);
      if (n < 0) break;
      points.push([frame.x(T), clampY(n)]);
    }
    C.line(ctx, points, C.colors.cyan, 1.8, { glow: 6 });

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,198,107,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frame.x(TL), box.top);
    ctx.lineTo(frame.x(TL), box.bottom);
    ctx.stroke();
    ctx.restore();
    C.label(ctx, 'TL', frame.x(TL) + 4, box.top + 10, { color: '#ffc66b', size: 8 });

    const pT = ML.clamp(state.torque, 0, Tmax);
    const pn = ML.clamp(rpmOf(state.omega), 0, nMax);
    C.dot(ctx, frame.x(pT), frame.y(pn), C.colors.cyan, 3.6);
    C.label(ctx, '工作点', frame.x(pT) + 8, frame.y(pn) - 7, { color: C.colors.cyan, size: 8 });

    C.axisTicks(ctx, frame, { xTicks: 5, yTicks: 4, xDigits: 0, yDigits: 0, xUnit: 'T / N·m', yUnit: 'n / rpm' });
    C.label(ctx, 'U ' + U.toFixed(0) + ' V · Φ ' + phi.toFixed(2), box.right, box.top - 7, {
      align: 'right', size: 8, color: 'rgba(150,205,225,0.85)'
    });
  }

  function drawCurrentChart(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const box = chartFrame(ctx, w, h);
    const U = inputs.armatureVoltage;
    const If = inputs.fieldCurrent;
    const TL = inputs.loadTorque;
    const TAxis = 40;
    const top = steadyState(U, If, TAxis);
    const yMax = ML.clamp(Math.max(top.ia * 1.18, 12), 12, 260);
    const frame = C.frameFor(box, 0, TAxis, 0, yMax);
    const clampY = (value) => Math.max(box.top, Math.min(box.bottom, frame.y(value)));

    const points = [];
    for (let t = 0; t <= TAxis; t += 0.5) {
      const s = steadyState(U, If, t);
      points.push([frame.x(t), clampY(s.ia)]);
    }
    C.line(ctx, points, C.colors.amber, 1.8, { glow: 5 });
    C.axisTicks(ctx, frame, { xTicks: 4, yTicks: 4, xDigits: 0, yDigits: 1, xUnit: 'TL / N·m', yUnit: 'Ia / A' });

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,198,107,0.36)';
    ctx.beginPath();
    ctx.moveTo(frame.x(TL), box.top);
    ctx.lineTo(frame.x(TL), box.bottom);
    ctx.stroke();
    ctx.restore();

    const py = clampY(state.ia);
    C.dot(ctx, frame.x(TL), py, C.colors.amber, 3.6);
    C.label(ctx, 'Ia ' + state.ia.toFixed(1) + ' A', frame.x(TL) + 8, py - 7, { color: C.colors.amber, size: 8 });
    C.label(ctx, 'U ' + U.toFixed(0) + ' V · If ' + If.toFixed(2) + ' A', box.right, box.top - 7, {
      align: 'right', size: 8, color: 'rgba(150,205,225,0.85)'
    });
  }

  function drawEfficiencyChart(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const box = chartFrame(ctx, w, h);
    const U = inputs.armatureVoltage;
    const If = inputs.fieldCurrent;
    const TL = inputs.loadTorque;
    const frame = C.frameFor(box, 0, 40, 0, 100);
    const points = [];
    let peak = { eta: 0, TL: 0 };
    for (let t = 0; t <= 40; t += 0.5) {
      const s = steadyState(U, If, t);
      if (s.eta > peak.eta) peak = { eta: s.eta, TL: t };
      points.push([frame.x(t), frame.y(s.eta)]);
    }
    C.line(ctx, points, C.colors.mint, 1.8, { glow: 5 });
    C.axisTicks(ctx, frame, { xTicks: 4, yTicks: 4, xDigits: 0, yDigits: 0, xUnit: 'TL / N·m', yUnit: 'η / %' });

    const p1 = U * state.ia + UF * If;
    const p2 = TL * state.omega;
    const eta = p1 > 1 ? ML.clamp(p2 / p1 * 100, 0, 100) : 0;
    C.dot(ctx, frame.x(TL), frame.y(eta), C.colors.mint, 3.6);
    C.label(ctx, 'η ' + eta.toFixed(1) + '%', frame.x(TL) + 8, Math.max(box.top + 9, frame.y(eta) - 7), {
      color: C.colors.mint, size: 8
    });
    if (peak.eta > 1) {
      C.dot(ctx, frame.x(peak.TL), frame.y(peak.eta), 'rgba(180,155,255,0.9)', 2.4);
      C.label(ctx, '峰值 ' + peak.TL.toFixed(0) + ' N·m', frame.x(peak.TL) + 6, frame.y(peak.eta) + 12, {
        color: 'rgba(180,155,255,0.85)', size: 7.5
      });
    }
    C.label(ctx, 'U ' + U.toFixed(0) + ' V · If ' + If.toFixed(2) + ' A', box.right, box.top - 7, {
      align: 'right', size: 8, color: 'rgba(150,205,225,0.85)'
    });
  }
})(window);
