/* 三相鼠笼异步电机 — structural cutaway + V/f teaching simulation. */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  const ACCENT = '#66e6c2';
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  /* ---------------- teaching prototype (4 kW, 4-pole) ---------------- */
  const P = {
    polePairs: 2,
    fRated: 50,
    vRated: 380,
    vfRated: 380 / 50,
    tMaxRated: 68,
    smRated: 0.22,
    j: 0.035,
    damping: 0.012,
    r1: 0.45,
    r2: 0.85,
    x2: 1.2,
    iRated: 8.4,
    pFe: 110,
    pFric: 55,
    boost: 22,
    ratedSpeed: 1440,
    visualScale: 0.06
  };

  const CUT_KEEP = { start: 175 * DEG, length: 250 * DEG };
  const CUT_FACE = { start: 85 * DEG, length: 250 * DEG };

  /* ---------------- physics core ---------------- */

  function statorVoltage(f, vfPu) {
    const base = P.vRated * (f / P.fRated);
    const boost = P.boost * Math.max(0, 1 - f / P.fRated);
    return Math.max(0, (base + boost) * (vfPu === undefined ? 1 : vfPu));
  }

  function fluxPerUnit(f, v) {
    return (v / Math.max(1, f)) / P.vfRated;
  }

  function synchronousSpeed(f) {
    return 60 * f / P.polePairs;
  }

  function slipForFrequency(f) {
    return ML.clamp(P.smRated * (P.fRated / f), 0.05, 0.9);
  }

  function maxTorque(f, v) {
    const flux = fluxPerUnit(f, v);
    return P.tMaxRated * flux * flux;
  }

  function torqueForSlip(s, f, v) {
    const tmax = maxTorque(f, v);
    const sm = slipForFrequency(f);
    if (Math.abs(s) < 1e-7) return 0;
    const u = s / sm;
    return 2 * tmax * u / (u * u + 1);
  }

  function steadySlip(loadTorque, f, v) {
    const tmax = maxTorque(f, v);
    const sm = slipForFrequency(f);
    const tl = Math.max(0, loadTorque);
    if (tl < 0.05) return 0.0012;
    if (tl >= tmax * 0.998) return 1;
    const k = 2 * tmax / tl;
    const u = (k - Math.sqrt(Math.max(0, k * k - 4))) / 2;
    return ML.clamp(u * sm, 0, 1);
  }

  function operatingPoint(n, f, v) {
    const ns = synchronousSpeed(f);
    const s = ns > 0 ? (ns - n) / ns : 0;
    const wSync = ns * TAU / 60;
    const flux = fluxPerUnit(f, v);
    const tmax = maxTorque(f, v);
    const sm = slipForFrequency(f);
    const te = torqueForSlip(s, f, v);
    const pag = Math.max(0, te) * wSync;
    const i0 = P.iRated * 0.3 * Math.abs(flux);
    const i2 = pag > 1e-6 && s > 1e-6 ? Math.sqrt(pag * s / (3 * P.r2)) : 0;
    const reactive = Math.sqrt(3) * v * i0 + pag * Math.max(0, s) * P.x2 / P.r2;
    const pFe = P.pFe * flux * flux;
    let pcu = 3 * i2 * i2 * P.r1;
    let i1 = i0;
    let pf = 0;
    let pin = 0;
    for (let k = 0; k < 3; k += 1) {
      pin = pag + pcu + pFe;
      const vLine = Math.max(1, v);
      const iActive = pin / (Math.sqrt(3) * vLine);
      const iReactive = reactive / (Math.sqrt(3) * vLine);
      i1 = Math.sqrt(iActive * iActive + iReactive * iReactive);
      pf = i1 > 1e-6 ? ML.clamp(iActive / i1, 0, 1) : 0;
      pcu = 3 * i1 * i1 * P.r1;
    }
    const pMech = Math.max(0, te) * (1 - ML.clamp(s, 0, 1)) * wSync;
    const pFric = P.pFric * Math.pow(Math.abs(n) / P.ratedSpeed, 2);
    const pOut = Math.max(0, pMech - pFric);
    pin = pag + pcu + pFe;
    const eff = pin > 1e-6 ? ML.clamp(pOut / pin * 100, 0, 100) : 0;
    return {
      ns: ns, s: s, te: te, tmax: tmax, sm: sm, i0: i0, i1: i1, i2: i2,
      pf: pf, pin: pin, pOut: pOut, pFe: pFe, pcu: pcu, eff: eff,
      flux: flux, v: v, f: f
    };
  }

  /* ---------------- geometry helpers ---------------- */

  function axialCylinder(parent, radius, length, material, z, segments, openEnded) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments || 44, 1, openEnded !== false, CUT_KEEP.start, CUT_KEEP.length);
    geo.rotateX(Math.PI / 2);
    return ML.addMesh(parent, geo, material, [0, 0, z || 0], { castShadow: true, receiveShadow: true });
  }

  function axialCylinderFull(parent, radius, length, material, z, segments) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, segments || 32, 1, false);
    geo.rotateX(Math.PI / 2);
    return ML.addMesh(parent, geo, material, [0, 0, z || 0], { castShadow: true, receiveShadow: true });
  }

  function faceRing(parent, inner, outer, z, material, segments) {
    const geo = new THREE.RingGeometry(inner, outer, segments || 44, 1, CUT_FACE.start, CUT_FACE.length);
    return ML.addMesh(parent, geo, material, [0, 0, z], { castShadow: false, receiveShadow: true });
  }

  function keptAngle(angle) {
    const a = ML.mod(angle / DEG, 360);
    return a >= 85 && a <= 335;
  }

  function radialBar(parent, radius, angle, widthRadial, widthTangential, length, z, material) {
    const geo = new THREE.BoxGeometry(widthRadial, widthTangential, length);
    return ML.addMesh(parent, geo, material, [Math.cos(angle) * radius, Math.sin(angle) * radius, z || 0], {
      rotation: [0, 0, angle],
      castShadow: true,
      receiveShadow: true
    });
  }

  function fieldMaterial(color, opacity) {
    const material = ML.makeBasic(color, opacity, {
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    material.userData.baseOpacity = opacity;
    return material;
  }

  ML.registerMachine({
    id: 'induction',
    order: 3,
    title: '三相异步电机',
    en: 'INDUCTION MOTOR',
    cardEn: 'THREE-PHASE SQUIRREL-CAGE INDUCTION MOTOR',
    accent: ACCENT,
    blurb: '定子三相绕组建立旋转磁场，鼠笼转子在转差中感应电流并拖动负载。调节频率、V/f 电压与负载，观察启动、转差与效率。',
    topics: ['旋转磁场', '转差与转子频率', 'Kloss 与等效电路', 'V/f 变频运行'],
    structureTitle: '定子与鼠笼转子',
    structureNote: '机壳前上方剖开 110°，可见定子铁心槽内的三相分布绕组、鼠笼转子的导条与端环，以及穿过转子的转轴。',
    structureFoot: '4 kW · 380 V · 50 Hz · 1440 rpm',
    consoleTitle: '运行控制',
    consoleKicker: 'V/f 变频供电',
    consoleLead: '电机从静止启动，转动惯量积分转速。调节频率、电压与负载，观察转矩、转差和电流的响应。',
    consoleTag: 'INDUCTION / V-F DRIVE',
    stageMode: 'SQUIRREL CAGE / CUTAWAY',
    fieldLabel: '旋转磁场',
    ctaSub: '旋转磁场 · Kloss · V/f 变频',
    knowledgeMeta: 'ROTATING FIELD / SLIP / KLOSS / V-F',
    viewDirection: [0.62, 0.3, 0.72],
    fitPadding: 1.04,
    explodePadding: 1.26,
    explodeDuration: 1100,
    legend: [
      { color: '#66e6c2', label: '旋转磁场' },
      { color: '#57dcff', label: '定子三相绕组' },
      { color: '#ffc66b', label: '鼠笼导条' }
    ],
    cardArt: `
      <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" stroke-width="1.3">
        <circle cx="120" cy="120" r="86" opacity=".45"/>
        <circle cx="120" cy="120" r="72" opacity=".8"/>
        <circle cx="120" cy="120" r="46" opacity=".55"/>
        <circle cx="120" cy="120" r="14" stroke-width="2.2"/>
        <path d="M120 34v16M120 190v16M34 120h16M190 120h16M61 61l12 12M167 167l12 12M179 61l-12 12M73 167l-12 12" stroke-width="3" opacity=".72"/>
        <circle cx="120" cy="120" r="58" stroke-dasharray="3 8" stroke-width="2.6" opacity=".95"/>
        <circle cx="120" cy="120" r="65" stroke-dasharray="2 6" opacity=".45"/>
        <path d="M156 76a54 54 0 0 1 20 44" stroke-width="2" opacity=".85"/>
        <path d="M176 120l-5-9M176 120l-9-3" stroke-width="2"/>
        <path d="M48 156c11 9 24 14 38 15" stroke-width="1.6" opacity=".4"/>
      </svg>
    `,
    parts: [
      {
        id: 'housing', index: '01', name: '机壳与散热筋', en: 'FRAME & COOLING FINS', mass: 28.4,
        description: '铸铁机壳固定定子铁心并构成电机外壳，外表面散热筋增大散热面积。剖切面可以看到机壳壁厚与两端法兰。',
        specs: [['材料', '灰铸铁 HT200'], ['剖切', '前上方 110°'], ['散热', '轴向散热筋']],
        material: '铸铁 / 防腐漆', accent: '#9fb8c4', anchor: [-1.1, 0.6, 1.15],
        explode: [0, 1.9, 0]
      },
      {
        id: 'statorCore', index: '02', name: '定子铁心', en: 'STATOR CORE', mass: 21.6,
        description: '0.5 mm 硅钢片叠压而成的定子铁心，内圆冲有 24 个槽，为旋转磁通提供低磁阻磁路，并嵌放三相绕组。',
        specs: [['材料', '0.5 mm 硅钢片'], ['槽数', '24'], ['叠长', '120 mm']],
        material: '冷轧硅钢片', accent: '#8fd8d0', anchor: [0.72, 0.86, 0.9],
        explode: [0, 0, 0]
      },
      {
        id: 'statorWinding', index: '03', name: '三相分布绕组', en: 'THREE-PHASE WINDING', mass: 9.4,
        description: 'U、V、W 三相绕组在定子槽内按 60° 相带分布，端部用铜线连成线圈组。三相电流合成出 4 极旋转磁场。',
        specs: [['接法', 'Y 接 / 380 V'], ['相带', '60° 分布'], ['绝缘', 'B 级']],
        material: '铜漆包线 / 槽绝缘', accent: '#e0a35f', anchor: [0.86, 0.5, 1.12],
        explode: [0, 0, 0]
      },
      {
        id: 'rotorCage', index: '04', name: '鼠笼转子', en: 'SQUIRREL-CAGE ROTOR', mass: 8.2,
        description: '转子铁心外圆嵌有 20 根铜导条，两端用端环短接成鼠笼。旋转磁场在导条中感应电动势与电流，与磁场作用产生电磁转矩。',
        specs: [['导条', '20 根铜导条'], ['端环', '两端铜环短接'], ['气隙', '0.8 mm']],
        material: '硅钢叠片 / 铜导条', accent: '#ffc66b', anchor: [0.45, 0.42, 0.55],
        explode: [0, 0, 0.75]
      },
      {
        id: 'shaft', index: '05', name: '转轴', en: 'SHAFT', mass: 4.8,
        description: '转轴传递电磁转矩，把机械功率输出给负载。剖切后可以看到轴伸、键槽以及转子铁心与轴的配合段。',
        specs: [['材料', '45 钢调质'], ['直径', 'Ø30 mm'], ['轴伸', '带键槽']],
        material: '合金结构钢', accent: '#c7d4dc', anchor: [0, 0.16, 2.3],
        explode: [0, 0, 2.1]
      },
      {
        id: 'fan', index: '06', name: '风扇与风罩', en: 'COOLING FAN & COWL', mass: 1.6,
        description: '外置轴流风扇随转子同轴旋转，把冷空气从风罩开口吸入并沿散热筋吹过机壳，属于 IC411 自扇冷冷却方式。',
        specs: [['形式', '轴流外风扇'], ['叶片', '7 片'], ['冷却', 'IC411']],
        material: '工程塑料 / 钢', accent: '#57dcff', anchor: [0.55, 0.45, 2.05],
        explode: [0, 0, 3.6]
      },
      {
        id: 'frontEndCap', index: '07', name: '前端盖', en: 'DRIVE-END BEARING CAP', mass: 3.2,
        description: '前端盖支承前轴承并定位转子，轴承室保证气隙均匀。端盖与机壳止口配合，承受转子的径向载荷。',
        specs: [['轴承', '6206 深沟球'], ['配合', '止口定位'], ['材料', '灰铸铁']],
        material: '铸铁 / 轴承钢', accent: '#7fa6b5', anchor: [1.1, 0.6, 1.55],
        explode: [0, 0, 2.6]
      },
      {
        id: 'rearEndCap', index: '08', name: '后端盖', en: 'NON-DRIVE-END CAP', mass: 2.8,
        description: '后端盖支承后轴承并封闭机壳非驱动端，与前端盖共同保证转子轴线与定子内圆同轴。',
        specs: [['轴承', '6206 深沟球'], ['密封', '骨架油封'], ['材料', '灰铸铁']],
        material: '铸铁 / 轴承钢', accent: '#7fa6b5', anchor: [-1.1, 0.55, -1.55],
        explode: [0, 0, -2.6]
      },
      {
        id: 'terminalBox', index: '09', name: '接线盒', en: 'TERMINAL BOX', mass: 1.4,
        description: '接线盒内是三相绕组的六个出线端，通过 U、V、W 与星点接线片选择 Y 接或 Δ 接，盒体带电缆密封接头。',
        specs: [['出线', 'U V W ×2'], ['接法', 'Y / Δ 可选'], ['防护', 'IP55']],
        material: '铸铝 / 绝缘件', accent: '#b49bff', anchor: [0, 2.18, 0.35],
        explode: [0, 2.8, 0]
      },
      {
        id: 'base', index: '10', name: '底座与铭牌', en: 'FEET & NAMEPLATE', mass: 6.5,
        description: '底脚把电机固定在基础上并承受转矩反力；铭牌记录功率、电压、频率、转速与接法，本机为教学样机数据。',
        specs: [['安装', 'B3 卧式底脚'], ['标准', 'GB/T 28575'], ['参数', '教学样机']],
        material: '型钢 / 铝铭牌', accent: '#adc0c8', anchor: [0, -1.62, 1.16],
        explode: [0, 0, 0]
      }
    ],
    controls: [
      {
        id: 'frequency', label: '供电频率', en: 'SUPPLY FREQUENCY', min: 10, max: 60, step: 1, value: 50,
        unit: 'Hz', digits: 0, accent: '#66e6c2', scaleMin: '10', scaleMax: '60', className: 'accent-mint'
      },
      {
        id: 'voltage', label: 'V/f 电压', en: 'V/F VOLTAGE', min: 0.7, max: 1.15, step: 0.01, value: 1,
        unit: 'p.u.', digits: 2, accent: '#57dcff', scaleMin: '0.70', scaleMax: '1.15', className: ''
      },
      {
        id: 'load', label: '负载转矩', en: 'LOAD TORQUE', min: 0, max: 45, step: 0.5, value: 18,
        unit: 'N·m', digits: 1, accent: '#ffc66b', scaleMin: '0', scaleMax: '45', className: 'accent-amber'
      }
    ],
    metrics: [
      { id: 'speed', label: 'ROTOR SPEED', unit: 'rpm', digits: 0, max: 1800, accent: '#57dcff' },
      { id: 'slip', label: 'SLIP', unit: '%', digits: 1, max: 100, accent: '#ffc66b' },
      { id: 'torque', label: 'AIR-GAP TORQUE', unit: 'N·m', digits: 1, max: 60, accent: '#66e6c2' },
      { id: 'efficiency', label: 'EFFICIENCY', unit: '%', digits: 1, max: 100, accent: '#b49bff' }
    ],
    dataFields: [
      { id: 'i1', label: 'I₁' },
      { id: 'pf', label: 'cosφ' },
      { id: 'p2', label: 'P₂' },
      { id: 'f2', label: 'f₂' }
    ],
    charts: [
      { id: 'ts', label: 'T-s 曲线', title: '电磁转矩—转差率' },
      { id: 'tn', label: 'T-n 曲线', title: '电磁转矩—转速' },
      { id: 'load', label: '电流 / 效率', title: '定子电流与效率—负载' }
    ],
    sim: {
      create() {
        return {
          t: 0, n: 0, rotorAngle: 0, fieldAngle: 0,
          rotorVisual: 0, fieldVisual: 0, animT: 0, glow: 0
        };
      },
      step(state, dt, inputs, visual) {
        const f = inputs.frequency;
        const v = statorVoltage(f, inputs.voltage);
        const ns = synchronousSpeed(f);
        const nsRad = ns * TAU / 60;
        const extras = visual.extras || {};
        let remaining = ML.clamp(dt, 0, 0.06);
        while (remaining > 1e-6) {
          const h = Math.min(0.004, remaining);
          remaining -= h;
          state.t += h;
          const op = operatingPoint(state.n, f, v);
          const omega = state.n * TAU / 60;
          let omegaNext = omega + (op.te - inputs.load - P.damping * omega) / P.j * h;
          if (omegaNext < 0) omegaNext = 0;
          state.n = omegaNext * 60 / TAU;
          state.rotorAngle += omegaNext * h;
          state.fieldAngle += nsRad * h;
          state.rotorVisual += omegaNext * h * P.visualScale;
          state.fieldVisual += nsRad * h * P.visualScale;
          state.glow = op.i2;
        }
        if (extras.fieldRotator) extras.fieldRotator.rotation.z = -state.fieldVisual;
        if (extras.cageRotator) extras.cageRotator.rotation.z = -state.rotorVisual;
        if (extras.rotorGroup) extras.rotorGroup.rotation.z = -state.rotorVisual;
        if (extras.fanSpin) extras.fanSpin.rotation.z = -state.rotorVisual;
      },
      onInput() {},
      animate(state, dt, inputs, visual) {
        state.animT += dt;
        const extras = visual.extras || {};
        const pulse = 0.5 + 0.5 * Math.sin(state.animT * 2.6);
        if (extras.fieldMaterials) {
          extras.fieldMaterials.forEach((material) => {
            const base = material.userData.baseOpacity === undefined ? 0.32 : material.userData.baseOpacity;
            material.opacity = base * (0.74 + 0.26 * pulse);
          });
        }
        if (extras.cageGlowMaterials) {
          const glow = ML.clamp(0.06 + Math.abs(state.glow) / 30, 0, 0.34);
          extras.cageGlowMaterials.forEach((material) => {
            material.opacity = glow * (0.7 + 0.3 * Math.sin(state.animT * 7.5));
          });
        }
      },
      readout(state, inputs) {
        const f = inputs.frequency;
        const v = statorVoltage(f, inputs.voltage);
        const op = operatingPoint(state.n, f, v);
        const slipPct = op.s * 100;
        const f2 = Math.abs(op.s) * f;
        const legend = this.legendFor();
        return {
          metrics: {
            speed: state.n,
            slip: slipPct,
            torque: op.te,
            efficiency: op.eff
          },
          data: {
            i1: op.i1.toFixed(2) + ' A',
            pf: op.pf.toFixed(2),
            p2: (op.pOut / 1000).toFixed(2) + ' kW',
            f2: f2.toFixed(2) + ' Hz'
          },
          chartNote: 'U₁ ' + v.toFixed(0) + ' V · V/f ' + (v / f).toFixed(2) + ' · f ' + f.toFixed(0) + ' Hz',
          chartReadout: 'T ' + op.te.toFixed(1) + ' N·m · n ' + state.n.toFixed(0) + ' rpm · s ' + slipPct.toFixed(1) + '%',
          legend: legend,
          stageMode: 'SQUIRREL CAGE / CUTAWAY',
          stageAngle: ML.mod(state.rotorAngle / DEG, 360)
        };
      },
      legendFor() {
        return '<span class="legend-item" style="color:#66e6c2"><i style="background:#66e6c2"></i>旋转磁场</span>' +
          '<span class="legend-item" style="color:#57dcff"><i style="background:#57dcff"></i>定子电流 / 风扇</span>' +
          '<span class="legend-item" style="color:#ffc66b"><i style="background:#ffc66b"></i>鼠笼导条 / 负载</span>';
      },
      drawChart(mode, ctx, w, h, state, inputs) {
        if (mode === 'ts') return drawTorqueSlip(ctx, w, h, state, inputs);
        if (mode === 'tn') return drawTorqueSpeed(ctx, w, h, state, inputs);
        return drawLoadCurves(ctx, w, h, state, inputs);
      }
    },
    build() {
      const root = new THREE.Group();
      const groups = {};
      const iron = ML.makeStandard(0x445e6b, 0.86, 0.34, { emissive: 0x0a1418, emissiveIntensity: 0.45, envMapIntensity: 0.62 });
      const ironDark = ML.makeStandard(0x22333c, 0.78, 0.44, { emissive: 0x060d10, emissiveIntensity: 0.35, envMapIntensity: 0.5 });
      const iron2 = ML.makeStandard(0x445e6b, 0.86, 0.34, { side: THREE.DoubleSide, emissive: 0x0a1418, emissiveIntensity: 0.45, envMapIntensity: 0.62 });
      const ironDark2 = ML.makeStandard(0x22333c, 0.78, 0.44, { side: THREE.DoubleSide, emissive: 0x060d10, emissiveIntensity: 0.35, envMapIntensity: 0.5 });
      const copperHi = ML.makeStandard(0xd08449, 0.7, 0.3, { emissive: 0x3a1405, emissiveIntensity: 0.55, envMapIntensity: 0.5 });
      const copperMid = ML.makeStandard(0xb26d3f, 0.78, 0.32, { emissive: 0x331203, emissiveIntensity: 0.5, envMapIntensity: 0.48 });
      const copperLow = ML.makeStandard(0x92552f, 0.8, 0.36, { emissive: 0x2a0e02, emissiveIntensity: 0.45, envMapIntensity: 0.44 });
      const paint = ML.makeStandard(0x2b4652, 0.38, 0.52, { emissive: 0x0a1b22, emissiveIntensity: 0.5, envMapIntensity: 0.42 });
      const paint2 = ML.makeStandard(0x2b4652, 0.38, 0.52, { side: THREE.DoubleSide, emissive: 0x0a1b22, emissiveIntensity: 0.5, envMapIntensity: 0.42 });
      const paintLight = ML.makeStandard(0x54727f, 0.4, 0.48, { emissive: 0x0d222b, emissiveIntensity: 0.45, envMapIntensity: 0.45 });
      const paintLight2 = ML.makeStandard(0x54727f, 0.4, 0.48, { side: THREE.DoubleSide, emissive: 0x0d222b, emissiveIntensity: 0.45, envMapIntensity: 0.45 });
      const steel = ML.Materials.steel();
      const darkSteel = ML.Materials.darkSteel();
      const brass = ML.Materials.brass();
      const polymer = ML.Materials.polymer();

      /* ---- 01 housing ---- */
      const housing = new THREE.Group();
      groups.housing = housing;
      root.add(housing);
      axialCylinder(housing, 1.62, 3.0, paint2, 0, 56, true);
      [1.46, -1.46].forEach((z) => {
        axialCylinder(housing, 1.68, 0.18, paintLight2, z, 56, true);
      });
      [85, -25].forEach((deg) => {
        const a = deg * DEG;
        ML.addBox(housing, 0.34, 0.09, 3.0, paintLight, Math.cos(a) * 1.52, Math.sin(a) * 1.52, 0, { rotation: [0, 0, a] });
      });
      for (let a = 130; a <= 335; a += 17) {
        const angle = a * DEG;
        ML.addBox(housing, 0.17, 0.06, 2.62, paintLight, Math.cos(angle) * 1.68, Math.sin(angle) * 1.68, 0, {
          rotation: [0, 0, angle],
          castShadow: true
        });
      }
      ML.addBox(housing, 0.5, 0.16, 0.5, paintLight, 0, 1.6, 0.35);

      /* ---- 02 stator core ---- */
      const statorCore = new THREE.Group();
      groups.statorCore = statorCore;
      root.add(statorCore);
      axialCylinder(statorCore, 1.28, 2.4, iron2, 0, 56, true);
      axialCylinder(statorCore, 1.02, 2.4, ironDark2, 0, 56, true);
      [1.2, -1.2].forEach((z) => faceRing(statorCore, 1.02, 1.28, z, iron2, 56));
      for (let i = 0; i < 24; i += 1) {
        const a = i / 24 * TAU;
        if (!keptAngle(a)) continue;
        radialBar(statorCore, 0.95, a, 0.13, 0.15, 2.4, 0, iron);
      }
      [85, 335].forEach((deg) => {
        const a = deg * DEG;
        ML.addBox(statorCore, 0.27, 0.07, 2.4, ironDark, Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0, { rotation: [0, 0, a] });
      });

      /* ---- 03 three-phase distributed winding ---- */
      const statorWinding = new THREE.Group();
      groups.statorWinding = statorWinding;
      root.add(statorWinding);
      const phaseMaterials = [copperHi, copperMid, copperLow];
      for (let i = 0; i < 24; i += 1) {
        const a = (i + 0.5) / 24 * TAU;
        if (!keptAngle(a)) continue;
        radialBar(statorWinding, 0.965, a, 0.17, 0.11, 2.55, 0, phaseMaterials[i % 3]);
      }
      for (let phase = 0; phase < 3; phase += 1) {
        const start = (90 + phase * 80) * DEG;
        [1.3, -1.3].forEach((z) => {
          const geo = new THREE.TorusGeometry(0.96, 0.055, 6, 26, 80 * DEG);
          const mesh = new THREE.Mesh(geo, phaseMaterials[phase]);
          mesh.rotation.z = start;
          mesh.position.z = z;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          statorWinding.add(mesh);
        });
      }
      // coil cross-section exposed on both cut faces
      [85, 335].forEach((deg) => {
        const a = deg * DEG;
        ML.addBox(statorWinding, 0.17, 0.035, 2.55, copperHi, Math.cos(a) * 0.965, Math.sin(a) * 0.965, 0, {
          rotation: [0, 0, a],
          castShadow: false
        });
      });

      /* ---- 04 squirrel-cage rotor ---- */
      const rotor = new THREE.Group();
      groups.rotorCage = rotor;
      root.add(rotor);
      axialCylinderFull(rotor, 0.85, 2.4, iron, 0, 44);
      for (let i = -3; i <= 3; i += 1) {
        const geo = new THREE.TorusGeometry(0.852, 0.006, 4, 36);
        const ring = new THREE.Mesh(geo, ironDark);
        ring.position.z = i * 0.15;
        ring.castShadow = false;
        rotor.add(ring);
      }
      for (let i = 0; i < 20; i += 1) {
        const a = i / 20 * TAU;
        radialBar(rotor, 0.815, a, 0.075, 0.06, 2.42, 0, copperHi);
      }
      [1.24, -1.24].forEach((z) => {
        const geo = new THREE.TorusGeometry(0.815, 0.062, 8, 40);
        const ring = new THREE.Mesh(geo, copperHi);
        ring.position.z = z;
        ring.castShadow = true;
        ring.receiveShadow = true;
        rotor.add(ring);
      });

      /* ---- 05 shaft ---- */
      const shaft = new THREE.Group();
      groups.shaft = shaft;
      root.add(shaft);
      axialCylinderFull(shaft, 0.15, 4.5, steel, 0.25, 24);
      axialCylinderFull(shaft, 0.19, 0.22, darkSteel, -0.42, 20);
      ML.addBox(shaft, 0.06, 0.06, 0.5, darkSteel, 0, 0.16, 2.28);

      /* ---- 06 cooling fan + cowl ---- */
      const fan = new THREE.Group();
      groups.fan = fan;
      root.add(fan);
      axialCylinder(fan, 0.8, 0.5, paintLight2, 2.0, 48, true);
      faceRing(fan, 0.72, 0.8, 2.25, paintLight2, 48);
      faceRing(fan, 0.72, 0.8, 1.75, paintLight2, 48);
      const fanSpin = new THREE.Group();
      fanSpin.position.z = 2.0;
      fan.add(fanSpin);
      axialCylinderFull(fanSpin, 0.2, 0.28, darkSteel, 0, 20);
      for (let i = 0; i < 7; i += 1) {
        const a = i / 7 * TAU;
        const blade = ML.addBox(fanSpin, 0.52, 0.035, 0.14, polymer, Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0, {
          rotation: [0, 0.42, a],
          castShadow: true
        });
        blade.receiveShadow = true;
      }

      /* ---- 07 front end cap ---- */
      const frontEndCap = new THREE.Group();
      groups.frontEndCap = frontEndCap;
      root.add(frontEndCap);
      axialCylinder(frontEndCap, 1.4, 0.3, paintLight2, 1.45, 48, true);
      faceRing(frontEndCap, 0.22, 1.34, 1.56, paintLight2, 48);
      axialCylinderFull(frontEndCap, 0.32, 0.3, paintLight, 1.66, 24);
      axialCylinderFull(frontEndCap, 0.23, 0.08, brass, 1.82, 20);
      for (let i = 0; i < 8; i += 1) {
        const a = i / 8 * TAU;
        if (!keptAngle(a)) continue;
        ML.addBolt(frontEndCap, Math.cos(a) * 1.16, Math.sin(a) * 1.16, 1.62, 'z', brass, 0.045, 0.05);
      }

      /* ---- 08 rear end cap ---- */
      const rearEndCap = new THREE.Group();
      groups.rearEndCap = rearEndCap;
      root.add(rearEndCap);
      axialCylinder(rearEndCap, 1.4, 0.3, paintLight2, -1.45, 48, true);
      faceRing(rearEndCap, 0.22, 1.34, -1.56, paintLight2, 48);
      axialCylinderFull(rearEndCap, 0.32, 0.3, paintLight, -1.66, 24);
      axialCylinderFull(rearEndCap, 0.23, 0.08, brass, -1.82, 20);
      for (let i = 0; i < 8; i += 1) {
        const a = i / 8 * TAU;
        if (!keptAngle(a)) continue;
        ML.addBolt(rearEndCap, Math.cos(a) * 1.16, Math.sin(a) * 1.16, -1.62, 'z', brass, 0.045, 0.05);
      }

      /* ---- 09 terminal box ---- */
      const terminalBox = new THREE.Group();
      groups.terminalBox = terminalBox;
      root.add(terminalBox);
      ML.addBox(terminalBox, 0.74, 0.44, 0.62, paintLight, 0, 1.87, 0.35, { edges: true, edgeColor: 0x86a6b4, edgeOpacity: 0.16 });
      ML.addBox(terminalBox, 0.8, 0.09, 0.68, paint, 0, 2.13, 0.35, { edges: true, edgeColor: 0x86a6b4, edgeOpacity: 0.12 });
      [-0.22, 0, 0.22].forEach((x) => {
        ML.addCylinder(terminalBox, 0.05, 0.05, 0.14, 12, brass, x, 1.82, 0.72, 'z');
        ML.addCylinder(terminalBox, 0.065, 0.065, 0.05, 12, darkSteel, x, 1.82, 0.79, 'z');
      });
      ML.addTextPlane(terminalBox, 'U  V  W', [0, 1.88, 0.665], 0.6, 0.17, {
        color: 'rgba(102,230,194,0.92)', fontPx: 64
      });

      /* ---- 10 feet + base + nameplate ---- */
      const base = new THREE.Group();
      groups.base = base;
      root.add(base);
      [0.9, -0.9].forEach((z) => {
        ML.addBox(base, 2.0, 0.2, 0.55, paintLight, 0, -1.72, z, { edges: true, edgeColor: 0x7e9ca8, edgeOpacity: 0.14 });
      });
      ML.addBox(base, 2.4, 0.1, 2.1, paint, 0, -1.86, 0.1, { edges: true, edgeColor: 0x7e9ca8, edgeOpacity: 0.12 });
      ML.addTextPlane(base, '4 kW · 380 V · 50 Hz · 1440 r/min', [0, -1.87, 1.16], 1.7, 0.13, {
        color: 'rgba(203,224,230,0.86)', fontPx: 54
      });
      ML.addBox(base, 0.16, 0.02, 0.16, brass, 0.9, -1.8, 0.55, { castShadow: false });

      /* ---- rotating field overlay ---- */
      const fieldGroup = new THREE.Group();
      root.add(fieldGroup);
      const fieldRotator = new THREE.Group();
      const cageRotator = new THREE.Group();
      fieldGroup.add(fieldRotator);
      fieldGroup.add(cageRotator);
      const fieldMaterials = [];
      const mintField = fieldMaterial(0x66e6c2, 0.4);
      const cyanField = fieldMaterial(0x57dcff, 0.34);
      fieldMaterials.push(mintField, cyanField);
      // 4-pole halo: one short arc per pole in the air gap, with a tangential head
      for (let i = 0; i < 4; i += 1) {
        const material = i % 2 === 0 ? mintField : cyanField;
        const geo = new THREE.TorusGeometry(0.93, 0.016, 5, 20, 42 * DEG);
        const arc = new THREE.Mesh(geo, material);
        arc.rotation.z = i * Math.PI / 2 + 8 * DEG;
        arc.renderOrder = 8;
        fieldRotator.add(arc);
        const headAngle = arc.rotation.z + 42 * DEG;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), material);
        head.position.set(Math.cos(headAngle) * 0.93, Math.sin(headAngle) * 0.93, 0);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(headAngle), Math.cos(headAngle), 0));
        head.renderOrder = 8;
        fieldRotator.add(head);
        const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.5, 5);
        const axisLine = new THREE.Mesh(lineGeo, material);
        axisLine.position.set(Math.cos(i * Math.PI / 2) * 0.93, Math.sin(i * Math.PI / 2) * 0.93, 0);
        axisLine.rotation.x = Math.PI / 2;
        axisLine.renderOrder = 8;
        fieldRotator.add(axisLine);
      }
      const cageGlowMaterial = fieldMaterial(0x66e6c2, 0.2);
      const cageGlowMaterials = [cageGlowMaterial];
      for (let i = 0; i < 8; i += 1) {
        const a = i / 8 * TAU;
        const geo = new THREE.CylinderGeometry(0.015, 0.015, 2.3, 5);
        geo.rotateX(Math.PI / 2);
        const glow = new THREE.Mesh(geo, cageGlowMaterial);
        glow.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0);
        glow.renderOrder = 7;
        cageRotator.add(glow);
      }

      return {
        root: root,
        groups: groups,
        extras: {
          fieldGroup: fieldGroup,
          fieldRotator: fieldRotator,
          cageRotator: cageRotator,
          fieldMaterials: fieldMaterials,
          cageGlowMaterials: cageGlowMaterials,
          rotorGroup: rotor,
          fanSpin: fanSpin
        }
      };
    },
    knowledge: [
      {
        id: 'rotating', kicker: '01 / ROTATING FIELD', title: '旋转磁场',
        lead: '三相定子绕组在空间上互差 120° 电角度，通入互差 120° 的三相交流电流后，合成磁动势不再脉动，而是一个幅值恒定、匀速旋转的磁场。',
        html: `
          <div class="topic-section"><h4>三相合成磁动势</h4><p>每相绕组产生的脉振磁动势可以分解为两个反向旋转的磁场，三相的分解结果中反向分量互相抵消、正向分量叠加，于是气隙中只剩下一个旋转磁场。它切割转子导条，是异步电机能量转换的源头。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>SYNCHRONOUS SPEED</span><strong>n<em>s</em> = 60 f / p</strong></div>
            <div class="formula-card"><span>THIS MACHINE</span><strong>n<em>s</em> = 60 × 50 / 2 = 1500 rpm</strong></div>
            <div class="formula-card"><span>POLES</span><strong>2p = 4 · p = 2</strong></div>
            <div class="formula-card"><span>FIELD SPEED</span><strong>磁场转速只由 f 和 p 决定</strong></div>
          </div>
          <div class="topic-section"><h4>四极磁场</h4><p>本样机为 4 极（p = 2 对极），气隙圆周上交替出现 N、S、N、S 四个磁极，极距为 90° 机械角。磁场每转过 360° 机械角，电流变化 2 个电周期，因此机械转速只有同步电角速度的 1/2。</p></div>
          <div class="callout"><b>观察</b><p>按 F 显示旋转磁场：薄荷与青色的光环和箭头就是 4 极磁场，改变频率滑块，旋转快慢随之变化（已按 0.06 比例慢放）。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="field">显示旋转磁场</button><button type="button" data-knowledge-action="run">运行仿真</button></div>
        `
      },
      {
        id: 'slip', kicker: '02 / SLIP & ROTOR FREQUENCY', title: '转差与转子频率',
        lead: '转子转速必须略低于同步转速，转子导条与旋转磁场之间才有相对运动，才能感应出电流并产生转矩。转差率 s 衡量这种相对运动的大小。',
        html: `
          <div class="topic-section"><h4>转差率定义</h4><p>同步转速与转子转速之差对同步转速的比值称为转差率。空载时 s 只有千分之几；额定负载时通常为 2%–5%；堵转（n = 0）时 s = 1。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>SLIP</span><strong>s = (n<em>s</em> − n) / n<em>s</em></strong></div>
            <div class="formula-card"><span>ROTOR FREQUENCY</span><strong>f<em>2</em> = s · f</strong></div>
            <div class="formula-card"><span>ROTOR EMF</span><strong>E<em>2s</em> = s · E<em>20</em></strong></div>
            <div class="formula-card"><span>SPEED</span><strong>n = (1 − s) · n<em>s</em></strong></div>
          </div>
          <div class="topic-section"><h4>转子频率很低</h4><p>额定运行时转子频率只有 1–3 Hz，转子铁心的铁耗和漏抗都很小；启动瞬间转子频率等于电源频率（50 Hz），转子回路接近短路，因此启动电流很大、功率因数很低。</p></div>
          <div class="callout"><b>观察</b><p>把负载转矩调大，转速下降、转差率上升，数据栏中的 f₂ 随之增大；负载超过最大转矩时会堵转，转速跌到 0、s = 100%。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="run">运行并加载</button><button type="button" data-knowledge-action="field">显示磁场</button></div>
        `
      },
      {
        id: 'kloss', kicker: '03 / KLOSS & EQUIVALENT CIRCUIT', title: 'Kloss 公式与等效电路',
        lead: '把转子折算到定子侧后，异步电机可以看成一台带励磁支路的变压器。电磁转矩用 Kloss 公式描述，呈 S 形曲线。',
        html: `
          <div class="topic-section"><h4>简化等效电路</h4><p>定子电阻 R₁、定子漏抗 X₁，励磁支路 R<em>m</em> 与 X<em>m</em>，以及折算后的转子电阻 R₂′/s 与漏抗 X₂′。转子电阻随转差变化，是异步电机区别于变压器的地方。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>KLOSS</span><strong>T<em>e</em> = 2T<em>max</em> / (s/s<em>m</em> + s<em>m</em>/s)</strong></div>
            <div class="formula-card"><span>PEAK TORQUE</span><strong>T<em>max</em> ∝ (U / f)²</strong></div>
            <div class="formula-card"><span>CRITICAL SLIP</span><strong>s<em>m</em> = R₂′ / X₂′</strong></div>
            <div class="formula-card"><span>STABLE BRANCH</span><strong>0 &lt; s &lt; s<em>m</em> 时稳定运行</strong></div>
          </div>
          <div class="topic-section"><h4>稳定运行区</h4><p>T-s 曲线在 s = s<em>m</em> 处达到最大转矩。负载增大时工作点沿曲线右移，只有 s &lt; s<em>m</em> 的一侧是稳定的；超过最大转矩后转矩反而减小，电机进入堵转。</p></div>
          <div class="callout"><b>观察</b><p>在右侧切换到 T-s / T-n 曲线，青色点就是当前工作点，琥珀虚线为负载转矩。剖解模式下可以看到定子槽、鼠笼导条与端环的相对位置。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="explode">剖解结构</button><button type="button" data-knowledge-action="run">运行仿真</button></div>
        `
      },
      {
        id: 'vf', kicker: '04 / V-F OPERATION', title: 'V/f 变频运行',
        lead: '变频调速的关键是保持磁通近似恒定：电压与频率按同一比例变化，磁通就不会随频率改变。低频时还要额外提升电压，补偿定子电阻压降。',
        html: `
          <div class="topic-section"><h4>恒磁通条件</h4><p>由 U ≈ 4.44 f N Φ 可知，若 U/f 恒定，主磁通 Φ 基本不变，最大转矩也基本不变，这就是恒转矩调速区。频率超过额定值后电压无法继续升高，只能弱磁运行，转矩随 f 增大而下降。</p></div>
          <div class="formula-grid">
            <div class="formula-card"><span>CONSTANT FLUX</span><strong>U / f ≈ 常数</strong></div>
            <div class="formula-card"><span>LOW-FREQUENCY BOOST</span><strong>U = k f + ΔU</strong></div>
            <div class="formula-card"><span>TORQUE CAPABILITY</span><strong>T<em>max</em> ∝ (U/f)²</strong></div>
            <div class="formula-card"><span>THIS DRIVE</span><strong>10–60 Hz · 380 V / 50 Hz</strong></div>
          </div>
          <div class="topic-section"><h4>低频补偿</h4><p>频率很低时，定子电阻上的压降在电压中占比变大，实际磁通会减弱、最大转矩下降。变频器通常在低频段把电压抬高一些，本样机按 U = 380·f/50 + 22·(1 − f/50) 补偿，可用第二个滑块微调。</p></div>
          <div class="callout"><b>观察</b><p>把频率降到 10 Hz，可以看到转速约 300 rpm 以下、转差率明显变大；把 V/f 电压调到 0.7 p.u.，磁通减弱、最大转矩与效率都会下降。</p></div>
          <div class="knowledge-actions"><button type="button" data-knowledge-action="field">显示旋转磁场</button><button type="button" data-knowledge-action="reset">复位视角</button></div>
        `
      }
    ]
  });

  /* ---------------- chart implementations ---------------- */

  function drawTorqueSlip(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    C.clear(ctx, w, h);
    const f = inputs.frequency;
    const v = statorVoltage(f, inputs.voltage);
    const flux = fluxPerUnit(f, v);
    const tmax = P.tMaxRated * flux * flux;
    const sm = slipForFrequency(f);
    const yMax = Math.max(50, tmax * 1.12);
    const box = C.frame(w, h, { left: 42, right: 18, top: 16, bottom: 26 });
    C.grid(ctx, box, 5, 4);
    C.border(ctx, box);
    const frame = C.frameFor(box, 0, 100, 0, yMax);
    C.axisTicks(ctx, frame, { xTicks: 5, yTicks: 4, yDigits: 0, xUnit: 's %', yUnit: 'T N·m' });
    const points = [];
    for (let i = 0; i <= 100; i += 1) {
      const s = i / 100;
      const torque = 2 * tmax * s * sm / (s * s + sm * sm);
      points.push([frame.x(i), frame.y(torque)]);
    }
    C.line(ctx, points, C.colors.mint, 1.8, { glow: 6 });
    const load = Math.max(0, inputs.load);
    C.line(ctx, [[frame.x(0), frame.y(load)], [frame.x(100), frame.y(load)]], 'rgba(255,198,107,0.9)', 1.1, { dash: [4, 4], glow: 2 });
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(102,230,194,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frame.x(sm * 100), box.bottom);
    ctx.lineTo(frame.x(sm * 100), frame.y(tmax));
    ctx.stroke();
    ctx.restore();
    C.label(ctx, 's_m ' + (sm * 100).toFixed(0) + '%', frame.x(sm * 100) + 4, box.top + 10, { color: 'rgba(102,230,194,0.72)', size: 7.5 });
    const ns = synchronousSpeed(f);
    const sNow = ns > 0 ? ML.clamp((ns - state.n) / ns, 0, 1) : 1;
    const tNow = torqueForSlip(sNow, f, v);
    const px = frame.x(sNow * 100);
    const py = frame.y(tNow);
    C.dot(ctx, px, py, C.colors.cyan, 3.6);
    C.label(ctx, 's ' + (sNow * 100).toFixed(1) + '%', ML.clamp(px + 8, box.left + 4, box.right - 52), ML.clamp(py - 8, box.top + 10, box.bottom - 4), { color: C.colors.cyan, size: 8 });
    C.legendDot(ctx, box.right - 94, box.top + 9, '#66e6c2', 'Te(s)');
    C.legendDot(ctx, box.right - 94, box.top + 20, '#ffc66b', 'T_L');
  }

  function drawTorqueSpeed(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    C.clear(ctx, w, h);
    const f = inputs.frequency;
    const v = statorVoltage(f, inputs.voltage);
    const flux = fluxPerUnit(f, v);
    const tmax = P.tMaxRated * flux * flux;
    const sm = slipForFrequency(f);
    const ns = synchronousSpeed(f);
    const yMax = Math.max(50, tmax * 1.12);
    const box = C.frame(w, h, { left: 42, right: 18, top: 16, bottom: 26 });
    C.grid(ctx, box, 5, 4);
    C.border(ctx, box);
    const frame = C.frameFor(box, 0, ns, 0, yMax);
    C.axisTicks(ctx, frame, { xTicks: 5, yTicks: 4, yDigits: 0, xUnit: 'n r/min', yUnit: 'T N·m' });
    const points = [];
    for (let i = 0; i <= 120; i += 1) {
      const n = ns * i / 120;
      const s = (ns - n) / ns;
      const torque = 2 * tmax * s * sm / (s * s + sm * sm);
      points.push([frame.x(n), frame.y(torque)]);
    }
    C.line(ctx, points, C.colors.mint, 1.8, { glow: 6 });
    const load = Math.max(0, inputs.load);
    C.line(ctx, [[frame.x(0), frame.y(load)], [frame.x(ns), frame.y(load)]], 'rgba(255,198,107,0.9)', 1.1, { dash: [4, 4], glow: 2 });
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(87,220,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.right, box.bottom);
    ctx.lineTo(box.right, box.top);
    ctx.stroke();
    ctx.restore();
    C.label(ctx, 'n_s ' + ns.toFixed(0), box.right - 2, box.top + 10, { color: 'rgba(87,220,255,0.62)', size: 7.5, align: 'right' });
    const op = operatingPoint(state.n, f, v);
    const nx = ML.clamp(state.n, 0, ns);
    const px = frame.x(nx);
    const py = frame.y(op.te);
    C.dot(ctx, px, py, C.colors.cyan, 3.6);
    C.label(ctx, 'n ' + state.n.toFixed(0) + ' rpm', ML.clamp(px + 8, box.left + 4, box.right - 74), ML.clamp(py - 8, box.top + 10, box.bottom - 4), { color: C.colors.cyan, size: 8 });
    C.legendDot(ctx, box.right - 94, box.top + 9, '#66e6c2', 'Te(n)');
    C.legendDot(ctx, box.right - 94, box.top + 20, '#ffc66b', 'T_L');
  }

  function drawLoadCurves(ctx, w, h, state, inputs) {
    const C = ML.Charts;
    C.clear(ctx, w, h);
    const f = inputs.frequency;
    const v = statorVoltage(f, inputs.voltage);
    const ns = synchronousSpeed(f);
    const curve = [];
    let maxI = 4;
    for (let tl = 0; tl <= 45.001; tl += 0.5) {
      const s = steadySlip(tl, f, v);
      const op = operatingPoint(ns * (1 - s), f, v);
      if (op.i1 > maxI) maxI = op.i1;
      curve.push({ tl: tl, i1: op.i1, eff: op.eff });
    }
    const box = C.frame(w, h, { left: 40, right: 26, top: 16, bottom: 26 });
    C.grid(ctx, box, 5, 4);
    C.border(ctx, box);
    const left = C.frameFor(box, 0, 45, 0, maxI * 1.12);
    const right = C.frameFor(box, 0, 45, 0, 100);
    C.axisTicks(ctx, left, { xTicks: 5, yTicks: 4, yDigits: 0, xUnit: 'T_L N·m', yUnit: 'I₁ A' });
    for (let k = 0; k <= 4; k += 1) {
      const value = k * 25;
      C.label(ctx, value.toFixed(0), box.right + 5, right.y(value) + 3, { size: 7, color: 'rgba(102,230,194,0.75)' });
    }
    C.line(ctx, curve.map((p) => [left.x(p.tl), left.y(p.i1)]), C.colors.cyan, 1.7, { glow: 5 });
    C.line(ctx, curve.map((p) => [right.x(p.tl), right.y(p.eff)]), C.colors.mint, 1.7, { glow: 5 });
    const op = operatingPoint(state.n, f, v);
    const lx = left.x(ML.clamp(inputs.load, 0, 45));
    C.dot(ctx, lx, left.y(op.i1), C.colors.cyan, 3.4);
    C.dot(ctx, lx, right.y(op.eff), C.colors.mint, 3.4);
    C.label(ctx, 'η %', box.right + 5, box.top + 44, { size: 7, color: 'rgba(102,230,194,0.75)' });
    C.legendDot(ctx, box.left + 4, box.top + 9, '#57dcff', 'I₁');
    C.legendDot(ctx, box.left + 44, box.top + 9, '#66e6c2', 'η');
  }
})(window);
