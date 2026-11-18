/* MotorLab application shell: home gallery, routing, Electron window integration. */
(function (global) {
  const ML = global.MotorLab;
  const dom = {};
  let stage = null;
  let workbench = null;
  let lab = null;
  let currentMachineId = null;
  let switchToken = 0;
  let booted = false;
  let frameHandle = 0;
  let lastFrame = 0;

  const $ = (id) => document.getElementById(id);

  function cacheDom() {
    dom.homeView = $('homeView');
    dom.workbenchView = $('workbenchView');
    dom.sceneVeil = $('sceneVeil');
    dom.machineGrid = $('machineGrid');
    dom.machineTabs = $('machineTabs');
    dom.backHome = $('backHome');
    dom.brandHome = $('brandHome');
    dom.homeCrumb = $('homeCrumb');
    dom.knowledgeTop = $('knowledgeTop');
    dom.installApp = $('installApp');
    dom.knowledgeOverlay = $('knowledgeOverlay');
    dom.knowledgeClose = $('knowledgeClose');
    dom.knowledgeBack = $('knowledgeBack');
    dom.knowledgeNav = $('knowledgeNav');
    dom.knowledgeContent = $('knowledgeContent');
    dom.knowledgeKicker = $('knowledgeKicker');
    dom.knowledgeTitle = $('knowledgeTitle');
    dom.knowledgeMeta = $('knowledgeMeta');
    dom.canvas = $('viewport');
    dom.structurePanel = $('structurePanel');
    dom.consolePanel = $('consolePanel');
    dom.partsList = $('partsList');
    dom.partDetail = $('partDetail');
    dom.structureTitle = $('structureTitle');
    dom.structureFoot = $('structureFoot');
    dom.partCount = $('partCount');
    dom.massGauge = $('massGauge');
    dom.consoleTitle = $('consoleTitle');
    dom.consoleKicker = $('consoleKicker');
    dom.consoleLead = $('consoleLead');
    dom.consoleTag = $('consoleTag');
    dom.metricGrid = $('metricGrid');
    dom.sliderStack = $('sliderStack');
    dom.chartTabs = $('chartTabs');
    dom.chartTitle = $('chartTitle');
    dom.chartCanvas = $('telemetryChart');
    dom.chartNote = $('chartNote');
    dom.chartLegend = $('chartLegend');
    dom.chartReadout = $('chartReadout');
    dom.dataStrip = $('dataStrip');
    dom.knowledgeBtn = $('knowledgeBtn');
    dom.ctaSub = $('ctaSub');
    dom.runBtn = $('runBtn');
    dom.runLabel = $('runLabel');
    dom.runChip = $('runChip');
    dom.fluxBtn = $('fluxBtn');
    dom.fluxLabel = $('fluxLabel');
    dom.explodeBtn = $('explodeBtn');
    dom.explodeLabel = $('explodeLabel');
    dom.explodeHint = $('explodeHint');
    dom.resetBtn = $('resetBtn');
    dom.dock = document.querySelector('.control-dock');
    dom.dockLegend = $('dockLegend');
    dom.stageMode = $('stageMode');
    dom.stageAngle = $('stageAngle');
    dom.tooltip = $('partTooltip');
    dom.tipIndex = $('tipIndex');
    dom.tipKicker = $('tipKicker');
    dom.tipName = $('tipName');
    dom.tipSpec = $('tipSpec');
    dom.tipMass = $('tipMass');
    dom.leaderLayer = $('leaderLayer');
    dom.leaderLine = $('leaderLine');
    dom.leaderDot = $('leaderDot');
    dom.bootScreen = $('bootScreen');
    dom.bootProgress = $('bootProgress');
    dom.errorScreen = $('errorScreen');
    dom.errorMessage = $('errorMessage');
    dom.errorReload = $('errorReload');
    dom.winMin = $('winMin');
    dom.winMax = $('winMax');
    dom.winClose = $('winClose');
    dom.enterFirst = $('enterFirst');
    dom.heroGuide = $('heroGuide');
    dom.knowledgeOverlay.inert = true;
  }

  function setBoot(value, note) {
    if (dom.bootProgress) dom.bootProgress.style.width = ML.clamp(value, 0, 100) + '%';
    if (note) $('bootNote').textContent = note;
  }

  function finishBoot() {
    if (booted) return;
    booted = true;
    setBoot(100, '渲染管线就绪 · 四个教学机型已载入');
    setTimeout(() => dom.bootScreen.classList.add('is-hidden'), 480);
  }

  function fatal(message, error) {
    console.error('[MotorLab]', message, error || '');
    dom.bootScreen.classList.add('is-hidden');
    dom.errorScreen.classList.add('is-visible');
    dom.errorScreen.setAttribute('aria-hidden', 'false');
    dom.errorMessage.textContent = message + (error && error.message ? ' ' + error.message : '');
  }

  function genericCardArt() {
    return `<svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="76" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="120" cy="120" r="42" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/><circle cx="120" cy="120" r="16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }

  function renderHome() {
    dom.machineGrid.innerHTML = ML.machines.map((machine, index) => `
      <button class="machine-card" type="button" data-machine="${machine.id}" style="--card-accent:${machine.accent}">
        <span class="card-copy">
          <span class="card-head"><i></i>${String(index + 1).padStart(2, '0')} / ${machine.en}</span>
          <h3>${machine.title}</h3>
          <span class="card-en">${machine.cardEn || machine.en}</span>
          <span class="card-desc">${machine.blurb}</span>
          <span class="card-topics">${(machine.topics || []).map((topic) => `<span>${topic}</span>`).join('')}</span>
          <span class="card-enter">进入实验台
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h11M10 5l5 5-5 5"/></svg>
          </span>
        </span>
        <span class="card-art" style="color:${machine.accent}">${machine.cardArt || genericCardArt()}</span>
      </button>
    `).join('');
    dom.machineGrid.querySelectorAll('[data-machine]').forEach((card) => {
      card.addEventListener('click', () => openMachine(card.dataset.machine));
    });
    dom.machineTabs.innerHTML = ML.machines.map((machine) => `
      <button class="machine-tab" type="button" data-machine="${machine.id}" style="--tab-accent:${machine.accent}">
        <i></i>${machine.title}
      </button>
    `).join('');
    dom.machineTabs.querySelectorAll('[data-machine]').forEach((tab) => {
      tab.addEventListener('click', () => openMachine(tab.dataset.machine));
    });
  }

  function updateTitlebar(mode, machine) {
    const home = mode === 'home';
    dom.homeCrumb.hidden = !home;
    dom.machineTabs.hidden = home;
    dom.backHome.hidden = home;
    dom.knowledgeTop.hidden = home;
    if (!home && machine) {
      dom.machineTabs.querySelectorAll('[data-machine]').forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.machine === machine.id);
      });
      document.title = machine.title + ' · 电机学虚拟实验室';
    } else {
      document.title = '电机学虚拟实验室 · MotorLab';
    }
  }

  function showHome() {
    currentMachineId = null;
    switchToken += 1;
    if (dom.sceneVeil) dom.sceneVeil.classList.remove('is-active');
    if (lab) lab.hide();
    if (ML.Perf) ML.Perf.togglePanel(false);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (workbench && workbench.machine) workbench.unload();
    dom.workbenchView.hidden = true;
    dom.homeView.hidden = false;
    document.body.classList.remove('machine-open');
    updateTitlebar('home');
  }

  function showSwitchVeil() {
    if (dom.sceneVeil) dom.sceneVeil.classList.add('is-active');
  }

  function hideSwitchVeil(token) {
    if (token !== switchToken) return;
    if (dom.sceneVeil) dom.sceneVeil.classList.remove('is-active');
  }

  function openMachine(machineId) {
    const machine = ML.machineMap.get(machineId);
    if (!machine) return false;
    const switching = !!(workbench && workbench.machine && workbench.machine.id !== machineId);
    if (!switching) return performOpen(machine, machineId);

    const token = ++switchToken;
    showSwitchVeil();
    /* A short timer lets the veil paint before the synchronous scene rebuild.
       Timers are used instead of chained rAF so the veil cannot get stuck when
       a background/headless tab throttles animation frames. */
    setTimeout(() => {
      if (token !== switchToken) return;
      const opened = performOpen(machine, machineId);
      if (!opened) {
        hideSwitchVeil(token);
        return;
      }
      setTimeout(() => hideSwitchVeil(token), 140);
    }, 28);
    return true;
  }

  function performOpen(machine, machineId) {
    dom.homeView.hidden = true;
    dom.workbenchView.hidden = false;
    document.body.classList.add('machine-open');
    updateTitlebar('workbench', machine);
    currentMachineId = machineId;
    if (location.hash !== '#/machine/' + machineId) history.replaceState(null, '', '#/machine/' + machineId);
    if (stage) {
      stage.resize();
      stage.controls.enabled = true;
    }
    let opened = false;
    try {
      opened = workbench.open(machineId);
    } catch (error) {
      fatal('机型模块加载失败：' + machine.title, error);
      return false;
    }
    if (opened) {
      requestAnimationFrame(() => {
        stage.resize();
        stage.fitToObject(workbench.visual.root, workbench.getSafeArea(), machine.fitPadding || 1.06);
        workbench.resizeChart();
        workbench.updateReadout(true);
        /* Warm shader and shadow programs behind the switch veil. */
        if (stage.renderer) {
          stage.renderer.compile(stage.scene, stage.camera);
          stage.render();
        }
      });
    }
    return opened;
  }

  function bindWindowControls() {
    const desktop = window.desktop;
    if (dom.winMin) dom.winMin.addEventListener('click', () => desktop && desktop.minimize());
    if (dom.winMax) dom.winMax.addEventListener('click', () => desktop && desktop.toggleMaximize());
    if (dom.winClose) dom.winClose.addEventListener('click', () => desktop && desktop.close());
    if (desktop && desktop.onMaximizeChange) {
      desktop.onMaximizeChange((maximized) => document.body.classList.toggle('is-maximized', !!maximized));
      if (desktop.isMaximized) desktop.isMaximized().then((maximized) => document.body.classList.toggle('is-maximized', !!maximized));
    }
  }

  function bindNavigation() {
    dom.backHome.addEventListener('click', showHome);
    dom.brandHome.addEventListener('click', showHome);
    dom.knowledgeTop.addEventListener('click', () => {
      if (workbench && workbench.machine) workbench.openKnowledge();
    });
    dom.enterFirst.addEventListener('click', () => openMachine(ML.machines[0] && ML.machines[0].id));
    dom.heroGuide.addEventListener('click', () => {
      const section = document.querySelector('.machine-section');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ML.showToast('点击任意机型卡片进入 3D 实验台；拖拽旋转，滚轮缩放。');
    });
    window.addEventListener('keydown', (event) => {
      if (!workbench || !dom.workbenchView.hidden) return;
      if (event.key === 'Escape' && !workbench.knowledgeOpen) showHome();
    });
    window.addEventListener('hashchange', () => {
      const match = location.hash.match(/^#\/machine\/([a-z0-9-]+)$/i);
      if (match) openMachine(match[1]);
      else showHome();
    });
  }

  function bindResize() {
    window.addEventListener('resize', () => {
      if (stage) stage.resize();
    });
  }

  function startLoop() {
    const tick = (now) => {
      frameHandle = requestAnimationFrame(tick);
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016;
      lastFrame = now;
      const renderNow = ML.Perf ? ML.Perf.tick(now) : true;
      if (workbench && workbench.machine && !dom.workbenchView.hidden) {
        workbench.renderEnabled = renderNow;
        workbench.update(dt, now);
      }
    };
    frameHandle = requestAnimationFrame(tick);
  }

  let installPrompt = null;

  function bindPwa() {
    if (!dom.installApp) return;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      dom.installApp.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      dom.installApp.hidden = true;
    });
    dom.installApp.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      installPrompt = null;
      dom.installApp.hidden = true;
    });
    const hosted = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (hosted) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    if ('serviceWorker' in navigator && hosted) {
      navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {});
    }
  }

  function init() {
    cacheDom();
    if (!window.desktop) document.body.classList.add('web-mode');
    bindPwa();
    setBoot(8, '构建机型库与教学桌面');
    if (!global.THREE) {
      fatal('Three.js 未加载，请检查 renderer/vendor/three.min.js。');
      return;
    }
    if (!ML.machines.length) {
      fatal('未载入任何机型模块。');
      return;
    }
    renderHome();
    bindWindowControls();
    bindNavigation();
    bindResize();
    setBoot(28, '初始化 WebGL 渲染管线');
    try {
      stage = new ML.Stage(dom.canvas);
    } catch (error) {
      fatal('无法创建 WebGL 场景，请确认显卡驱动支持 WebGL2。', error);
      return;
    }
    setBoot(56, '载入部件注册器与相机系统');
    workbench = new ML.Workbench({ stage: stage, dom: dom });
    if (ML.Perf) ML.Perf.attach(stage, workbench);
    if (ML.LabEngine) lab = new ML.LabEngine(workbench);
    setBoot(78, '校准实时仿真与曲线模块');
    const hashMatch = location.hash.match(/^#\/machine\/([a-z0-9-]+)$/i);
    if (hashMatch && ML.machineMap.has(hashMatch[1])) {
      openMachine(hashMatch[1]);
    } else {
      showHome();
    }
    startLoop();
    setBoot(92, '预热四个机型的教学参数');
    global.__MOTORLAB__ = {
      stage: stage,
      workbench: workbench,
      lab: lab,
      openMachine: openMachine,
      showHome: showHome
    };
    setTimeout(finishBoot, 600);
  }

  window.addEventListener('error', (event) => {
    if (!booted) fatal('软件启动失败。', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (!booted) fatal('软件启动失败。', event.reason);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
