/* MotorLab material palette. Every call returns a fresh material so part-level
   dimming/highlighting never leaks between parts. */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;
  const make = ML.makeStandard.bind(ML);
  const basic = ML.makeBasic.bind(ML);

  ML.Materials = {
    steel: (color) => make(color === undefined ? 0x8fa4b0 : color, 0.9, 0.28, { envMapIntensity: 0.6 }),
    darkSteel: () => make(0x26343d, 0.82, 0.42, { envMapIntensity: 0.5 }),
    castIron: () => make(0x445560, 0.7, 0.48, { envMapIntensity: 0.46 }),
    ironCore: () => make(0x2d414c, 0.84, 0.38, { envMapIntensity: 0.5 }),
    ironDark: () => make(0x17232a, 0.76, 0.48, { envMapIntensity: 0.4 }),
    copper: () => make(0x9a5c35, 0.8, 0.34, { envMapIntensity: 0.4 }),
    copperBright: () => make(0xb8743f, 0.78, 0.32, { envMapIntensity: 0.45 }),
    copperDark: () => make(0x603923, 0.78, 0.4, { envMapIntensity: 0.36 }),
    aluminum: () => make(0x9aadb8, 0.8, 0.32, { envMapIntensity: 0.58 }),
    aluminumDark: () => make(0x5c6f79, 0.74, 0.42, { envMapIntensity: 0.46 }),
    brass: () => make(0xc79b53, 0.86, 0.25, { envMapIntensity: 0.62 }),
    insulation: () => make(0x9b7b57, 0.2, 0.58, { envMapIntensity: 0.32 }),
    insulationBlue: () => make(0x2b5d72, 0.16, 0.6, { envMapIntensity: 0.3 }),
    polymer: () => make(0x1a242b, 0.08, 0.7, { envMapIntensity: 0.22 }),
    rubber: () => make(0x080c0f, 0.04, 0.82, { envMapIntensity: 0.16 }),
    ceramic: () => make(0xb8c2c5, 0.18, 0.66, { envMapIntensity: 0.35 }),
    glass: () => make(0x78a9b8, 0.16, 0.08, { transparent: true, opacity: 0.24, envMapIntensity: 0.9, side: THREE.DoubleSide }),
    paint: () => make(0x1d323c, 0.34, 0.58, { envMapIntensity: 0.34 }),
    paintLight: () => make(0x2d4651, 0.38, 0.54, { envMapIntensity: 0.38 }),
    magnetNorth: () => make(0x7e3327, 0.42, 0.48, { emissive: 0x2c0704, emissiveIntensity: 0.2, envMapIntensity: 0.4 }),
    magnetSouth: () => make(0x1d4c6e, 0.42, 0.48, { emissive: 0x031522, emissiveIntensity: 0.2, envMapIntensity: 0.4 }),
    accent: (color, opacity) => basic(color, opacity === undefined ? 0.9 : opacity, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    glow: (color, opacity) => basic(color, opacity === undefined ? 0.55 : opacity, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    line: (color, opacity) => new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity === undefined ? 0.45 : opacity }),
    field: (color, opacity) => basic(color, opacity === undefined ? 0.75 : opacity, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  };
})(window);
