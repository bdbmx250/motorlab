/* MotorLab workbench: machine lifecycle, 3D selection, simulation UI, charts. */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  class Workbench {
    constructor(options) {
      this.stage = options.stage;
      this.dom = options.dom;
      this.machine = null;
      this.visual = null;
      this.state = null;
      this.inputs = {};
      this.parts = new Map();
      this.pickables = [];
      this.selectedId = null;
      this.hoveredId = null;
      this.previewId = null;
      this.pointer = new THREE.Vector2();
      this.raycaster = new THREE.Raycaster();
      this.pointerInside = false;
      this.pointerDown = false;
      this.downX = 0;
      this.downY = 0;
      this.downTime = 0;
      this.running = true;
      this.fieldVisible = true;
      this.exploded = false;
      this.explodeValue = 0;
      this.explodeFrom = 0;
      this.explodeTarget = 0;
      this.explodeStart = 0;
      this.chartMode = null;
      this.knowledgeOpen = false;
      this.activeTopic = null;
      this.previousFocus = null;
      this.partBox = new THREE.Box3();
      this.partCenter = new THREE.Vector3();
      this.partSize = new THREE.Vector3();
      this.tmpVec = new THREE.Vector3();
      this.lastMetrics = 0;
      this.lastChart = 0;
      this.lastRaycast = 0;
      this.animTime = 0;
      this.renderEnabled = true;
      this._forceChartResize = true;
      this._legendCache = '';
      this._chartTitleCache = '';
      this._chartNoteCache = '';
      this._metricEls = {};
      this._dataEls = {};
      this.selectionRig = null;
      this.initSelectionRig();
      this.bindStatic();
    }

    /* ---------------- scene lifecycle ---------------- */

    open(machineId, isInitial) {
      const machine = ML.machineMap.get(machineId);
      if (!machine) return false;
      if (this.machine && this.machine.id === machineId) return true;
      this.unload();
      this.stage.setExplodedLighting(false);
      this.machine = machine;
      this.running = true;
      this.fieldVisible = true;
      this.exploded = false;
      this.explodeValue = 0;
      this.explodeFrom = 0;
      this.explodeTarget = 0;
      this.explodeStart = 0;
      this.selectedId = null;
      this.hoveredId = null;
      this.previewId = null;
      this.inputs = {};
      (machine.controls || []).forEach((control) => {
        this.inputs[control.id] = control.value;
      });
      this.stage.defaultDirection = new THREE.Vector3().fromArray(machine.viewDirection || [0.58, 0.32, 0.76]).normalize();
      this.buildUI();
      this.buildScene();
      this.resizeChart();
      this.updateAll();
      this.stage.fitToObject(this.visual.root, this.getSafeArea(), machine.fitPadding || 1.06);
      this.updateExplodeHint();
      document.body.classList.remove('is-paused');
      return true;
    }

    unload() {
      if (!this.visual) return;
      const sceneRoot = this.visual.sceneRoot || this.visual.root;
      this.stage.scene.remove(sceneRoot);
      ML.disposeObject(sceneRoot);
      this.stage.setExplodedLighting(false);
      if (this.selectionRig) this.selectionRig.visible = false;
      this.parts.clear();
      this.pickables = [];
      this.visual = null;
      this.state = null;
      this.machine = null;
      this.selectedId = null;
      this.hoveredId = null;
      this.knowledgeOpen = false;
      this.hideTooltip();
    }

    buildScene() {
      const machine = this.machine;
      if (!machine) return;
      const sceneRoot = new THREE.Group();
      sceneRoot.name = machine.id + '-root';
      this.stage.scene.add(sceneRoot);
      const context = {
        THREE,
        ML,
        Materials: ML.Materials,
        Charts: ML.Charts,
        stage: this.stage,
        scene: this.stage.scene,
        machine
      };
      const built = machine.build(context) || {};
      const root = built.root || new THREE.Group();
      root.name = machine.id + '-assembly';
      if (root.parent !== sceneRoot) sceneRoot.add(root);

      // Sit the assembly on the laboratory floor.
      root.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(root);
      root.position.y += this.stage.floorY - box.min.y + 0.12;
      root.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      this.stage.controls.target.copy(center);
      if (this.stage.contactShadow) {
        this.stage.contactShadow.position.x = center.x;
        this.stage.contactShadow.position.z = center.z;
        const scale = Math.max(0.8, Math.min(3.2, Math.max(size.x, size.z) / 3.4));
        this.stage.contactShadow.scale.set(scale, scale, scale);
      }

      this.visual = {
        root: root,
        sceneRoot: sceneRoot,
        groups: built.groups || {},
        extras: built.extras || {},
        machine: machine,
        context: context
      };

      this.parts.clear();
      this.pickables = [];
      (machine.parts || []).forEach((spec) => {
        const group = built.groups && built.groups[spec.id];
        if (!group) return;
        group.name = 'part-' + spec.id;
        group.userData.partId = spec.id;
        group.userData.basePosition = group.position.clone();
        const materials = [];
        group.traverse((object) => {
          if (!object.isMesh) return;
          object.userData.partId = spec.id;
          if (object.material) {
            const list = Array.isArray(object.material) ? object.material : [object.material];
            const cloned = list.map((material) => {
              const clone = material.clone();
              if (material.userData) clone.userData = Object.assign({}, material.userData);
              if (material.color) clone.userData.baseColor = material.color.clone();
              if (material.emissive) {
                clone.userData.baseEmissive = material.emissive.clone();
                clone.userData.baseEmissiveIntensity = material.emissiveIntensity === undefined ? 1 : material.emissiveIntensity;
              }
              if (material.envMapIntensity !== undefined) clone.userData.baseEnvMapIntensity = material.envMapIntensity;
              return clone;
            });
            object.material = Array.isArray(object.material) ? cloned : cloned[0];
            cloned.forEach((material) => materials.push(material));
          }
          this.pickables.push(object);
        });
        let anchor = null;
        if (spec.anchor) {
          anchor = new THREE.Object3D();
          anchor.position.fromArray(spec.anchor);
          group.add(anchor);
        } else {
          const b = new THREE.Box3().setFromObject(group);
          anchor = new THREE.Object3D();
          anchor.position.copy(b.getCenter(new THREE.Vector3()));
          root.add(anchor);
        }
        this.parts.set(spec.id, { spec, group, materials, anchor });
      });

      this.state = machine.sim.create(machine);
      if (machine.sim.onInput) machine.sim.onInput(this.state, this.inputs, this.visual);
      this.visual.root.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = object.castShadow !== false;
          object.receiveShadow = true;
        }
      });
      this.applyFieldVisibility();
      this.updateHighlights();
      this.resetExplodedPositions();
    }

    resetExplodedPositions() {
      this.parts.forEach((part) => {
        part.group.position.copy(part.group.userData.basePosition);
      });
    }

    /* ---------------- UI construction ---------------- */

    buildUI() {
      const machine = this.machine;
      document.body.classList.add('machine-open');
      this.dom.structureTitle.textContent = machine.structureTitle || '结构解剖';
      this.dom.structureFoot.textContent = machine.structureFoot || machine.en;
      this.dom.consoleTitle.textContent = machine.consoleTitle || '运行控制';
      this.dom.consoleKicker.textContent = machine.consoleKicker || '运行控制';
      this.dom.consoleLead.textContent = machine.consoleLead || '调节参数，实时观察电磁响应。';
      this.dom.consoleTag.textContent = machine.consoleTag || 'SIMULATION';
      this.dom.partCount.textContent = (machine.parts || []).length + ' MODULES';
      this.dom.massGauge.querySelector('b').textContent = String(Math.round((machine.parts || []).reduce((sum, part) => sum + (part.mass || 0), 0)));
      this.dom.ctaSub.textContent = machine.ctaSub || '公式 · 特性 · 实验提示';
      this.dom.stageMode.textContent = machine.stageMode || 'STRUCTURE / CUTAWAY';

      this.dom.partsList.innerHTML = (machine.parts || []).map((part, index) => `
        <button class="part-row" type="button" data-part-id="${part.id}" style="--row-accent:${part.accent || machine.accent}" aria-pressed="false">
          <span class="part-num">${String(index + 1).padStart(2, '0')}</span>
          <span class="part-copy"><span class="part-name">${part.name}</span><span class="part-en">${part.en}</span></span>
          <span class="part-mass">${Number(part.mass || 0).toFixed(1)}<small>KG</small></span>
        </button>
      `).join('');
      this.dom.partsList.querySelectorAll('[data-part-id]').forEach((row) => {
        const id = row.dataset.partId;
        row.addEventListener('mouseenter', () => this.setPreview(id));
        row.addEventListener('mouseleave', () => this.setPreview(null));
        row.addEventListener('click', () => this.selectPart(id));
      });
      this.dom.partDetail.style.setProperty('--detail-accent', machine.accent);
      this.renderDetail();

      this.dom.metricGrid.innerHTML = (machine.metrics || []).map((metric) => `
        <div class="live-metric" style="--metric-accent:${metric.accent || machine.accent}">
          <span>${metric.label}</span>
          <strong><b id="metric-${metric.id}">—</b><small>${metric.unit || ''}</small></strong>
          <i class="metric-bar"><em id="bar-${metric.id}"></em></i>
        </div>
      `).join('');
      this._metricEls = {};
      (machine.metrics || []).forEach((metric) => {
        this._metricEls[metric.id] = {
          value: document.getElementById('metric-' + metric.id),
          bar: document.getElementById('bar-' + metric.id)
        };
      });
      this.dom.sliderStack.innerHTML = (machine.controls || []).map((control) => `
        <div class="slider-block" style="--slider-accent:${control.accent || machine.accent}">
          <div class="slider-label">
            <span>${control.label} <small>${control.en || ''}</small></span>
            <b><span id="control-${control.id}">${this.formatControl(control, control.value)}</span> <small>${control.unit || ''}</small></b>
          </div>
          <input class="range-input ${control.className || ''}" id="input-${control.id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}" aria-label="${control.label}" />
          <div class="range-scale"><span>${control.scaleMin || control.min}</span><span>${control.scaleMax || control.max}</span></div>
        </div>
      `).join('');
      (machine.controls || []).forEach((control) => {
        const input = document.getElementById('input-' + control.id);
        const valueEl = document.getElementById('control-' + control.id);
        const update = () => {
          const value = Number(input.value);
          this.inputs[control.id] = value;
          valueEl.textContent = this.formatControl(control, value);
          this.updateSliderFill(input);
          if (this.machine.sim.onInput) this.machine.sim.onInput(this.state, this.inputs, this.visual);
          this.updateReadout(true);
        };
        input.addEventListener('input', update);
        this.updateSliderFill(input);
      });

      this.dom.chartTabs.innerHTML = (machine.charts || []).map((chart) => `
        <button type="button" data-chart="${chart.id}">${chart.label}</button>
      `).join('');
      this.dom.chartTabs.querySelectorAll('[data-chart]').forEach((button) => {
        button.addEventListener('click', () => this.setChartMode(button.dataset.chart));
      });
      this.chartMode = machine.charts && machine.charts[0] ? machine.charts[0].id : null;
      this.updateChartTabs();

      this.dom.dataStrip.innerHTML = (machine.dataFields || []).map((field) => `
        <div><span>${field.label}</span><b id="data-${field.id}">—</b></div>
      `).join('');
      this._dataEls = {};
      (machine.dataFields || []).forEach((field) => {
        this._dataEls[field.id] = document.getElementById('data-' + field.id);
      });

      this.dom.dockLegend.innerHTML = (machine.legend || []).map((item) => `<span><i style="background:${item.color};box-shadow:0 0 7px ${item.color}"></i>${item.label}</span>`).join('');
      this.dom.knowledgeNav.innerHTML = (machine.knowledge || []).map((topic, index) => `
        <button type="button" data-topic="${topic.id}" class="${index === 0 ? 'active' : ''}" role="tab">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <span><b>${topic.title}</b><small>${topic.kicker || ''}</small></span>
        </button>
      `).join('');
      this.dom.knowledgeNav.querySelectorAll('[data-topic]').forEach((button) => {
        button.addEventListener('click', () => this.renderTopic(button.dataset.topic));
      });
      this.activeTopic = machine.knowledge && machine.knowledge[0] ? machine.knowledge[0].id : null;
      if (this.activeTopic) this.renderTopic(this.activeTopic, false);
      this.dom.knowledgeKicker.textContent = 'MOTORLAB / ' + machine.en;
      this.dom.knowledgeTitle.textContent = machine.title + ' · 原理讲解';
      this.dom.knowledgeMeta.textContent = machine.knowledgeMeta || 'THEORY / FORMULA / EXPERIMENT';
      this.dom.fluxLabel.textContent = machine.fieldLabel || '磁场';
      this.dom.explodeLabel.textContent = '外壳剖解';
      this.updateRunUI();
      if (this.onMachineLoad) this.onMachineLoad(this.machine);
    }

    getReadout() {
      if (!this.machine || !this.state) return null;
      return this.machine.sim.readout(this.state, this.inputs) || null;
    }

    setInput(id, value) {
      if (!this.machine) return false;
      const control = (this.machine.controls || []).find((item) => item.id === id);
      const input = document.getElementById('input-' + id);
      if (!control || !input) return false;
      const next = ML.clamp(Number(value), Number(control.min), Number(control.max));
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    formatControl(control, value) {
      const digits = control.digits === undefined ? (Number(control.step) < 1 ? 2 : 0) : control.digits;
      return Number(value).toFixed(digits);
    }

    updateSliderFill(input) {
      const min = Number(input.min);
      const max = Number(input.max);
      const value = Number(input.value);
      const pct = max > min ? ((value - min) / (max - min)) * 100 : 50;
      input.style.setProperty('--fill', pct.toFixed(2) + '%');
    }

    updateChartTabs() {
      this.dom.chartTabs.querySelectorAll('[data-chart]').forEach((button) => {
        button.classList.toggle('active', button.dataset.chart === this.chartMode);
      });
    }

    /* ---------------- simulation ---------------- */

    updateAll() {
      this.updateRunUI();
      this.updateReadout(true);
      this.resizeChart();
    }

    update(dt, now) {
      if (!this.visual || !this.state) return;
      this.animTime += dt;
      if (this.running) {
        this.machine.sim.step(this.state, Math.min(dt, 0.05), this.inputs, this.visual);
      }
      if (this.machine.sim.animate) {
        this.machine.sim.animate(this.state, Math.min(dt, 0.05), this.inputs, this.visual);
      }
      this.updateExplosion(now);
      this.updateSelectionRig();
      this.updateTooltip();
      const perf = ML.Perf;
      const metricInterval = perf ? perf.uiInterval : 96;
      const chartInterval = perf ? perf.chartInterval : 52;
      if (now - this.lastMetrics > metricInterval) {
        this.lastMetrics = now;
        this.updateReadout();
      }
      if (!this.knowledgeOpen && now - this.lastChart > chartInterval) {
        this.lastChart = now;
        this.drawChart();
      }
      this.stage.update(dt, now / 1000);
      if (this.renderEnabled && !this.knowledgeOpen) this.stage.render();
    }

    updateReadout(force) {
      if (!this.machine || !this.state) return;
      const readout = this.machine.sim.readout(this.state, this.inputs) || {};
      const metrics = readout.metrics || {};
      (this.machine.metrics || []).forEach((metric) => {
        const els = this._metricEls[metric.id] || {};
        const value = metrics[metric.id];
        const text = Number.isFinite(value) ? Number(value).toFixed(metric.digits === undefined ? 1 : metric.digits) : '—';
        if (els.value && els.value.textContent !== text) els.value.textContent = text;
        if (els.bar && metric.max) {
          const width = ML.clamp(Math.abs(value || 0) / metric.max * 100, 0, 100).toFixed(1) + '%';
          if (els.bar.style.width !== width) els.bar.style.width = width;
        }
      });
      const data = readout.data || {};
      (this.machine.dataFields || []).forEach((field) => {
        const el = this._dataEls[field.id];
        if (!el) return;
        const value = data[field.id];
        const text = value === undefined || value === null ? '—' : (field.format ? field.format(value) : String(value));
        if (el.textContent !== text) el.textContent = text;
      });
      let angleText = this.dom.stageAngle.textContent;
      if (readout.stageAngleText) angleText = readout.stageAngleText;
      else if (readout.stageAngle !== undefined) angleText = 'θ ' + Number(readout.stageAngle).toFixed(1).padStart(5, '0') + '°';
      if (this.dom.stageAngle.textContent !== angleText) this.dom.stageAngle.textContent = angleText;

      const title = readout.chartTitle || (this.machine.charts || []).find((chart) => chart.id === this.chartMode)?.title || '实时曲线';
      if (this._chartTitleCache !== title) {
        this._chartTitleCache = title;
        this.dom.chartTitle.textContent = title;
      }
      const note = readout.chartNote || '';
      if (this._chartNoteCache !== note) {
        this._chartNoteCache = note;
        this.dom.chartNote.textContent = note;
      }
      if (readout.chartReadout !== undefined && this.dom.chartReadout.textContent !== readout.chartReadout) {
        this.dom.chartReadout.textContent = readout.chartReadout;
      }
      if (Array.isArray(readout.status)) {
        this.dom.runChip.lastChild.textContent = readout.status[0];
        this.dom.runChip.classList.toggle('is-paused', !!readout.status[1]);
      }
      if (readout.legend && this._legendCache !== readout.legend) {
        this._legendCache = readout.legend;
        this.dom.chartLegend.innerHTML = readout.legend;
      }
      const stageMode = readout.stageMode || this.machine.stageMode || 'STRUCTURE / CUTAWAY';
      if (this.dom.stageMode.textContent !== stageMode) this.dom.stageMode.textContent = stageMode;
      if (force) this.drawChart();
    }

    drawChart() {
      if (!this.machine || !this.state || !this.chartMode) return;
      const prep = ML.Charts.prepare(this.dom.chartCanvas, this._forceChartResize);
      this._forceChartResize = false;
      ML.Charts.clear(prep.ctx, prep.w, prep.h);
      const chartDef = (this.machine.charts || []).find((chart) => chart.id === this.chartMode);
      if (chartDef && chartDef.title && this._chartTitleCache !== chartDef.title) {
        this._chartTitleCache = chartDef.title;
        this.dom.chartTitle.textContent = chartDef.title;
      }
      this.machine.sim.drawChart(this.chartMode, prep.ctx, prep.w, prep.h, this.state, this.inputs, this.visual);
    }

    setChartMode(mode) {
      this.chartMode = mode;
      this.updateChartTabs();
      this.drawChart();
    }

    resizeChart() {
      if (!this.machine) return;
      this._forceChartResize = true;
      this.drawChart();
    }

    onQualityChange() {
      this._forceChartResize = true;
      this.resizeChart();
    }

    /* ---------------- controls ---------------- */

    bindStatic() {
      this.dom.runBtn.addEventListener('click', () => this.toggleRun());
      this.dom.fluxBtn.addEventListener('click', () => this.toggleField());
      this.dom.explodeBtn.addEventListener('click', () => this.toggleExplode());
      this.dom.resetBtn.addEventListener('click', () => this.resetView());
      this.dom.knowledgeBtn.addEventListener('click', () => this.openKnowledge());
      this.dom.knowledgeClose.addEventListener('click', () => this.closeKnowledge());
      this.dom.knowledgeBack.addEventListener('click', () => this.closeKnowledge());
      this.dom.knowledgeOverlay.addEventListener('click', (event) => {
        if (event.target.closest('[data-close-knowledge]')) this.closeKnowledge();
      });
      this.dom.knowledgeContent.addEventListener('click', (event) => {
        const action = event.target.closest('[data-knowledge-action]');
        if (action) this.handleKnowledgeAction(action.dataset.knowledgeAction);
      });
      this.dom.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
      this.dom.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.dom.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
      this.dom.canvas.addEventListener('pointerleave', () => {
        this.pointerInside = false;
        if (!this.pointerDown) this.setHovered(null);
      });
      this.dom.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
      this.stage.controls.addEventListener('start', () => {
        this.dom.canvas.classList.add('is-grabbing');
        this.hideTooltip();
      });
      this.stage.controls.addEventListener('end', () => {
        this.dom.canvas.classList.remove('is-grabbing');
      });
      window.addEventListener('resize', () => {
        if (!this.machine) return;
        this.stage.resize();
        this.resizeChart();
        if (this.selectedId) this.updateSelectionRig();
      });
      window.addEventListener('keydown', (event) => this.onKeyDown(event));
    }

    onKeyDown(event) {
      if (!this.machine) return;
      if (this.knowledgeOpen) {
        if (event.key === 'Escape' || event.key === 'k' || event.key === 'K') {
          event.preventDefault();
          this.closeKnowledge();
        }
        return;
      }
      if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.toggleRun();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        this.toggleField();
      } else if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        this.toggleExplode();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this.resetView();
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        this.openKnowledge();
      } else if (event.key === 'Escape') {
        this.selectPart(null);
      }
    }

    toggleRun() {
      this.running = !this.running;
      this.updateRunUI();
      if (this.running) this.stage.cameraTween = this.stage.cameraTween;
    }

    updateRunUI() {
      this.dom.runBtn.classList.toggle('is-active', this.running);
      this.dom.runBtn.setAttribute('aria-pressed', this.running ? 'true' : 'false');
      this.dom.runLabel.textContent = this.running ? '暂停仿真' : '继续仿真';
      this.dom.runChip.classList.toggle('is-paused', !this.running);
      if (this.dom.runChip.lastChild) this.dom.runChip.lastChild.textContent = this.running ? 'RUN' : 'PAUSED';
      document.body.classList.toggle('is-paused', !this.running);
      this.dom.fluxBtn.classList.toggle('is-active', this.fieldVisible);
      this.dom.fluxBtn.setAttribute('aria-pressed', this.fieldVisible ? 'true' : 'false');
      this.dom.explodeBtn.classList.toggle('is-active', this.exploded);
      this.dom.explodeBtn.setAttribute('aria-pressed', this.exploded ? 'true' : 'false');
      this.dom.explodeLabel.textContent = this.exploded ? '合拢装配' : '外壳剖解';
    }

    toggleField() {
      this.fieldVisible = !this.fieldVisible;
      this.applyFieldVisibility();
      this.updateRunUI();
    }

    applyFieldVisibility() {
      if (!this.visual) return;
      if (this.visual.extras.fieldGroup) this.visual.extras.fieldGroup.visible = this.fieldVisible && !this.exploded;
      if (this.visual.extras.fieldObjects) {
        this.visual.extras.fieldObjects.forEach((object) => {
          object.visible = this.fieldVisible && !this.exploded;
        });
      }
    }

    toggleExplode() {
      this.exploded = !this.exploded;
      this.explodeFrom = this.explodeValue;
      this.explodeTarget = this.exploded ? 1 : 0;
      this.explodeStart = performance.now();
      this.updateRunUI();
      this.hideTooltip();
      this.applyFieldVisibility();
      this.stage.setExplodedLighting(this.exploded);
      if (this.exploded) {
        this.explodeValue = 0;
        this.stage.fitToObject(this.getExplodedRoot(), this.getSafeArea(), this.machine.explodePadding || 1.0);
      } else {
        this.stage.fitToObject(this.visual.root, this.getSafeArea(), this.machine.fitPadding || 1.06);
      }
      this.updateExplodeHint();
    }

    updateExplodeHint() {
      const hint = this.dom.explodeHint;
      if (!hint) return;
      hint.classList.toggle('is-visible', this.exploded);
    }

    updateExplosion(now) {
      if (!this.machine) return;
      if (this.explodeStart) {
        const t = ML.clamp((now - this.explodeStart) / (this.machine.explodeDuration || 1100), 0, 1);
        this.explodeValue = ML.lerp(this.explodeFrom, this.explodeTarget, ML.easeInOutCubic(t));
        if (t >= 1) {
          this.explodeValue = this.explodeTarget;
          this.explodeStart = 0;
        }
      }
      const amount = this.explodeValue;
      this.parts.forEach((part) => {
        const base = part.group.userData.basePosition;
        const vector = part.spec.explode || [0, 0, 0];
        part.group.position.set(base.x + vector[0] * amount, base.y + vector[1] * amount, base.z + vector[2] * amount);
      });
      if (this.selectedId) this.updateSelectionRig();
    }

    getExplodedRoot() {
      if (!this.visual) return null;
      const temp = new THREE.Group();
      this.parts.forEach((part) => {
        const clone = part.group.clone(true);
        const base = part.group.userData.basePosition || new THREE.Vector3();
        const vector = part.spec.explode || [0, 0, 0];
        clone.position.set(base.x + vector[0], base.y + vector[1], base.z + vector[2]);
        temp.add(clone);
      });
      temp.position.copy(this.visual.root.position);
      return temp;
    }

    resetView() {
      if (!this.visual) return;
      this.stage.fitToObject(this.visual.root, this.getSafeArea(), this.machine.fitPadding || 1.06);
    }

    /* ---------------- camera ---------------- */

    getSafeArea() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const left = this.dom.structurePanel.getBoundingClientRect();
      const right = this.dom.consolePanel.getBoundingClientRect();
      const dock = this.dom.dock.getBoundingClientRect();
      const centerX = w / 2;
      const centerY = h / 2 + 22;
      const leftEdge = left.right + 18;
      const rightEdge = right.left - 18;
      const topEdge = 82;
      const bottomEdge = dock.top - 16;
      const halfW = Math.min(centerX - leftEdge, rightEdge - centerX) / centerX;
      const halfH = Math.min(centerY - topEdge, bottomEdge - centerY) / centerY;
      return {
        halfW: Math.max(0.18, halfW * 0.9),
        halfH: Math.max(0.2, halfH * 0.9),
        direction: this.stage.defaultDirection
      };
    }

    /* ---------------- selection / tooltip ---------------- */

    initSelectionRig() {
      const rig = new THREE.Group();
      rig.visible = false;
      const positions = [];
      const arm = 0.13;
      [-1, 1].forEach((x) => [-1, 1].forEach((y) => [-1, 1].forEach((z) => {
        positions.push(x * 0.5, y * 0.5, z * 0.5, x * (0.5 - arm), y * 0.5, z * 0.5);
        positions.push(x * 0.5, y * 0.5, z * 0.5, x * 0.5, y * (0.5 - arm), z * 0.5);
        positions.push(x * 0.5, y * 0.5, z * 0.5, x * 0.5, y * 0.5, z * (0.5 - arm));
      })));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.selectionBrackets = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x57dcff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
      this.selectionBrackets.renderOrder = 20;
      rig.add(this.selectionBrackets);
      this.selectionRig = rig;
      this.stage.scene.add(rig);
    }

    selectPart(id) {
      if (id && !this.parts.has(id)) return;
      this.selectedId = id || null;
      this.dom.partsList.querySelectorAll('[data-part-id]').forEach((row) => {
        const active = row.dataset.partId === this.selectedId;
        row.classList.toggle('is-active', active);
        row.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      this.renderDetail();
      this.updateHighlights();
      if (!id) {
        this.selectionRig.visible = false;
        this.hideTooltip();
      }
    }

    setPreview(id) {
      if (this.previewId === id) return;
      this.previewId = id;
      this.updateHighlights();
    }

    setHovered(id) {
      if (this.hoveredId === id) return;
      this.hoveredId = id;
      this.updateHighlights();
      this.dom.canvas.classList.toggle('is-hovering', !!id);
      if (id) this.showTooltip(id);
      else this.hideTooltip();
    }

    renderDetail() {
      const part = this.selectedId ? this.parts.get(this.selectedId) : null;
      const machine = this.machine;
      if (!part) {
        this.dom.partDetail.style.setProperty('--detail-accent', machine.accent);
        this.dom.partDetail.innerHTML = `
          <div class="detail-overview">
            <div class="detail-rings"></div>
            <div>
              <span class="detail-kicker">${machine.en} / STRUCTURE</span>
              <h3>${machine.structureTitle || '结构与能量转换'}</h3>
              <p>${machine.structureNote || '点击左侧部件，查看它在能量转换中的角色。'}</p>
            </div>
          </div>
          <div class="detail-material">${machine.structureFoot || machine.en}</div>
        `;
        return;
      }
      const spec = part.spec;
      this.dom.partDetail.style.setProperty('--detail-accent', spec.accent || machine.accent);
      const specs = (spec.specs || []).slice(0, 3).map((item) => `<span>${item[0]} ${item[1]}</span>`).join('');
      this.dom.partDetail.innerHTML = `
        <div class="detail-selected-head">
          <div class="detail-index">${spec.index || ''}</div>
          <div class="detail-title-block"><span class="detail-kicker">${spec.en || ''}</span><h3>${spec.name}</h3></div>
          <span class="detail-mass">${Number(spec.mass || 0).toFixed(1)} <small>KG</small></span>
          <button class="detail-close" type="button" data-clear-part aria-label="取消选择"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
        </div>
        <p class="detail-desc">${spec.description || ''}</p>
        <div class="detail-specs">${specs}</div>
        <div class="detail-material">MATERIAL / ${spec.material || '—'}</div>
      `;
      const close = this.dom.partDetail.querySelector('[data-clear-part]');
      if (close) close.addEventListener('click', () => this.selectPart(null));
    }

    updateHighlights() {
      const selected = this.selectedId;
      this.parts.forEach((part) => {
        const active = selected === part.spec.id;
        const hovered = !selected && (this.hoveredId === part.spec.id || this.previewId === part.spec.id);
        const dimmed = !!selected && !active;
        const accent = new THREE.Color(part.spec.accent || this.machine.accent);
        part.materials.forEach((material) => {
          if (material.userData.baseColor) {
            if (dimmed) material.color.copy(material.userData.baseColor).multiplyScalar(0.46);
            else if (active || hovered) material.color.copy(material.userData.baseColor).lerp(accent, active ? 0.2 : 0.1);
            else material.color.copy(material.userData.baseColor);
          }
          if (material.userData.baseEnvMapIntensity !== undefined) {
            material.envMapIntensity = dimmed ? material.userData.baseEnvMapIntensity * 0.5 : material.userData.baseEnvMapIntensity;
          }
          if (material.emissive && material.userData.baseEmissive) {
            if (active) {
              material.emissive.copy(material.userData.baseEmissive).lerp(accent, 0.3);
              material.emissiveIntensity = (material.userData.baseEmissiveIntensity || 0) + 0.15;
            } else {
              material.emissive.copy(material.userData.baseEmissive);
              material.emissiveIntensity = material.userData.baseEmissiveIntensity || 0;
            }
          }
        });
      });
    }

    updateSelectionRig() {
      if (!this.selectionRig) return;
      if (!this.selectedId) {
        this.selectionRig.visible = false;
        return;
      }
      const part = this.parts.get(this.selectedId);
      if (!part) {
        this.selectionRig.visible = false;
        return;
      }
      part.group.updateMatrixWorld(true);
      this.partBox.setFromObject(part.group);
      if (this.partBox.isEmpty()) {
        this.selectionRig.visible = false;
        return;
      }
      this.partBox.getCenter(this.partCenter);
      this.partBox.getSize(this.partSize);
      this.selectionRig.position.copy(this.partCenter);
      this.selectionRig.scale.set(
        Math.max(0.25, this.partSize.x + 0.1),
        Math.max(0.25, this.partSize.y + 0.1),
        Math.max(0.25, this.partSize.z + 0.1)
      );
      this.selectionRig.visible = true;
      const accent = new THREE.Color(part.spec.accent || this.machine.accent);
      this.selectionBrackets.material.color.copy(accent);
      this.selectionBrackets.material.opacity = 0.72 + Math.sin(this.animTime * 3.2) * 0.16;
    }

    showTooltip(id) {
      const part = this.parts.get(id);
      if (!part) return;
      const spec = part.spec;
      this.dom.tipIndex.textContent = spec.index || '—';
      this.dom.tipKicker.textContent = spec.en || '';
      this.dom.tipName.textContent = spec.name;
      this.dom.tipSpec.textContent = spec.specs && spec.specs[0] ? spec.specs[0][1] : (spec.material || '');
      this.dom.tipMass.textContent = Number(spec.mass || 0).toFixed(1) + ' KG';
      this.dom.tooltip.style.setProperty('--tooltip-accent', spec.accent || this.machine.accent);
      this.dom.leaderLayer.style.setProperty('--tooltip-accent', spec.accent || this.machine.accent);
      this.dom.tooltip.classList.add('is-visible');
      this.dom.tooltip.setAttribute('aria-hidden', 'false');
      this.dom.leaderLayer.classList.add('is-visible');
      this.updateTooltip();
    }

    hideTooltip() {
      this.dom.tooltip.classList.remove('is-visible');
      this.dom.tooltip.setAttribute('aria-hidden', 'true');
      this.dom.leaderLayer.classList.remove('is-visible');
    }

    updateTooltip() {
      if (!this.hoveredId || !this.parts.has(this.hoveredId)) return;
      const part = this.parts.get(this.hoveredId);
      part.anchor.getWorldPosition(this.tmpVec);
      this.tmpVec.project(this.stage.camera);
      if (this.tmpVec.z < -1 || this.tmpVec.z > 1) {
        this.hideTooltip();
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ax = (this.tmpVec.x * 0.5 + 0.5) * w;
      const ay = (-this.tmpVec.y * 0.5 + 0.5) * h;
      const leftRect = this.dom.structurePanel.getBoundingClientRect();
      const rightRect = this.dom.consolePanel.getBoundingClientRect();
      const dockRect = this.dom.dock.getBoundingClientRect();
      const safeLeft = leftRect.right + 16;
      const safeRight = rightRect.left - 16;
      const safeTop = 84;
      const safeBottom = dockRect.top - 16;
      const cardW = this.dom.tooltip.offsetWidth || 280;
      const cardH = this.dom.tooltip.offsetHeight || 60;
      let side = ax < (safeLeft + safeRight) / 2 ? 'right' : 'left';
      if (side === 'right' && ax + cardW + 50 > safeRight) side = 'left';
      if (side === 'left' && ax - cardW - 50 < safeLeft) side = 'right';
      let x = side === 'right' ? ax + 34 : ax - cardW - 34;
      x = ML.clamp(x, safeLeft, Math.max(safeLeft, safeRight - cardW));
      let y = ay - cardH - 18;
      if (y < safeTop) y = ay + 24;
      y = ML.clamp(y, safeTop, Math.max(safeTop, safeBottom - cardH));
      this.dom.tooltip.style.left = Math.round(x) + 'px';
      this.dom.tooltip.style.top = Math.round(y) + 'px';
      const endX = side === 'right' ? x - 3 : x + cardW + 3;
      const endY = ML.clamp(ay, y + 10, y + cardH - 10);
      this.dom.leaderLine.setAttribute('x1', ax);
      this.dom.leaderLine.setAttribute('y1', ay);
      this.dom.leaderLine.setAttribute('x2', endX);
      this.dom.leaderLine.setAttribute('y2', endY);
      this.dom.leaderDot.setAttribute('cx', ax);
      this.dom.leaderDot.setAttribute('cy', ay);
    }

    updatePointer(event) {
      const rect = this.dom.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    pick() {
      this.raycaster.setFromCamera(this.pointer, this.stage.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      for (let i = 0; i < hits.length; i += 1) {
        let object = hits[i].object;
        while (object && !object.userData.partId) object = object.parent;
        if (object && object.visible) return object.userData.partId;
      }
      return null;
    }

    onPointerMove(event) {
      if (!this.machine) return;
      this.pointerInside = true;
      this.updatePointer(event);
      if (this.pointerDown) {
        this.hideTooltip();
        return;
      }
      const now = performance.now();
      if (now - this.lastRaycast < 38) return;
      this.lastRaycast = now;
      this.setHovered(this.pick());
    }

    onPointerDown(event) {
      if (!this.machine) return;
      if (event.button !== undefined && event.button !== 0) return;
      this.pointerDown = true;
      this.downX = event.clientX;
      this.downY = event.clientY;
      this.downTime = performance.now();
      this.stage.cameraTween = null;
      this.hideTooltip();
    }

    onPointerUp(event) {
      if (!this.machine) return;
      const wasDown = this.pointerDown;
      const moved = Math.hypot(event.clientX - this.downX, event.clientY - this.downY);
      const elapsed = performance.now() - this.downTime;
      this.pointerDown = false;
      if (!wasDown) return;
      if (moved < 7 && elapsed < 700) {
        this.updatePointer(event);
        const id = this.pick();
        this.selectPart(id || null);
      }
      this.pointerInside = true;
      this.setHovered(this.pick());
    }

    /* ---------------- knowledge ---------------- */

    renderTopic(topicId, focus) {
      const topic = (this.machine.knowledge || []).find((item) => item.id === topicId);
      if (!topic) return;
      this.activeTopic = topicId;
      this.dom.knowledgeNav.querySelectorAll('[data-topic]').forEach((button) => {
        const active = button.dataset.topic === topicId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.dom.knowledgeContent.innerHTML = `
        <div class="topic-kicker">${topic.kicker || ''}</div>
        <h3 class="topic-title">${topic.title}</h3>
        <p class="topic-lead">${topic.lead || ''}</p>
        ${topic.html || ''}
      `;
      this.dom.knowledgeContent.scrollTop = 0;
    }

    openKnowledge(topicId) {
      if (!this.machine) return;
      if (!this.activeTopic) this.activeTopic = this.machine.knowledge[0].id;
      this.renderTopic(topicId || this.activeTopic);
      this.knowledgeOpen = true;
      this.previousFocus = document.activeElement;
      this.dom.knowledgeOverlay.classList.add('is-open');
      this.dom.knowledgeOverlay.setAttribute('aria-hidden', 'false');
      this.dom.knowledgeOverlay.inert = false;
      this.hideTooltip();
      setTimeout(() => this.dom.knowledgeClose.focus(), 60);
    }

    closeKnowledge() {
      this.knowledgeOpen = false;
      this.dom.knowledgeOverlay.classList.remove('is-open');
      this.dom.knowledgeOverlay.setAttribute('aria-hidden', 'true');
      this.dom.knowledgeOverlay.inert = true;
      if (this.previousFocus && this.previousFocus.focus) setTimeout(() => this.previousFocus.focus(), 50);
    }

    handleKnowledgeAction(action) {
      if (action === 'run') {
        this.closeKnowledge();
        this.running = true;
        this.updateRunUI();
      } else if (action === 'field') {
        this.closeKnowledge();
        this.toggleField();
      } else if (action === 'explode') {
        this.closeKnowledge();
        if (!this.exploded) this.toggleExplode();
      } else if (action === 'reset') {
        this.closeKnowledge();
        this.resetView();
      }
    }
  }

  ML.Workbench = Workbench;
})(window);
