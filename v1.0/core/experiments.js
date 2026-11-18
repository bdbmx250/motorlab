/* MotorLab guided measurement experiments.
 * Each experiment is a sequence of manual record points. Students set the controls,
 * wait for the readout, then press "record"; the lab captures the current values.
 */
(function (ML) {
  const near = (value, target, tolerance) => Math.abs(Number(value) - Number(target)) <= tolerance;
  const fixed = (value, digits) => Number(value).toFixed(digits === undefined ? 1 : digits);

  ML.experiments = {
    transformer: [
      {
        id: 'ratio',
        index: '01',
        title: '变比与空载测量',
        en: 'TURNS RATIO / NO-LOAD',
        accent: '#57dcff',
        goal: '在空载条件下测量三组一次电压与二次电压，计算变比 K，并记录空载损耗 P₀。',
        intro: '保持二次侧空载，改变一次电压。每次待 U₂、I₁ 稳定后记录数据。',
        columns: [
          { key: 'u1', label: 'U₁ / kV' },
          { key: 'u2', label: 'U₂ / V' },
          { key: 'i0', label: 'I₀ / A' },
          { key: 'p0', label: 'P₀ / kW' },
          { key: 'k', label: 'K = U₁/U₂' }
        ],
        steps: [
          {
            title: '9.5 kV 空载点',
            instruction: '把负载率调到 0%，一次电压调到 9.5 kV，待读数稳定后记录。',
            setup: { load: 0, primaryVoltage: 9.5, powerFactor: 0.85 },
            check: (ctx) => ctx.inputs.load <= 1 && near(ctx.inputs.primaryVoltage, 9.5, 0.06),
            record: true,
            capture: (ctx) => ({
              u1: fixed(ctx.inputs.primaryVoltage, 1),
              u2: fixed(ctx.metrics.u2, 0),
              i0: fixed(ctx.metrics.i1, 2),
              p0: ctx.data.losses,
              k: fixed(ctx.inputs.primaryVoltage * 1000 / Math.max(1, ctx.metrics.u2), 2)
            })
          },
          {
            title: '10.0 kV 额定点',
            instruction: '保持空载，把一次电压调到 10.0 kV，待读数稳定后记录。',
            setup: { load: 0, primaryVoltage: 10, powerFactor: 0.85 },
            check: (ctx) => ctx.inputs.load <= 1 && near(ctx.inputs.primaryVoltage, 10, 0.06),
            record: true,
            capture: (ctx) => ({
              u1: fixed(ctx.inputs.primaryVoltage, 1),
              u2: fixed(ctx.metrics.u2, 0),
              i0: fixed(ctx.metrics.i1, 2),
              p0: ctx.data.losses,
              k: fixed(ctx.inputs.primaryVoltage * 1000 / Math.max(1, ctx.metrics.u2), 2)
            })
          },
          {
            title: '10.5 kV 空载点',
            instruction: '保持空载，把一次电压调到 10.5 kV，待读数稳定后记录。',
            setup: { load: 0, primaryVoltage: 10.5, powerFactor: 0.85 },
            check: (ctx) => ctx.inputs.load <= 1 && near(ctx.inputs.primaryVoltage, 10.5, 0.06),
            record: true,
            capture: (ctx) => ({
              u1: fixed(ctx.inputs.primaryVoltage, 1),
              u2: fixed(ctx.metrics.u2, 0),
              i0: fixed(ctx.metrics.i1, 2),
              p0: ctx.data.losses,
              k: fixed(ctx.inputs.primaryVoltage * 1000 / Math.max(1, ctx.metrics.u2), 2)
            })
          }
        ],
        conclusion: '三组数据的 K 基本一致，说明变比由绕组匝数决定；空载损耗 P₀ 近似为铁耗，随一次电压升高而增大。'
      },
      {
        id: 'load',
        index: '02',
        title: '负载特性与电压调整',
        en: 'LOAD / REGULATION',
        accent: '#66e6c2',
        goal: '保持一次电压 10 kV、功率因数 0.85，记录 0%、60%、100% 负载下的 U₂、ΔU 和效率。',
        intro: '负载率改变后，二次电压会下降。等 U₂ 与效率读数稳定后再记录。',
        columns: [
          { key: 'load', label: '负载率' },
          { key: 'u2', label: 'U₂ / V' },
          { key: 'du', label: 'ΔU' },
          { key: 'eta', label: 'η / %' }
        ],
        steps: [
          {
            title: '空载点',
            instruction: '一次电压 10 kV，功率因数 0.85，负载率调到 0%，记录 U₂、ΔU、η。',
            setup: { primaryVoltage: 10, powerFactor: 0.85, load: 0 },
            check: (ctx) => ctx.inputs.load <= 1 && near(ctx.inputs.primaryVoltage, 10, 0.06),
            record: true,
            capture: (ctx) => ({
              load: '0%',
              u2: fixed(ctx.metrics.u2, 0),
              du: ctx.data.regulation,
              eta: ctx.metrics.efficiency > 0.05 ? fixed(ctx.metrics.efficiency, 1) : '—'
            })
          },
          {
            title: '60% 负载点',
            instruction: '负载率调到 60%，保持一次电压与功率因数不变，记录数据。',
            setup: { primaryVoltage: 10, powerFactor: 0.85, load: 60 },
            check: (ctx) => near(ctx.inputs.load, 60, 1) && near(ctx.inputs.primaryVoltage, 10, 0.06),
            record: true,
            capture: (ctx) => ({
              load: '60%',
              u2: fixed(ctx.metrics.u2, 0),
              du: ctx.data.regulation,
              eta: fixed(ctx.metrics.efficiency, 1)
            })
          },
          {
            title: '100% 负载点',
            instruction: '负载率调到 100%，保持一次电压与功率因数不变，记录数据。',
            setup: { primaryVoltage: 10, powerFactor: 0.85, load: 100 },
            check: (ctx) => near(ctx.inputs.load, 100, 1) && near(ctx.inputs.primaryVoltage, 10, 0.06),
            record: true,
            capture: (ctx) => ({
              load: '100%',
              u2: fixed(ctx.metrics.u2, 0),
              du: ctx.data.regulation,
              eta: fixed(ctx.metrics.efficiency, 1)
            })
          }
        ],
        conclusion: '负载率升高时，二次电压 U₂ 下降，电压调整率 ΔU 增大；效率在接近额定负载时较高。'
      }
    ],

    dc: [
      {
        id: 'noLoad',
        index: '01',
        title: '空载励磁特性',
        en: 'NO-LOAD / FIELD',
        accent: '#ffc66b',
        goal: '保持负载转矩为 0、电枢电压 220 V，测量不同励磁电流下的 E、n 和 Iₐ。',
        intro: '他励直流电机空载时，改变励磁电流会改变磁通，从而改变空载转速。',
        columns: [
          { key: 'if', label: 'I_f / A' },
          { key: 'emf', label: 'E' },
          { key: 'n', label: 'n / rpm' },
          { key: 'ia', label: 'Iₐ / A' }
        ],
        steps: [
          {
            title: 'I_f = 0.8 A',
            instruction: '负载转矩调到 0，电枢电压 220 V，励磁电流 0.8 A，稳定后记录。',
            setup: { loadTorque: 0, armatureVoltage: 220, fieldCurrent: 0.8 },
            check: (ctx) => ctx.inputs.loadTorque <= 0.2 && near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 0.8, 0.02),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              emf: ctx.data.emf,
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2)
            })
          },
          {
            title: 'I_f = 1.1 A',
            instruction: '保持空载与 220 V，把励磁电流调到 1.1 A，稳定后记录。',
            setup: { loadTorque: 0, armatureVoltage: 220, fieldCurrent: 1.1 },
            check: (ctx) => ctx.inputs.loadTorque <= 0.2 && near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 1.1, 0.02),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              emf: ctx.data.emf,
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2)
            })
          },
          {
            title: 'I_f = 1.4 A',
            instruction: '保持空载与 220 V，把励磁电流调到 1.4 A，稳定后记录。',
            setup: { loadTorque: 0, armatureVoltage: 220, fieldCurrent: 1.4 },
            check: (ctx) => ctx.inputs.loadTorque <= 0.2 && near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 1.4, 0.02),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              emf: ctx.data.emf,
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2)
            })
          }
        ],
        conclusion: '励磁电流增大时磁通增大，空载转速下降；E 仍近似等于电枢电压减去电枢压降。'
      },
      {
        id: 'mech',
        index: '02',
        title: '机械特性',
        en: 'MECHANICAL CHARACTERISTIC',
        accent: '#57dcff',
        goal: '保持电枢电压 220 V、励磁电流 1.1 A，测量 4、12、20 N·m 负载下的 n、Iₐ 和效率。',
        intro: '直流电机机械特性近似为一条下降的直线：负载增大，转速下降，电枢电流上升。',
        columns: [
          { key: 't', label: 'T_L / N·m' },
          { key: 'n', label: 'n / rpm' },
          { key: 'ia', label: 'Iₐ / A' },
          { key: 'eta', label: 'η / %' }
        ],
        steps: [
          {
            title: '4 N·m 负载点',
            instruction: '电枢电压 220 V，励磁电流 1.1 A，负载转矩 4 N·m，稳定后记录。',
            setup: { armatureVoltage: 220, fieldCurrent: 1.1, loadTorque: 4 },
            check: (ctx) => near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 1.1, 0.02) && near(ctx.inputs.loadTorque, 4, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2),
              eta: fixed(ctx.metrics.efficiency, 1)
            })
          },
          {
            title: '12 N·m 负载点',
            instruction: '保持电压和励磁不变，负载转矩调到 12 N·m，稳定后记录。',
            setup: { armatureVoltage: 220, fieldCurrent: 1.1, loadTorque: 12 },
            check: (ctx) => near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 1.1, 0.02) && near(ctx.inputs.loadTorque, 12, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2),
              eta: fixed(ctx.metrics.efficiency, 1)
            })
          },
          {
            title: '20 N·m 负载点',
            instruction: '保持电压和励磁不变，负载转矩调到 20 N·m，稳定后记录。',
            setup: { armatureVoltage: 220, fieldCurrent: 1.1, loadTorque: 20 },
            check: (ctx) => near(ctx.inputs.armatureVoltage, 220, 1) && near(ctx.inputs.fieldCurrent, 1.1, 0.02) && near(ctx.inputs.loadTorque, 20, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              n: fixed(ctx.metrics.speed, 0),
              ia: fixed(ctx.metrics.current, 2),
              eta: fixed(ctx.metrics.efficiency, 1)
            })
          }
        ],
        conclusion: '负载转矩增大时，电枢电流增大、转速下降，验证直流电机的下降型机械特性。'
      }
    ],

    induction: [
      {
        id: 'slip',
        index: '01',
        title: '转差率与负载',
        en: 'SLIP / LOAD',
        accent: '#66e6c2',
        goal: '保持 50 Hz、V/f = 1.0，测量 0、18、30 N·m 下的转速、转差率、定子电流和功率因数。',
        intro: '异步电机必须有转差才能产生转矩。负载增大时，转速下降、转差率上升。',
        columns: [
          { key: 't', label: 'T_L / N·m' },
          { key: 'n', label: 'n / rpm' },
          { key: 's', label: 's / %' },
          { key: 'i1', label: 'I₁ / A' },
          { key: 'pf', label: 'cosφ' }
        ],
        steps: [
          {
            title: '空载点',
            instruction: '频率 50 Hz，V/f 电压 1.0，负载转矩调到 0，待转速稳定后记录。',
            setup: { frequency: 50, voltage: 1, load: 0 },
            check: (ctx) => near(ctx.inputs.frequency, 50, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && ctx.inputs.load <= 0.2,
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.load, 1),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1,
              pf: ctx.data.pf
            })
          },
          {
            title: '18 N·m 负载点',
            instruction: '保持 50 Hz、V/f = 1.0，负载转矩调到 18 N·m，待转速稳定后记录。',
            setup: { frequency: 50, voltage: 1, load: 18 },
            check: (ctx) => near(ctx.inputs.frequency, 50, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && near(ctx.inputs.load, 18, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.load, 1),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1,
              pf: ctx.data.pf
            })
          },
          {
            title: '30 N·m 负载点',
            instruction: '保持 50 Hz、V/f = 1.0，负载转矩调到 30 N·m，待转速稳定后记录。',
            setup: { frequency: 50, voltage: 1, load: 30 },
            check: (ctx) => near(ctx.inputs.frequency, 50, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && near(ctx.inputs.load, 30, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.load, 1),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1,
              pf: ctx.data.pf
            })
          }
        ],
        conclusion: '负载转矩增大时，转速下降、转差率增大，定子电流也随之增大；空载转差率接近 0 但不等于 0。'
      },
      {
        id: 'vf',
        index: '02',
        title: 'V/f 变频调速',
        en: 'V/F VARIABLE FREQUENCY',
        accent: '#57dcff',
        goal: '保持负载 10 N·m、V/f = 1.0，测量 50、30、10 Hz 下的转速和转差率。',
        intro: 'V/f 控制保持磁通近似恒定，同步转速随频率成比例变化。',
        columns: [
          { key: 'f', label: 'f / Hz' },
          { key: 'n', label: 'n / rpm' },
          { key: 's', label: 's / %' },
          { key: 'i1', label: 'I₁ / A' }
        ],
        steps: [
          {
            title: '50 Hz',
            instruction: '负载转矩 10 N·m，频率 50 Hz，V/f 电压 1.0，稳定后记录。',
            setup: { frequency: 50, voltage: 1, load: 10 },
            check: (ctx) => near(ctx.inputs.frequency, 50, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && near(ctx.inputs.load, 10, 0.3),
            record: true,
            capture: (ctx) => ({
              f: fixed(ctx.inputs.frequency, 0),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1
            })
          },
          {
            title: '30 Hz',
            instruction: '保持负载和 V/f，频率降到 30 Hz，稳定后记录。',
            setup: { frequency: 30, voltage: 1, load: 10 },
            check: (ctx) => near(ctx.inputs.frequency, 30, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && near(ctx.inputs.load, 10, 0.3),
            record: true,
            capture: (ctx) => ({
              f: fixed(ctx.inputs.frequency, 0),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1
            })
          },
          {
            title: '10 Hz',
            instruction: '保持负载和 V/f，频率降到 10 Hz，稳定后记录。',
            setup: { frequency: 10, voltage: 1, load: 10 },
            check: (ctx) => near(ctx.inputs.frequency, 10, 0.5) && near(ctx.inputs.voltage, 1, 0.02) && near(ctx.inputs.load, 10, 0.3),
            record: true,
            capture: (ctx) => ({
              f: fixed(ctx.inputs.frequency, 0),
              n: fixed(ctx.metrics.speed, 0),
              s: fixed(ctx.metrics.slip, 2),
              i1: ctx.data.i1
            })
          }
        ],
        conclusion: '频率下降时同步转速成比例下降，V/f 保持不变可维持磁通和转矩能力；低速时转差率通常略有增大。'
      }
    ],

    synchronous: [
      {
        id: 'pdelta',
        index: '01',
        title: '功角特性',
        en: 'POWER-ANGLE CHARACTERISTIC',
        accent: '#b49bff',
        goal: '保持励磁电流 1.2 A、电网电压 1.0 p.u.，测量 0、15、30 N·m 下的功角 δ、电枢电流和功率因数。',
        intro: '同步电机稳定运行时，负载增大，功角 δ 增大；δ 超过稳定极限会失步。',
        columns: [
          { key: 't', label: 'T_L / N·m' },
          { key: 'delta', label: 'δ / °' },
          { key: 'ia', label: 'Iₐ / A' },
          { key: 'pf', label: 'cosφ' }
        ],
        steps: [
          {
            title: '空载点',
            instruction: '励磁电流 1.2 A，电网电压 1.0 p.u.，负载转矩调到 0，记录 δ、Iₐ、cosφ。',
            setup: { fieldCurrent: 1.2, gridVoltage: 1, loadTorque: 0 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 1.2, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && ctx.inputs.loadTorque <= 0.2,
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              delta: fixed(ctx.metrics.delta, 1),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3)
            })
          },
          {
            title: '15 N·m 负载点',
            instruction: '保持励磁和电网电压，负载转矩调到 15 N·m，稳定后记录。',
            setup: { fieldCurrent: 1.2, gridVoltage: 1, loadTorque: 15 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 1.2, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && near(ctx.inputs.loadTorque, 15, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              delta: fixed(ctx.metrics.delta, 1),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3)
            })
          },
          {
            title: '30 N·m 负载点',
            instruction: '保持励磁和电网电压，负载转矩调到 30 N·m，稳定后记录。',
            setup: { fieldCurrent: 1.2, gridVoltage: 1, loadTorque: 30 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 1.2, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && near(ctx.inputs.loadTorque, 30, 0.3),
            record: true,
            capture: (ctx) => ({
              t: fixed(ctx.inputs.loadTorque, 1),
              delta: fixed(ctx.metrics.delta, 1),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3)
            })
          }
        ],
        conclusion: '负载转矩增大时功角 δ 增大，电枢电流增大；δ 接近 90° 时进入稳定极限，继续加载会失步。'
      },
      {
        id: 'vcurve',
        index: '02',
        title: 'V 形曲线',
        en: 'V-CURVE / EXCITATION',
        accent: '#ff7e9b',
        goal: '保持负载 15 N·m、电网电压 1.0 p.u.，测量 0.8、1.2、1.6 A 励磁电流下的 Iₐ、cosφ 和 δ。',
        intro: '同步电机在恒定负载下改变励磁，电枢电流呈 V 形；电流最小点对应接近单位功率因数。',
        columns: [
          { key: 'if', label: 'I_f / A' },
          { key: 'ia', label: 'Iₐ / A' },
          { key: 'pf', label: 'cosφ' },
          { key: 'delta', label: 'δ / °' }
        ],
        steps: [
          {
            title: 'I_f = 0.8 A（欠励）',
            instruction: '负载 15 N·m，电网电压 1.0 p.u.，励磁电流调到 0.8 A，稳定后记录。',
            setup: { fieldCurrent: 0.8, gridVoltage: 1, loadTorque: 15 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 0.8, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && near(ctx.inputs.loadTorque, 15, 0.3),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3),
              delta: fixed(ctx.metrics.delta, 1)
            })
          },
          {
            title: 'I_f = 1.2 A（正常励磁）',
            instruction: '保持负载和电网电压，励磁电流调到 1.2 A，稳定后记录。',
            setup: { fieldCurrent: 1.2, gridVoltage: 1, loadTorque: 15 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 1.2, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && near(ctx.inputs.loadTorque, 15, 0.3),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3),
              delta: fixed(ctx.metrics.delta, 1)
            })
          },
          {
            title: 'I_f = 1.6 A（过励）',
            instruction: '保持负载和电网电压，励磁电流调到 1.6 A，稳定后记录。',
            setup: { fieldCurrent: 1.6, gridVoltage: 1, loadTorque: 15 },
            check: (ctx) => near(ctx.inputs.fieldCurrent, 1.6, 0.02) && near(ctx.inputs.gridVoltage, 1, 0.01) && near(ctx.inputs.loadTorque, 15, 0.3),
            record: true,
            capture: (ctx) => ({
              if: fixed(ctx.inputs.fieldCurrent, 2),
              ia: fixed(ctx.metrics.current, 2),
              pf: fixed(ctx.metrics.pf, 3),
              delta: fixed(ctx.metrics.delta, 1)
            })
          }
        ],
        conclusion: '欠励时电流较大且滞后，过励时电流增大且超前；中间存在使 Iₐ 最小的正常励磁点，对应 cosφ 接近 1。'
      }
    ]
  };
})(window.MotorLab);
