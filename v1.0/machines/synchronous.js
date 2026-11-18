/* 三相同步电机 — 凸极转子 / 励磁绕组 / 滑环与电刷的剖切教学模型。 */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  const ACCENT = '#b49bff';
  const CYAN = '#57dcff';
  const AMBER = '#ffc66b';
  const MINT = '#66e6c2';
  const ROSE = '#ff7e9b';

  /* 教学样机：4 kW 级、400 V、50 Hz、p=2。 */
  const F_HZ = 50;
  const POLE_PAIRS = 2;
  const POLES = 4;
  const N_SYNC = 120 * F_HZ / POLES;          // 1500 rpm
  const OMEGA_SYNC = N_SYNC * Math.PI / 30;   // 157.08 rad/s
  const S_BASE = 5000;                        // VA（视在功率基准）
  const V_PHASE_BASE = 230;                   // V（每相电压基准）
  const I_BASE = S_BASE / (3 * V_PHASE_BASE); // 7.246 A
  const T_BASE = S_BASE / OMEGA_SYNC;         // 31.83 N·m
  const XS_PU = 0.9;                          // 同步电抗（标幺）
  const IF_RATED = 1.2;                       // 额定励磁电流 A（对应 E₀=1.0 p.u.）
  const R_S_PU = 0.05;                        // 定子电阻（标幺）
  const P_IRON_PU = 0.02;                     // 铁耗
  const P_MECH_PU = 0.02;                     // 机械损耗
  const SLOW_MO = 0.06;
  const TWO_PI = Math.PI * 2;
  const CUT_START_DEG = 78;                   // 剖切窗口：+X 方向开口 156°
  const CUT_END_DEG = 282;

  /* ---------------- 几何辅助 ---------------- */

  function addSector(parent, inner, outer, startDeg, endDeg, depth, material, opts) {
    const o = opts || {};
    const geo = ML.createSectorGeometry(
      inner, outer,
      ML.degToRad(startDeg), ML.degToRad(endDeg),
      depth,
      {
        bevelSize: o.bevel === undefined ? 0.004 : o.bevel,
        bevelThickness: 0.004,
        curveSegments: o.curveSegments || 26
      }
    );
    return ML.addMesh(parent, geo, material, [o.x || 0, o.y || 0, o.z || 0], {
      edges: !!o.edges,
      edgeColor: o.edgeColor === undefined ? 0x8d7fbc : o.edgeColor,
      edgeOpacity: o.edgeOpacity === undefined ? 0.14 : o.edgeOpacity,
      castShadow: o.castShadow !== false,
      receiveShadow: true
    });
  }

  function addFieldArrow(parent, from, to, color, opacity) {
    const start = new THREE.Vector3(from[0], from[1], from[2]);
    const end = new THREE.Vector3(to[0], to[1], to[2]);
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 0.03) return null;
    const unit = dir.clone().normalize();
    const mat = ML.makeBasic(color, opacity === undefined ? 0.82 : opacity, {
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const shaftLen = Math.max(0.02, len - 0.12);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, shaftLen, 6), mat);
    shaft.position.copy(start).addScaledVector(unit, shaftLen / 2 + 0.02);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
    parent.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.14, 8), mat);
    head.position.copy(end).addScaledVector(unit, -0.06);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
    parent.add(head);
    return mat;
  }

  /* ---------------- 同步电机稳态模型 ---------------- */

  function currentAt(V, E, delta) {
    const ir = E * Math.sin(delta) / XS_PU;
    const ii = -(V - E * Math.cos(delta)) / XS_PU;
    return { ir: ir, ii: ii, iPu: Math.sqrt(ir * ir + ii * ii) };
  }

  function computeOperatingPoint(inputs) {
    const V = ML.clamp(Number(inputs.gridVoltage) || 1, 0.5, 1.4);
    const If = ML.clamp(Number(inputs.fieldCurrent) || 0, 0, 3);
    const torque = ML.clamp(Number(inputs.loadTorque) || 0, -60, 60);
    const E = Math.max(0.012, If / IF_RATED);
    const Ppu = torque * OMEGA_SYNC / S_BASE;
    const Pmax = Math.max(0.002, E * V / XS_PU);
    const synced = Math.abs(Ppu) <= Pmax * 0.995;
    const delta = synced
      ? Math.asin(ML.clamp(Ppu * XS_PU / (E * V), -0.9999, 0.9999))
      : (Ppu >= 0 ? Math.PI / 2 : -Math.PI / 2);
    const cur = currentAt(V, E, delta);
    const iPu = synced ? cur.iPu : ML.clamp(1.5 + 0.55 * Math.max(0, Math.abs(Ppu) - Pmax), 1.5, 2.45);
    const pf = synced ? (cur.iPu > 1e-6 ? Math.abs(cur.ir) / cur.iPu : 1) : 0.32;
    const pShaft = Ppu * S_BASE;
    const pCu = iPu * iPu * R_S_PU * S_BASE;
    const pFe = P_IRON_PU * S_BASE;
    const pMechLoss = P_MECH_PU * S_BASE;
    let eta = 0;
    if (synced) {
      if (pShaft >= 0) {
        const pIn = pShaft + pMechLoss + pCu + pFe;
        eta = pIn > 1 ? ML.clamp(pShaft / pIn, 0, 1) : 0;
      } else {
        const pIn = -pShaft + pMechLoss;
        const pOutE = -pShaft - pCu - pFe;
        eta = pIn > 1 ? ML.clamp(Math.max(0, pOutE) / pIn, 0, 1) : 0;
      }
    }
    const qPu = V * (V - E * Math.cos(delta)) / XS_PU;
    return {
      V: V, If: If, torque: torque, E: E,
      Ppu: Ppu, Pmax: Pmax, synced: synced,
      delta: delta, deltaDeg: ML.radToDeg(delta),
      iPu: iPu, iAmps: iPu * I_BASE,
      pf: pf, leading: cur.ii > 1e-6,
      pShaft: pShaft, pCu: pCu, pFe: pFe, pMechLoss: pMechLoss, eta: eta,
      qPu: qPu, torqueMax: Pmax * T_BASE,
      EVolts: E * V_PHASE_BASE
    };
  }

  function evaluate(state, inputs) {
    const op = computeOperatingPoint(inputs);
    const synced = op.synced;
    let iPu = op.iPu;
    let pf = op.pf;
    let leading = op.leading;
    if (synced) {
      const cur = currentAt(op.V, op.E, ML.degToRad(state.deltaDeg));
      iPu = cur.iPu;
      pf = cur.iPu > 1e-6 ? Math.abs(cur.ir) / cur.iPu : 1;
      leading = cur.ii > 1e-6;
    }
    const deltaDeg = synced ? state.deltaDeg : (op.Ppu >= 0 ? 90 : -90);
    const pCu = iPu * iPu * R_S_PU * S_BASE;
    const pFe = P_IRON_PU * S_BASE;
    const pMechLoss = P_MECH_PU * S_BASE;
    let eta = 0;
    if (synced) {
      if (op.pShaft >= 0) {
        const pIn = op.pShaft + pMechLoss + pCu + pFe;
        eta = pIn > 1 ? ML.clamp(op.pShaft / pIn, 0, 1) : 0;
      } else {
        const pIn = -op.pShaft + pMechLoss;
        const pOutE = -op.pShaft - pCu - pFe;
        eta = pIn > 1 ? ML.clamp(Math.max(0, pOutE) / pIn, 0, 1) : 0;
      }
    }
    return {
      op: op,
      V: op.V, If: op.If, torque: op.torque, E: op.E,
      Ppu: op.Ppu, Pmax: op.Pmax, torqueMax: op.torqueMax, EVolts: op.EVolts,
      synced: synced, deltaDeg: deltaDeg,
      iPu: iPu, iAmps: iPu * I_BASE, pf: pf, leading: leading,
      pShaft: op.pShaft, qPu: op.qPu, eta: eta,
      speed: state.speed
    };
  }

  function vCurvePoints(torque, V) {
    const pts = [];
    const Ppu = torque * OMEGA_SYNC / S_BASE;
    for (let i = 0; i <= 60; i += 1) {
      const ifA = i * 0.05;
      const E = Math.max(0.012, ifA / IF_RATED);
      const Pmax = E * V / XS_PU;
      if (Math.abs(Ppu) > Pmax * 0.995) continue;
      const delta = Math.asin(ML.clamp(Ppu * XS_PU / (E * V), -0.9999, 0.9999));
      const cur = currentAt(V, E, delta);
      pts.push([ifA, cur.iPu * I_BASE]);
    }
    return pts;
  }

  function applyVisual(state, visual) {
    if (!visual) return;
    const groups = visual.groups || {};
    const angle = state.rotorAngle;
    const rotating = ['rotor', 'fieldWinding', 'damperWinding', 'shaft'];
    for (let i = 0; i < rotating.length; i += 1) {
      const group = groups[rotating[i]];
      if (group) group.rotation.z = angle;
    }
    const extras = visual.extras || {};
    if (extras.armatureField) extras.armatureField.rotation.z = state.fieldAngle;
    if (extras.rotorField) extras.rotorField.rotation.z = angle;
  }

  /* ---------------- 曲线绘制 ---------------- */

  function drawPowerAngle(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const ev = evaluate(state, inputs);
    const box = C.frame(w, h, { left: 40, right: 12, top: 18, bottom: 26 });
    const amp = Math.max(6, Math.abs(ev.E * ev.V / XS_PU) * S_BASE / 1000 * 1.35);
    const frame = C.frameFor(box, -180, 180, -amp, amp);
    C.grid(ctx, box, 6, 4);
    C.border(ctx, box);
    C.axisTicks(ctx, frame, {
      xTicks: 6, yTicks: 4, yDigits: 0, size: 7.5,
      xFormat: function (v) { return v.toFixed(0) + '°'; },
      xUnit: '功角 δ', yUnit: 'P kW'
    });
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255, 126, 155, 0.42)';
    ctx.lineWidth = 1;
    [-90, 90].forEach(function (d) {
      const x = frame.x(d);
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.bottom);
      ctx.stroke();
    });
    ctx.restore();
    const refPts = [];
    for (let d = -180; d <= 180; d += 3) {
      refPts.push([
        frame.x(d),
        frame.y(ML.clamp((1 * ev.V / XS_PU) * Math.sin(ML.degToRad(d)) * S_BASE / 1000, -amp * 1.45, amp * 1.45))
      ]);
    }
    C.line(ctx, refPts, 'rgba(137, 168, 196, 0.42)', 1.1, { dash: [3, 4], glow: 0 });
    const pts = [];
    for (let d = -180; d <= 180; d += 2) {
      pts.push([frame.x(d), frame.y((ev.E * ev.V / XS_PU) * Math.sin(ML.degToRad(d)) * S_BASE / 1000)]);
    }
    C.line(ctx, pts, C.colors.violet, 1.7, { glow: 6 });
    const pKw = ev.pShaft / 1000;
    const px = frame.x(ML.clamp(ev.deltaDeg, -180, 180));
    const py = frame.y(ML.clamp(pKw, -amp * 1.35, amp * 1.35));
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(180, 155, 255, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, box.bottom);
    ctx.lineTo(px, py);
    ctx.lineTo(box.left, py);
    ctx.stroke();
    ctx.restore();
    C.dot(ctx, px, py, ev.synced ? C.colors.violet : C.colors.rose, 3.6);
    C.label(ctx, (ev.deltaDeg >= 0 ? '+' : '') + ev.deltaDeg.toFixed(1) + '°', px + 7, py - 8, { color: C.colors.violet, size: 8 });
    C.label(ctx, 'Pmax ' + ev.torqueMax.toFixed(0) + ' N·m', box.right - 4, box.top + 10, { align: 'right', color: 'rgba(180, 155, 255, 0.75)', size: 7.5 });
    C.label(ctx, '电动区', frame.x(46), frame.y(amp * 0.72), { color: 'rgba(125, 166, 185, 0.7)', size: 7.5 });
    C.label(ctx, '发电区', frame.x(-46), frame.y(-amp * 0.72), { align: 'right', color: 'rgba(125, 166, 185, 0.7)', size: 7.5 });
  }

  function drawVCurve(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const ev = evaluate(state, inputs);
    const box = C.frame(w, h, { left: 40, right: 12, top: 18, bottom: 26 });
    const frame = C.frameFor(box, 0, 3, 0, 16);
    C.grid(ctx, box, 6, 4);
    C.border(ctx, box);
    C.axisTicks(ctx, frame, { xTicks: 6, yTicks: 4, xDigits: 1, yDigits: 0, size: 7.5, xUnit: 'If A', yUnit: 'Ia A' });
    const loadList = [0, 8, 16, 24, 32];
    loadList.forEach(function (t, index) {
      const groupPts = vCurvePoints(t, ev.V);
      if (groupPts.length < 2) return;
      C.line(ctx, groupPts.map(function (p) {
        return [frame.x(p[0]), frame.y(ML.clamp(p[1], 0, 16))];
      }), 'rgba(124, 176, 214, ' + (0.2 + index * 0.08) + ')', 1.1, { glow: 0 });
    });
    const torque = ev.torque;
    const curvePts = vCurvePoints(torque, ev.V);
    const accent = torque < 0 ? C.colors.cyan : C.colors.violet;
    if (curvePts.length > 1) {
      C.line(ctx, curvePts.map(function (p) {
        return [frame.x(p[0]), frame.y(ML.clamp(p[1], 0, 16))];
      }), accent, 1.8, { glow: 6 });
    }
    const px = frame.x(ev.If);
    const py = frame.y(ML.clamp(ev.iAmps, 0, 16));
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(180, 155, 255, 0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, box.bottom);
    ctx.lineTo(px, py);
    ctx.lineTo(box.left, py);
    ctx.stroke();
    ctx.restore();
    C.dot(ctx, px, py, ev.synced ? accent : C.colors.rose, 3.6);
    C.label(ctx, 'Ia ' + ev.iAmps.toFixed(2) + ' A', px + 7, py - 7, { color: accent, size: 8 });
    C.legendDot(ctx, box.right - 98, box.bottom - 19, '#b49bff', '当前负载 ' + torque.toFixed(0) + ' N·m');
    C.legendDot(ctx, box.right - 98, box.bottom - 7, 'rgba(124, 176, 214, 0.8)', '负载曲线 0 / 8 / … / 32');
    if (ev.If > 2.2) C.label(ctx, '过励', px - 6, box.top + 10, { align: 'right', color: 'rgba(180, 155, 255, 0.7)', size: 7.5 });
    else if (ev.If < 0.8) C.label(ctx, '欠励', px + 6, box.top + 10, { color: 'rgba(255, 198, 107, 0.7)', size: 7.5 });
  }

  function drawEfficiency(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    const ev = evaluate(state, inputs);
    const box = C.frame(w, h, { left: 40, right: 14, top: 18, bottom: 26 });
    const frame = C.frameFor(box, -45, 45, 0, 100);
    C.grid(ctx, box, 6, 4);
    C.border(ctx, box);
    C.axisTicks(ctx, frame, { xTicks: 6, yTicks: 4, yDigits: 0, size: 7.5, xUnit: '负载转矩 N·m', yUnit: 'η %' });
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(137, 168, 196, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frame.x(0), box.top);
    ctx.lineTo(frame.x(0), box.bottom);
    ctx.stroke();
    ctx.restore();
    const motorPts = [];
    for (let t = 0; t <= 45; t += 1) {
      const p = computeOperatingPoint({ fieldCurrent: inputs.fieldCurrent, gridVoltage: inputs.gridVoltage, loadTorque: t });
      if (!p.synced) break;
      motorPts.push([frame.x(t), frame.y(p.eta * 100)]);
    }
    const genPts = [];
    for (let t = 0; t >= -45; t -= 1) {
      const p = computeOperatingPoint({ fieldCurrent: inputs.fieldCurrent, gridVoltage: inputs.gridVoltage, loadTorque: t });
      if (!p.synced) break;
      genPts.push([frame.x(t), frame.y(p.eta * 100)]);
    }
    if (motorPts.length > 1) C.line(ctx, motorPts, C.colors.violet, 1.7, { glow: 6 });
    if (genPts.length > 1) C.line(ctx, genPts, C.colors.cyan, 1.6, { glow: 5 });
    const px = frame.x(ML.clamp(ev.torque, -45, 45));
    const py = frame.y(ML.clamp(ev.eta * 100, 0, 100));
    C.dot(ctx, px, py, ev.synced ? C.colors.violet : C.colors.rose, 3.6);
    C.label(ctx, 'η ' + (ev.eta * 100).toFixed(1) + '%', px + 7, py - 7, { color: C.colors.violet, size: 8 });
    C.legendDot(ctx, box.right - 66, box.top + 10, '#b49bff', '电动');
    C.legendDot(ctx, box.right - 66, box.top + 22, '#57dcff', '发电');
  }

  /* ---------------- 机型定义 ---------------- */

  ML.registerMachine({
    id: 'synchronous',
    order: 4,
    title: '同步电机',
    en: 'SYNCHRONOUS MACHINE',
    cardEn: 'SALIENT-POLE SYNCHRONOUS MACHINE',
    accent: ACCENT,
    blurb: '凸极转子、励磁绕组与滑环电刷剖开呈现。调节励磁电流与负载转矩，观察功角、定子电流和 V 形曲线如何被“锁定”在同步转速上。',
    topics: ['同步转速', '励磁与功角', 'V 形曲线', '并网与失步'],
    structureTitle: '定子、凸极转子与滑环',
    structureNote: '剖切窗口露出定子铁心、三相绕组与凸极转子。励磁绕组套在磁极上，电流经滑环与电刷引入；转子后端还有一台同轴励磁机。',
    structureFoot: '4 kW · 400 V · 50 Hz · p=2 · 1500 rpm',
    consoleTitle: '运行控制',
    consoleKicker: '励磁与负载',
    consoleLead: '调节励磁电流、负载转矩与电网电压，观察功角、电流、功率因数与 V 形曲线。',
    consoleTag: 'SYNCHRONOUS / 50 Hz',
    stageMode: 'SYNCHRONOUS / CUTAWAY',
    fieldLabel: '旋转磁场',
    ctaSub: '动角 · V 形 · 失步',
    knowledgeMeta: 'SYNC SPEED / EXCITATION / V CURVE / STABILITY',
    viewDirection: [0.88, 0.32, 0.36],
    fitPadding: 1.05,
    explodePadding: 1.02,
    explodeDuration: 1050,
    legend: [
      { color: '#b49bff', label: '电枢磁场' },
      { color: '#ffc66b', label: '转子磁场' },
      { color: '#57dcff', label: '三相定子绕组' }
    ],
    cardArt: `
      <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" stroke-width="1.3">
        <circle cx="106" cy="120" r="84" stroke-dasharray="2 7" opacity=".22"/>
        <circle cx="106" cy="120" r="66" opacity=".5"/>
        <circle cx="106" cy="120" r="50" opacity=".32"/>
        <circle cx="106" cy="120" r="28" opacity=".9"/>
        <path d="M106 62v20M106 158v20M48 120h20M144 120h20" stroke-width="2.2" opacity=".85"/>
        <path d="M76 90l-9-9M136 150l9 9M136 90l9-9M76 150l-9 9" opacity=".35"/>
        <path d="M92 72h28M92 168h28M68 106v28M144 106v28" stroke-width="3.6" stroke-linecap="round" opacity=".8"/>
        <path d="M24 120h164" stroke-width="1.6" opacity=".65"/>
        <path d="M178 110v20M186 110v20M194 110v20" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
        <path d="M174 96h26M174 91v12M200 91v12" stroke-width="1.5" opacity=".8"/>
        <path d="M204 100v40" stroke-width="1.1" opacity=".4"/>
        <path d="M106 30v-10M106 210v-10" opacity=".35"/>
        <path d="M158 54l14-8M44 178l-14 8" opacity=".3"/>
      </svg>
    `,
    parts: [
      {
        id: 'frame', index: '01', name: '机座与端盖', en: 'FRAME & END SHIELDS', mass: 26.5,
        description: '灰铸铁机座支撑定子铁心并封闭磁路外侧，两端端盖内装轴承。顶部接线盒引出三相定子线，底部机脚与底座固定；+X 侧开剖切窗口，便于观察内部。',
        specs: [['材料', '灰铸铁 HT250'], ['结构', '机座 + 端盖'], ['防护', 'IP44 教学样机']],
        material: '铸铁 / 铸铝端盖', accent: '#8f9bb8', anchor: [1.07, 1.37, 0.8],
        explode: [1.9, 0.9, 0]
      },
      {
        id: 'statorCore', index: '02', name: '定子铁心', en: 'STATOR CORE', mass: 16.2,
        description: '0.5 mm 硅钢片叠压成定子铁心，内圆开槽放置三相绕组。槽与齿交替排列形成磁路，剖切后可以看到叠片与齿槽结构。',
        specs: [['材料', '0.5 mm 硅钢叠片'], ['槽数', '24'], ['内径', 'Ø204 mm']],
        material: '冷轧硅钢片', accent: '#57dcff', anchor: [0.65, 1.126, 0.5],
        explode: [0.3, 2.0, 0]
      },
      {
        id: 'statorWinding', index: '03', name: '三相定子绕组', en: '3-PHASE STATOR WINDING', mass: 5.6,
        description: '三相分布绕组嵌入定子槽中，通入三相对称电流后合成旋转磁场。端部绕组与引出线把电能送入或送出电枢。',
        specs: [['连接', 'Y 接'], ['导线', '铜圆线'], ['冷却', '自然风冷']],
        material: '铜导线 / B 级绝缘', accent: '#66e6c2', anchor: [0.51, -0.81, 0.6],
        explode: [0.1, 3.2, 0]
      },
      {
        id: 'rotor', index: '04', name: '凸极转子', en: 'SALIENT-POLE ROTOR', mass: 12.4,
        description: '转子铁心与四个凸出的磁极（p=2）。凸极结构使气隙不均匀，磁极上套有励磁绕组，磁极两端装阻尼绕组；转子按同步转速旋转。',
        specs: [['极数', '4（p=2）'], ['结构', '凸极'], ['材料', '转子钢 / 硅钢']],
        material: '铸钢磁极 / 硅钢', accent: '#b49bff', anchor: [0.78, 0.1, 0.4],
        explode: [-2.3, 0.2, 0]
      },
      {
        id: 'fieldWinding', index: '05', name: '励磁绕组', en: 'FIELD WINDING', mass: 2.9,
        description: '直流励磁电流流过套在磁极上的集中式铜绕组，建立转子主磁场。励磁电流大小决定励磁电动势 E₀，也决定功率因数与稳定裕度。',
        specs: [['形式', '集中式'], ['电流', '0–3 A'], ['导线', '铜扁线']],
        material: '铜绕组 / F 级绝缘', accent: '#ffc66b', anchor: [0.6, 0.25, 0.88],
        explode: [-2.5, 1.3, 0]
      },
      {
        id: 'damperWinding', index: '06', name: '阻尼绕组', en: 'DAMPER WINDING', mass: 1.4,
        description: '磁极表面嵌入的铜导条与两端短路环构成阻尼绕组。它抑制转速与功角振荡，并在异步启动时提供启动转矩。',
        specs: [['形式', '笼型阻尼条'], ['材料', '铜导条'], ['作用', '抑制振荡']],
        material: '铜导条 / 短路环', accent: '#ff9e7a', anchor: [0.83, 0.1, 0.6],
        explode: [-2.7, -0.7, 0]
      },
      {
        id: 'slipRing', index: '07', name: '滑环与电刷', en: 'SLIP RINGS & BRUSHES', mass: 1.3,
        description: '三只滑环固定在轴上，与静止的电刷滑动接触，把外部直流励磁电流送入旋转的励磁绕组。剖切展示中滑环与电刷保持静止，便于观察接触结构。',
        specs: [['滑环', '3 只'], ['电刷', '石墨电刷'], ['作用', '引入励磁']],
        material: '黄铜滑环 / 石墨电刷', accent: '#e0b56d', anchor: [0, 0.42, 1.64],
        explode: [0, 0, 2.3]
      },
      {
        id: 'exciter', index: '08', name: '励磁机', en: 'EXCITER', mass: 3.8,
        description: '与主轴同轴的小型励磁机为励磁绕组提供直流电源，经滑环与电刷送入转子。励磁机使同步电机无需外部独立直流电源即可运行。',
        specs: [['形式', '同轴励磁机'], ['输出', '直流'], ['安装', '后端']],
        material: '铸铁机座 / 铜绕组', accent: '#8fd6ff', anchor: [0, 0.55, 2.28],
        explode: [0, 0, 3.1]
      },
      {
        id: 'shaft', index: '09', name: '转轴', en: 'SHAFT', mass: 8.6,
        description: '转轴把电磁转矩传递给机械负载，两端由端盖轴承支撑。驱动端带联轴器法兰与键槽，后端穿过滑环与励磁机。',
        specs: [['材料', '45 号钢'], ['轴承', '深沟球轴承'], ['驱动端', '联轴器法兰']],
        material: '45 号钢', accent: '#b8c7d1', anchor: [0.12, 0.12, 2.55],
        explode: [0, 0, -2.2]
      },
      {
        id: 'terminalBox', index: '10', name: '接线盒', en: 'TERMINAL BOX', mass: 0.9,
        description: '机座顶部的接线盒汇集三相定子绕组引出线，通过电缆与电网相连。盒内端子标注 U、V、W，决定电机的相序与旋转方向。',
        specs: [['端子', 'U V W'], ['进线', '电缆密封接头'], ['位置', '机座顶部']],
        material: '铸铝盒体 / 铜端子', accent: '#c8b7ff', anchor: [0, 2.45, 0.05],
        explode: [0, 2.5, 0]
      }
    ],
    controls: [
      {
        id: 'fieldCurrent', label: '励磁电流', en: 'FIELD CURRENT', min: 0, max: 3,
        step: 0.05, value: 1.2, unit: 'A', digits: 2, accent: ACCENT,
        scaleMin: '0', scaleMax: '3.0', className: 'accent-violet'
      },
      {
        id: 'loadTorque', label: '负载转矩', en: 'LOAD TORQUE', min: -45, max: 45,
        step: 0.5, value: 15, unit: 'N·m', digits: 1, accent: CYAN,
        scaleMin: '-45', scaleMax: '45', className: ''
      },
      {
        id: 'gridVoltage', label: '电网电压', en: 'GRID VOLTAGE', min: 0.9, max: 1.1,
        step: 0.005, value: 1, unit: 'p.u.', digits: 3, accent: MINT,
        scaleMin: '0.90', scaleMax: '1.10', className: 'accent-mint'
      }
    ],
    metrics: [
      { id: 'speed', label: 'SYNCHRONOUS SPEED', unit: 'rpm', digits: 0, max: 1650, accent: CYAN },
      { id: 'delta', label: 'LOAD ANGLE δ', unit: '°', digits: 1, max: 90, accent: ACCENT },
      { id: 'current', label: 'STATOR CURRENT', unit: 'A', digits: 2, max: 16, accent: AMBER },
      { id: 'pf', label: 'POWER FACTOR', unit: 'cosφ', digits: 3, max: 1, accent: MINT }
    ],
    dataFields: [
      { id: 'emf', label: 'E₀ 励磁电动势' },
      { id: 'power', label: 'P₂ 轴功率' },
      { id: 'reactive', label: 'Q 无功功率' },
      { id: 'limit', label: 'T_max 失步转矩' }
    ],
    charts: [
      { id: 'pdelta', label: 'P-δ 曲线', title: '功角特性 P—δ' },
      { id: 'vcurve', label: 'V 形曲线', title: '定子电流—励磁电流' },
      { id: 'efficiency', label: '效率曲线', title: '效率—负载转矩' }
    ],
    sim: {
      create: function (machine) {
        const inputs = {};
        (machine.controls || []).forEach(function (control) {
          inputs[control.id] = control.value;
        });
        const op = computeOperatingPoint(inputs);
        const deltaMech = ML.degToRad(op.deltaDeg) / POLE_PAIRS;
        return {
          t: 0,
          speed: N_SYNC,
          synced: op.synced,
          deltaDeg: op.synced ? op.deltaDeg : (op.Ppu >= 0 ? 90 : -90),
          fieldAngle: 0,
          rotorAngle: ML.mod(-deltaMech, TWO_PI),
          pendingNotice: null
        };
      },
      step: function (state, dt, inputs, visual) {
        const op = computeOperatingPoint(inputs);
        state.t += dt;
        const targetSpeed = op.synced ? N_SYNC : N_SYNC * (op.torque >= 0 ? 0.6 : 1.08);
        const speedRate = op.synced ? 2.2 : 3.2;
        state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-dt * speedRate));
        state.speed = ML.clamp(state.speed, 120, 1900);
        const deltaTarget = op.synced ? op.deltaDeg : (op.Ppu >= 0 ? 90 : -90);
        state.deltaDeg += (deltaTarget - state.deltaDeg) * (1 - Math.exp(-dt * 4.2));
        state.fieldAngle = ML.mod(state.fieldAngle + OMEGA_SYNC * dt * SLOW_MO, TWO_PI);
        if (op.synced) {
          state.rotorAngle = ML.mod(state.fieldAngle - ML.degToRad(state.deltaDeg) / POLE_PAIRS, TWO_PI);
        } else {
          state.rotorAngle = ML.mod(state.rotorAngle + (state.speed * Math.PI / 30) * dt * SLOW_MO, TWO_PI);
        }
        if (state.pendingNotice) {
          if (state.pendingNotice === 'slip') {
            ML.showToast('负载超过失步转矩 · 电机失步，转速下降', 2600);
          } else if (state.pendingNotice === 'restore') {
            ML.showToast('已恢复同步运行 · 转子重新被磁场锁定', 2000);
          }
          state.pendingNotice = null;
        }
        state.synced = op.synced;
        applyVisual(state, visual);
      },
      onInput: function (state, inputs, visual) {
        const op = computeOperatingPoint(inputs);
        if (op.synced !== state.synced) state.pendingNotice = op.synced ? 'restore' : 'slip';
        state.synced = op.synced;
        state.deltaDeg = op.synced ? op.deltaDeg : (op.Ppu >= 0 ? 90 : -90);
        if (op.synced) {
          state.rotorAngle = ML.mod(state.fieldAngle - ML.degToRad(state.deltaDeg) / POLE_PAIRS, TWO_PI);
        }
        applyVisual(state, visual);
      },
      animate: function (state, dt, inputs, visual) {
        if (!visual) return;
        applyVisual(state, visual);
        const extras = visual.extras || {};
        if (extras.fieldMaterials) {
          const opacity = 0.55 + Math.sin(state.t * 2.4) * 0.14;
          extras.fieldMaterials.forEach(function (material) {
            if (material) material.opacity = opacity;
          });
        }
      },
      readout: function (state, inputs) {
        const ev = evaluate(state, inputs);
        const deltaText = ev.deltaDeg.toFixed(1);
        const pText = (ev.pShaft / 1000).toFixed(2);
        const qText = (ev.qPu * S_BASE / 1000).toFixed(2);
        const pfText = ev.pf.toFixed(3) + (ev.leading ? ' 超前' : ' 滞后');
        const legend = '<span class="legend-item" style="color:#b49bff"><i style="background:#b49bff"></i>工作点</span>' +
          '<span class="legend-item" style="color:#ffc66b"><i style="background:#ffc66b"></i>额定励磁参考</span>' +
          '<span class="legend-item" style="color:#ff7e9b"><i style="background:#ff7e9b"></i>稳定极限 δ=±90°</span>';
        return {
          metrics: {
            speed: state.speed,
            delta: ev.deltaDeg,
            current: ev.iAmps,
            pf: ev.pf
          },
          data: {
            emf: ev.EVolts.toFixed(0) + ' V',
            power: pText + ' kW',
            reactive: qText + ' kvar',
            limit: ev.torqueMax.toFixed(1) + ' N·m'
          },
          chartNote: 'If ' + ev.If.toFixed(2) + ' A · E₀ ' + ev.EVolts.toFixed(0) + ' V · V ' + ev.V.toFixed(2) + ' p.u.' + (ev.synced ? '' : ' · 失步'),
          chartReadout: 'δ ' + deltaText + '° · Ia ' + ev.iAmps.toFixed(2) + ' A · cosφ ' + pfText,
          legend: legend,
          stageMode: ev.synced ? 'SYNCHRONOUS / CUTAWAY' : 'SYNCHRONOUS / LOSS OF SYNC',
          stageAngle: ML.mod(ML.radToDeg(state.rotorAngle), 360)
        };
      },
      drawChart: function (mode, ctx, w, h, state, inputs) {
        const C = ML.Charts;
        C.clear(ctx, w, h);
        if (mode === 'vcurve') return drawVCurve(ctx, w, h, state, inputs);
        if (mode === 'efficiency') return drawEfficiency(ctx, w, h, state, inputs);
        return drawPowerAngle(ctx, w, h, state, inputs);
      }
    },
    build: function (ctx) {
      const root = new THREE.Group();
      const groups = {};

      const paint = ML.makeStandard(0x453d63, 0.4, 0.48, { envMapIntensity: 0.5 });
      const paintLight = ML.makeStandard(0x6e5c96, 0.36, 0.42, { envMapIntensity: 0.62 });
      const paintDark = ML.makeStandard(0x2b2639, 0.38, 0.54, { envMapIntensity: 0.42 });
      const steel = ML.Materials.steel();
      const darkSteel = ML.Materials.darkSteel();
      const iron = ML.Materials.ironCore();
      const ironDark = ML.Materials.ironDark();
      const copper = ML.Materials.copper();
      const copperBright = ML.Materials.copperBright();
      const copperDark = ML.Materials.copperDark();
      const brass = ML.Materials.brass();
      const polymer = ML.Materials.polymer();
      const rotorSteel = ML.makeStandard(0x8b9db0, 0.82, 0.3, { envMapIntensity: 0.7 });
      const rotorPole = ML.makeStandard(0x9fb2c2, 0.8, 0.28, { envMapIntensity: 0.75 });
      const toothSteel = ML.makeStandard(0x5b7180, 0.8, 0.36, { envMapIntensity: 0.6 });
      const fieldGroup = new THREE.Group();
      const fieldMaterials = [];
      const poleAngles = [0, 90, 180, 270];

      /* 内部补光：让剖切窗口里的转子与励磁绕组可读 */
      const innerCool = new THREE.PointLight(0x9fdcff, 1.5, 5.4, 2);
      innerCool.position.set(1.2, 0.9, 0.4);
      root.add(innerCool);
      const innerViolet = new THREE.PointLight(0xc9b4ff, 1.15, 4.8, 2);
      innerViolet.position.set(-0.8, -0.5, -0.7);
      root.add(innerViolet);
      const innerWarm = new THREE.PointLight(0xffd6a8, 0.9, 4.4, 2);
      innerWarm.position.set(1.9, 0.2, 1.1);
      root.add(innerWarm);

      /* ---------- 01 机座与端盖 ---------- */
      const frame = new THREE.Group();
      groups.frame = frame;
      root.add(frame);
      addSector(frame, 1.66, 1.82, CUT_START_DEG, CUT_END_DEG, 2.6, paint, {
        edges: true, edgeColor: 0x9a8cc4, edgeOpacity: 0.16, curveSegments: 44, bevel: 0.014
      });
      [-1.3, 1.3].forEach(function (z) {
        addSector(frame, 1.6, 1.88, CUT_START_DEG, CUT_END_DEG, 0.1, paintLight, { z: z, curveSegments: 40 });
      });
      [90, 140, 180, 220, 270].forEach(function (deg) {
        const a = ML.degToRad(deg);
        ML.addBox(frame, 0.07, 0.1, 2.36, paintLight, Math.cos(a) * 1.855, Math.sin(a) * 1.855, 0, {
          rotation: [0, 0, a - Math.PI / 2], castShadow: false
        });
      });
      [-0.82, 0.82].forEach(function (z) {
        ML.addBox(frame, 2.5, 0.18, 0.5, paintDark, 0, -1.9, z, {
          edges: true, edgeColor: 0x6d608f, edgeOpacity: 0.18
        });
        ML.addBox(frame, 1.2, 0.06, 0.62, steel, 0, -2.0, z, { castShadow: false });
      });
      ML.addBox(frame, 2.9, 0.1, 2.3, paintDark, 0, -2.03, 0, {
        edges: true, edgeColor: 0x6d608f, edgeOpacity: 0.14
      });
      const basePlate = ML.addTextPlane(frame, '4 kW  ·  400 V  ·  50 Hz  ·  1500 rpm', [1.47, -1.93, 0.35], 2.4, 0.17, {
        color: 'rgba(226, 220, 255, 0.82)', fontPx: 72, opacity: 0.92
      });
      basePlate.rotation.y = Math.PI / 2;
      [-1.42, 1.42].forEach(function (z) {
        addSector(frame, 0.3, 1.84, CUT_START_DEG, CUT_END_DEG, 0.16, paintDark, {
          z: z, curveSegments: 40, edges: true, edgeColor: 0x6d608f, edgeOpacity: 0.14
        });
        addSector(frame, 1.68, 1.86, CUT_START_DEG, CUT_END_DEG, 0.22, paintLight, { z: z, curveSegments: 34 });
        ML.addCylinder(frame, 0.3, 0.3, 0.18, 20, paintDark, 0, 0, z + (z > 0 ? 0.12 : -0.12), 'z');
        for (let i = 0; i < 5; i += 1) {
          const a = ML.degToRad(90 + i * 45);
          ML.addBolt(frame, Math.cos(a) * 0.66, Math.sin(a) * 0.66, z + (z > 0 ? 0.1 : -0.1), 'z', steel, 0.035, 0.03);
        }
      });

      /* ---------- 02 定子铁心 ---------- */
      const statorCore = new THREE.Group();
      groups.statorCore = statorCore;
      root.add(statorCore);
      const SLICE_COUNT = 13;
      for (let i = 0; i < SLICE_COUNT; i += 1) {
        const z = -0.9 + i * 0.152;
        addSector(statorCore, 1.02, 1.58, CUT_START_DEG, CUT_END_DEG, 0.138, i % 2 === 0 ? iron : ironDark, {
          z: z, curveSegments: 30,
          edges: i === 0 || i === SLICE_COUNT - 1,
          edgeColor: 0x7f9bb5, edgeOpacity: 0.13
        });
      }
      for (let k = 0; k < 24; k += 1) {
        const deg = k * 15;
        if (deg <= CUT_START_DEG || deg >= CUT_END_DEG) continue;
        const a = ML.degToRad(deg);
        ML.addBox(statorCore, 0.1, 0.15, 1.9, toothSteel, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0, {
          rotation: [0, 0, a - Math.PI / 2]
        });
      }

      /* ---------- 03 三相定子绕组 ---------- */
      const statorWinding = new THREE.Group();
      groups.statorWinding = statorWinding;
      root.add(statorWinding);
      const phaseMaterials = [copperBright, copper, copperDark];
      for (let k = 0; k < 24; k += 1) {
        const mid = k * 15 + 7.5;
        if (mid < CUT_START_DEG + 4 || mid > CUT_END_DEG - 4) continue;
        const a = ML.degToRad(mid);
        ML.addBox(statorWinding, 0.078, 0.13, 1.72, phaseMaterials[k % 3], Math.cos(a) * 0.96, Math.sin(a) * 0.96, 0, {
          rotation: [0, 0, a - Math.PI / 2], castShadow: false
        });
      }
      [-0.97, 0.97].forEach(function (z) {
        const geo = new THREE.TorusGeometry(0.95, 0.05, 6, 40, ML.degToRad(CUT_END_DEG - CUT_START_DEG));
        const mesh = ML.addMesh(statorWinding, geo, copperDark, [0, 0, z], { castShadow: true, receiveShadow: true });
        mesh.rotation.z = ML.degToRad(CUT_START_DEG);
      });
      [116, 132, 148].forEach(function (deg, index) {
        const a = ML.degToRad(deg);
        const lead = [
          [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.98],
          [Math.cos(a) * 0.92, Math.sin(a) * 0.92, 1.18],
          [0.2 - index * 0.2, 1.72, 0.55],
          [0.2 - index * 0.2, 1.88, 0.3]
        ];
        ML.addTube(statorWinding, lead, 0.028, phaseMaterials[index], { tubularSegments: 22, radialSegments: 5 });
      });

      /* ---------- 04 凸极转子 ---------- */
      const rotor = new THREE.Group();
      groups.rotor = rotor;
      root.add(rotor);
      ML.addCylinder(rotor, 0.5, 0.5, 1.68, 36, rotorSteel, 0, 0, 0, 'z');
      [-0.84, 0.84].forEach(function (z) {
        ML.addCylinder(rotor, 0.42, 0.42, 0.06, 28, ironDark, 0, 0, z, 'z', { castShadow: false });
      });
      poleAngles.forEach(function (deg) {
        const a = ML.degToRad(deg);
        ML.addBox(rotor, 0.42, 0.26, 1.56, rotorPole, Math.cos(a) * 0.59, Math.sin(a) * 0.59, 0, {
          rotation: [0, 0, a - Math.PI / 2],
          edges: true, edgeColor: 0xb9cede, edgeOpacity: 0.14
        });
        addSector(rotor, 0.66, 0.82, deg - 32, deg + 32, 1.6, rotorPole, {
          curveSegments: 18, edges: true, edgeColor: 0xb9cede, edgeOpacity: 0.12
        });
      });

      /* ---------- 05 励磁绕组 ---------- */
      const fieldWinding = new THREE.Group();
      groups.fieldWinding = fieldWinding;
      root.add(fieldWinding);
      poleAngles.forEach(function (deg) {
        const a = ML.degToRad(deg);
        [-1, 1].forEach(function (side) {
          const sa = a + side * ML.degToRad(34);
          ML.addBox(fieldWinding, 0.095, 0.4, 1.42, side > 0 ? copper : copperBright, Math.cos(sa) * 0.55, Math.sin(sa) * 0.55, 0, {
            rotation: [0, 0, sa - Math.PI / 2], edges: true, edgeColor: 0xd6a066, edgeOpacity: 0.18
          });
        });
        [-0.88, 0.88].forEach(function (z) {
          ML.addBox(fieldWinding, 0.68, 0.44, 0.13, copper, Math.cos(a) * 0.53, Math.sin(a) * 0.53, z, {
            rotation: [0, 0, a - Math.PI / 2], edges: true, edgeColor: 0xd6a066, edgeOpacity: 0.2
          });
        });
      });
      ML.addTube(fieldWinding, [[0.3, 0.05, 0.8], [0.28, 0.06, 1.14], [0.24, 0.08, 1.5]], 0.024, copperBright, { tubularSegments: 16, radialSegments: 5 });
      ML.addTube(fieldWinding, [[0.14, -0.2, 0.8], [0.12, -0.18, 1.14], [0.1, -0.14, 1.63]], 0.024, copperDark, { tubularSegments: 16, radialSegments: 5 });

      /* ---------- 06 阻尼绕组 ---------- */
      const damperWinding = new THREE.Group();
      groups.damperWinding = damperWinding;
      root.add(damperWinding);
      poleAngles.forEach(function (deg) {
        for (let i = -2; i <= 2; i += 1) {
          const a = ML.degToRad(deg + i * 4.6);
          ML.addCylinder(damperWinding, 0.028, 0.028, 1.76, 6, copperBright, Math.cos(a) * 0.83, Math.sin(a) * 0.83, 0, 'z');
        }
        [-0.9, 0.9].forEach(function (z) {
          const geo = new THREE.TorusGeometry(0.83, 0.032, 5, 16, ML.degToRad(24));
          const mesh = ML.addMesh(damperWinding, geo, copper, [0, 0, z], { castShadow: true, receiveShadow: true });
          mesh.rotation.z = ML.degToRad(deg) - ML.degToRad(12);
        });
      });

      /* ---------- 07 滑环与电刷（静止） ---------- */
      const slipRing = new THREE.Group();
      groups.slipRing = slipRing;
      root.add(slipRing);
      [1.5, 1.64, 1.78].forEach(function (z) {
        ML.addTorus(slipRing, 0.235, 0.07, brass, 0, 0, z, null, 8, 40);
        ML.addBox(slipRing, 0.14, 0.2, 0.11, polymer, 0, 0.4, z, {
          edges: true, edgeColor: 0x5b6f86, edgeOpacity: 0.2
        });
        ML.addCylinder(slipRing, 0.045, 0.045, 0.1, 10, steel, 0, 0.54, z, 'y');
      });
      ML.addBox(slipRing, 0.5, 0.14, 0.78, darkSteel, 0, 0.66, 1.64, {
        edges: true, edgeColor: 0x6f8194, edgeOpacity: 0.2
      });
      ML.addBox(slipRing, 0.1, 0.9, 0.12, darkSteel, 0, 1.15, 1.72, { castShadow: false });
      ML.addBox(slipRing, 0.1, 0.1, 0.42, darkSteel, 0, 1.56, 1.52, { castShadow: false });
      ML.addBox(slipRing, 0.42, 0.3, 0.1, paintLight, 0, 1.6, 1.34, { castShadow: false });
      ML.addTube(slipRing, [[0.12, 0.6, 1.5], [0.34, 0.62, 1.64], [0.42, 0.35, 1.84]], 0.02, copper, { tubularSegments: 14, radialSegments: 5 });

      /* ---------- 08 励磁机 ---------- */
      const exciter = new THREE.Group();
      groups.exciter = exciter;
      root.add(exciter);
      ML.addCylinder(exciter, 0.54, 0.54, 0.52, 26, paintLight, 0, 0, 2.28, 'z', {
        edges: true, edgeColor: 0x9a8cc4, edgeOpacity: 0.16
      });
      [-2.0, 2.56].forEach(function (z) {
        ML.addCylinder(exciter, 0.58, 0.58, 0.08, 26, paintDark, 0, 0, z, 'z');
      });
      ML.addCylinder(exciter, 0.34, 0.34, 0.6, 22, steel, 0, 0, 2.28, 'z');
      ML.addBox(exciter, 0.2, 0.16, 0.22, brass, 0, 0.62, 2.28, { edges: true, edgeColor: 0xc7a463, edgeOpacity: 0.2 });
      ML.addTube(exciter, [[0, -1.3, 1.45], [0, -0.85, 1.9], [0, -0.52, 2.18]], 0.045, darkSteel, { tubularSegments: 14, radialSegments: 6 });

      /* ---------- 09 转轴 ---------- */
      const shaft = new THREE.Group();
      groups.shaft = shaft;
      root.add(shaft);
      ML.addCylinder(shaft, 0.16, 0.16, 4.9, 26, steel, 0, 0, 0.45, 'z');
      [-1.35, 1.35].forEach(function (z) {
        ML.addCylinder(shaft, 0.215, 0.215, 0.3, 20, darkSteel, 0, 0, z, 'z');
      });
      ML.addCylinder(shaft, 0.34, 0.34, 0.16, 26, steel, 0, 0, -1.92, 'z', {
        edges: true, edgeColor: 0x9db4c8, edgeOpacity: 0.16
      });
      for (let i = 0; i < 4; i += 1) {
        const a = i * Math.PI / 2;
        ML.addCylinder(shaft, 0.045, 0.045, 0.08, 8, darkSteel, Math.cos(a) * 0.24, Math.sin(a) * 0.24, -1.86, 'z');
      }
      ML.addBox(shaft, 0.062, 0.045, 1.4, darkSteel, 0, 0.172, -1.15, { castShadow: false });

      /* 后端风扇：随转子转动，便于观察同步转速与功角变化。 */
      const shaftFan = new THREE.Group();
      shaftFan.position.set(0, 0, 2.75);
      ML.addCylinder(shaftFan, 0.12, 0.12, 0.12, 16, darkSteel, 0, 0, 0, 'z', { castShadow: false });
      for (let i = 0; i < 5; i += 1) {
        const a = i / 5 * Math.PI * 2;
        const blade = ML.addBox(shaftFan, 0.44, 0.045, 0.13, paintLight, 0, 0, 0, { castShadow: false });
        blade.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0);
        blade.rotation.z = a;
      }
      ML.addTorus(shaftFan, 0.43, 0.022, brass, 0, 0, 0, [0, 0, 0], 6, 22);
      shaft.add(shaftFan);

      /* ---------- 10 接线盒 ---------- */
      const terminalBox = new THREE.Group();
      groups.terminalBox = terminalBox;
      root.add(terminalBox);
      ML.addBox(terminalBox, 0.92, 0.07, 0.72, paintDark, 0, 1.86, 0.05, { castShadow: false });
      ML.addBox(terminalBox, 0.8, 0.42, 0.6, paintLight, 0, 2.1, 0.05, {
        edges: true, edgeColor: 0x9a8cc4, edgeOpacity: 0.18
      });
      ML.addBox(terminalBox, 0.86, 0.06, 0.66, paintDark, 0, 2.33, 0.05, { castShadow: false });
      for (let i = -1; i <= 1; i += 1) {
        ML.addCylinder(terminalBox, 0.055, 0.055, 0.14, 10, brass, i * 0.2, 2.4, 0.05, 'y');
        ML.addTorus(terminalBox, 0.06, 0.014, brass, i * 0.2, 2.45, 0.05, [Math.PI / 2, 0, 0], 5, 12);
      }
      const boxPlate = ML.addTextPlane(terminalBox, 'SYNCHRONOUS · 4 kW · p=2', [0.415, 2.12, 0.05], 0.62, 0.1, {
        color: 'rgba(226, 235, 255, 0.85)', fontPx: 54, opacity: 0.9
      });
      boxPlate.rotation.y = Math.PI / 2;

      /* ---------- 磁场可视化（extras，F 键控制） ---------- */
      const armatureField = new THREE.Group();
      const rotorField = new THREE.Group();
      fieldGroup.add(armatureField);
      fieldGroup.add(rotorField);
      root.add(fieldGroup);
      const armatureZ = 1.06;
      poleAngles.forEach(function (deg, index) {
        const a = ML.degToRad(deg);
        const outward = index % 2 === 0;
        const inner = [Math.cos(a) * 0.74, Math.sin(a) * 0.74, armatureZ];
        const outer = [Math.cos(a) * 1.38, Math.sin(a) * 1.38, armatureZ];
        const mat = addFieldArrow(armatureField, outward ? inner : outer, outward ? outer : inner, 0xb49bff, 0.68);
        if (mat) fieldMaterials.push(mat);
      });
      const rotorZ = 1.2;
      poleAngles.forEach(function (deg, index) {
        const a = ML.degToRad(deg);
        const outward = index % 2 === 0;
        const inner = [Math.cos(a) * 0.24, Math.sin(a) * 0.24, rotorZ];
        const outer = [Math.cos(a) * 1.02, Math.sin(a) * 1.02, rotorZ];
        const mat = addFieldArrow(rotorField, outward ? inner : outer, outward ? outer : inner, outward ? 0xffc66b : 0x57dcff, 0.72);
        if (mat) fieldMaterials.push(mat);
      });

      return {
        root: root,
        groups: groups,
        extras: {
          fieldGroup: fieldGroup,
          fieldMaterials: fieldMaterials,
          armatureField: armatureField,
          rotorField: rotorField
        }
      };
    },
    knowledge: [
      {
        id: 'sync-speed', kicker: '01 / SYNCHRONOUS SPEED', title: '同步转速',
        lead: '同步电机的转子转速由电网频率与极对数决定。并网运行时，转子励磁磁场被旋转磁场“锁定”，只能以同步转速旋转。',
        html: `
          <div class="topic-section"><h4>旋转磁场决定转速</h4><p>三相对称电流在定子绕组中合成一个以同步转速旋转的磁场。转子上的直流励磁绕组建立转子磁场，两者同速旋转、相对静止，靠气隙中的磁拉力传递转矩。这是同步电机与异步电机最根本的区别。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>SYNCHRONOUS SPEED</span><strong>n₁ = 60 f / p</strong></div>
            <div class="formula-card"><span>THIS MACHINE</span><strong>f = 50 Hz，p = 2 → 1500 rpm</strong></div>
            <div class="formula-card"><span>ROTOR SPEED</span><strong>n = n₁（稳定同步时）</strong></div>
            <div class="formula-card"><span>SLIP</span><strong>s = 0</strong></div>
          </div>
          <div class="topic-section"><h4>电角度与机械角度</h4><p>电角度等于机械角度乘以极对数 p。本机 p=2，转子每转过 180° 机械角，磁场变化一个完整周期。所以功角 δ 是电角度，而转子相对定子磁场轴线的机械偏移为 δ/p。</p></div>
          <div class="callout"><b>观察</b><p>改变负载转矩后，转速仍然保持在 1500 rpm 附近，但转子相对定子磁场会稳定在一个功角 δ 上；3D 视图中的转子偏移即由 δ 换算得到。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="run">运行并观察转速</button><button type="button" data-knowledge-action="field">显示旋转磁场</button></div>
        `
      },
      {
        id: 'excitation', kicker: '02 / EXCITATION & LOAD ANGLE', title: '励磁与功角',
        lead: '直流励磁电流建立转子主磁场。负载转矩通过功角改变电磁转矩，励磁电流则改变电动势、无功电流与稳定裕度。',
        html: `
          <div class="topic-section"><h4>励磁建立转子磁场</h4><p>直流励磁电流 I_f 经滑环与电刷流入凸极转子上的励磁绕组，产生转子磁通。忽略饱和时，励磁电动势 E₀ 与 I_f 成正比；本教学样机取 I_f = 1.2 A 时 E₀ = 1.0 p.u.（相电动势 230 V）。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>EXCITATION EMF</span><strong>E₀ ∝ I_f</strong></div>
            <div class="formula-card"><span>POWER–ANGLE</span><strong>P = 3 V E₀ sin δ / X_s</strong></div>
            <div class="formula-card"><span>TORQUE</span><strong>T = P / Ω₁</strong></div>
            <div class="formula-card"><span>STABILITY LIMIT</span><strong>P_max = 3 V E₀ / X_s（δ = 90°）</strong></div>
          </div>
          <div class="topic-section"><h4>功角的物理意义</h4><p>负载增大时，转子瞬间减速，功角 δ 增大，电磁转矩随之增大并与负载转矩重新平衡；负载减小则相反。因此功角是同步电机传递有功功率的“弹簧伸长量”。</p></div>
          <div class="topic-section"><h4>调节励磁的作用</h4><p>在相同有功功率下增大 I_f，功角 δ 会减小，稳定裕度提高；同时定子电流的无功分量改变：欠励时从电网吸收感性无功，过励时向电网发出感性无功（电流超前电压）。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="field">显示转子 / 电枢磁场</button><button type="button" data-knowledge-action="run">运行并观察功角</button></div>
        `
      },
      {
        id: 'v-curve', kicker: '03 / V CURVE', title: 'V 形曲线',
        lead: '保持负载转矩不变，只改变励磁电流，定子电流随励磁电流变化形成 V 形曲线，最低点对应 cosφ = 1。',
        html: `
          <div class="topic-section"><h4>恒定负载下的 V 形曲线</h4><p>保持有功负载不变，只调节励磁电流 I_f，记录定子电流 I_a，会得到一条 V 形曲线。曲线最低点对应 cosφ = 1，此时定子电流全部为有功分量；左侧为欠励（滞后）区，右侧为过励（超前）区。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>REACTIVE POWER</span><strong>Q = 3V(V − E₀ cos δ) / X_s</strong></div>
            <div class="formula-card"><span>POWER FACTOR</span><strong>cos φ = P / (√3 U I_a)</strong></div>
            <div class="formula-card"><span>UNDER-EXCITED</span><strong>E₀ cos δ &lt; V → 滞后电流，吸收 Q</strong></div>
            <div class="formula-card"><span>OVER-EXCITED</span><strong>E₀ cos δ &gt; V → 超前电流，发出 Q</strong></div>
          </div>
          <div class="topic-section"><h4>负载对 V 形曲线的影响</h4><p>负载越大，V 形曲线整体上移，最低点对应的励磁电流也越大。右侧“V 形曲线”标签里画出 0、8、16、24、32 N·m 一组负载曲线，紫色为当前负载，工作点随励磁电流滑动。</p></div>
          <div class="callout"><b>注意</b><p>励磁过低时电流可能不大，但功角接近 90°，稳定裕度不足；励磁过高则定子电流与转子发热增加。V 形曲线最低点并不意味着最安全，只是无功电流为零。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="run">调节励磁观察 V 形曲线</button></div>
        `
      },
      {
        id: 'grid', kicker: '04 / GRID & STABILITY', title: '并网与失步',
        lead: '同步电机并网需要电压、频率、相序与相位一致；负载超过失步转矩后，转子将滑极并失去同步。',
        html: `
          <div class="topic-section"><h4>并网条件</h4><p>同步电机并入电网需要电压幅值、频率、相序和相位一致。条件不满足时，合闸瞬间会产生很大的冲击电流和冲击转矩，严重时会损伤绕组与联轴器。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>GRID CONDITIONS</span><strong>同电压 · 同频率 · 同相序 · 同相位</strong></div>
            <div class="formula-card"><span>STABLE REGION</span><strong>−90° &lt; δ &lt; 90°</strong></div>
            <div class="formula-card"><span>DAMPER WINDING</span><strong>抑制振荡 · 提供异步启动转矩</strong></div>
            <div class="formula-card"><span>OUT OF STEP</span><strong>|T| &gt; T_max 时失步</strong></div>
          </div>
          <div class="topic-section"><h4>失步与阻尼绕组</h4><p>负载转矩超过失步转矩 T_max 后，转子无法维持同步，出现滑极：本演示中转速会偏离 1500 rpm 并给出失步提示。实机中磁极上的阻尼绕组像鼠笼一样提供异步转矩，抑制振荡并帮助电机再同步。</p></div>
          <div class="callout"><b>教学口径</b><p>本页为 4 kW 级教学样机（p=2、50 Hz、X_s = 0.9 p.u.），损耗与电流为等效模型，不对应具体厂家铭牌。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="explode">剖解观察滑环与励磁绕组</button><button type="button" data-knowledge-action="run">运行并观察失步</button></div>
        `
      }
    ]
  });
})(window);
