/* MotorLab adaptive performance + quality manager. */
(function (global) {
  const ML = global.MotorLab;
  const STORAGE_KEY = 'motorlab.performance.v1';

  const PROFILES = {
    high: { label: '高清', pixelRatio: 2, shadowSize: 2048, shadows: true, blur: 'high', chartFps: 30, uiHz: 10 },
    balanced: { label: '均衡', pixelRatio: 1.5, shadowSize: 1024, shadows: true, blur: 'balanced', chartFps: 20, uiHz: 10 },
    low: { label: '流畅', pixelRatio: 1, shadowSize: 0, shadows: false, blur: 'low', chartFps: 12, uiHz: 8 }
  };

  class PerformanceManager {
    constructor() {
      this.stage = null;
      this.workbench = null;
      this.quality = 'auto';
      this.fpsCap = 'auto';
      this.ambience = 'warm';
      this.effectiveQuality = 'balanced';
      this.profile = PROFILES.balanced;
      this.lastTick = 0;
      this.lastRender = 0;
      this.lastStats = 0;
      this.lastAutoAdjust = 0;
      this.renderIntervals = [];
      this.tickIntervals = [];
      this.screenHz = 0;
      this.fps = 0;
      this.frameMs = 0;
      this.renderCount = 0;
      this.dom = {};
      this.panelOpen = false;
      this.load();
      this.cacheDom();
      this.bind();
      this.applyQuality();
      this.applyAmbience();
      this.updateUI();
    }

    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && ['auto', 'high', 'balanced', 'low'].includes(saved.quality)) this.quality = saved.quality;
        if (saved && ['auto', '60', '90', '120', '144'].includes(saved.fpsCap)) this.fpsCap = saved.fpsCap;
        if (saved && ['warm', 'cool'].includes(saved.ambience)) this.ambience = saved.ambience;
      } catch (error) {
        // localStorage can be unavailable for some file:// policies.
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ quality: this.quality, fpsCap: this.fpsCap, ambience: this.ambience }));
      } catch (error) {
        // Ignore.
      }
    }

    cacheDom() {
      this.dom.chip = document.getElementById('perfChip');
      this.dom.chipText = document.getElementById('perfChipText');
      this.dom.panel = document.getElementById('perfPanel');
      this.dom.close = document.getElementById('perfClose');
      this.dom.fps = document.getElementById('perfFps');
      this.dom.frame = document.getElementById('perfFrame');
      this.dom.draws = document.getElementById('perfDraws');
      this.dom.tris = document.getElementById('perfTris');
      this.dom.hz = document.getElementById('perfHz');
      this.dom.qualityLabel = document.getElementById('perfQualityLabel');
      this.dom.fpsLabel = document.getElementById('perfFpsLabel');
      this.dom.ambienceLabel = document.getElementById('perfAmbienceLabel');
    }

    bind() {
      if (this.dom.chip) {
        this.dom.chip.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.togglePanel();
        });
      }
      if (this.dom.close) this.dom.close.addEventListener('click', () => this.togglePanel(false));
      if (this.dom.panel) {
        this.dom.panel.addEventListener('click', (event) => {
          const qualityButton = event.target.closest('[data-quality]');
          if (qualityButton) {
            this.setQuality(qualityButton.dataset.quality);
            return;
          }
          const fpsButton = event.target.closest('[data-fps]');
          if (fpsButton) {
            this.setFpsCap(fpsButton.dataset.fps);
            return;
          }
          const ambienceButton = event.target.closest('[data-ambience]');
          if (ambienceButton) this.setAmbience(ambienceButton.dataset.ambience);
        });
        this.dom.panel.addEventListener('pointerdown', (event) => event.stopPropagation());
      }
      document.addEventListener('pointerdown', (event) => {
        if (!this.panelOpen) return;
        if (event.target.closest('#perfPanel') || event.target.closest('#perfChip')) return;
        this.togglePanel(false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.panelOpen) this.togglePanel(false);
      });
    }

    attach(stage, workbench) {
      this.stage = stage;
      this.workbench = workbench;
      this.applyQuality();
      this.applyAmbience();
      this.updateUI();
    }

    setAmbience(ambience) {
      if (!['warm', 'cool'].includes(ambience)) return;
      this.ambience = ambience;
      this.applyAmbience();
      this.save();
      this.updateUI();
    }

    applyAmbience() {
      document.body.classList.remove('ambience-warm', 'ambience-cool');
      document.body.classList.add('ambience-' + this.ambience);
      if (this.stage && this.stage.setAmbience) this.stage.setAmbience(this.ambience);
    }

    togglePanel(force) {
      this.panelOpen = force === undefined ? !this.panelOpen : !!force;
      if (this.dom.panel) {
        this.dom.panel.classList.toggle('is-open', this.panelOpen);
        this.dom.panel.setAttribute('aria-hidden', this.panelOpen ? 'false' : 'true');
      }
      if (this.dom.chip) this.dom.chip.setAttribute('aria-expanded', this.panelOpen ? 'true' : 'false');
    }

    setQuality(quality) {
      if (!['auto', 'high', 'balanced', 'low'].includes(quality)) return;
      this.quality = quality;
      this.applyQuality();
      this.save();
      this.updateUI();
    }

    setFpsCap(cap) {
      if (!['auto', '60', '90', '120', '144'].includes(cap)) return;
      this.fpsCap = cap;
      this.lastRender = 0;
      this.renderIntervals.length = 0;
      this.save();
      this.updateUI();
    }

    resolveProfile() {
      if (this.quality === 'auto') return PROFILES[this.effectiveQuality] || PROFILES.balanced;
      return PROFILES[this.quality] || PROFILES.balanced;
    }

    applyQuality() {
      if (this.quality === 'auto') {
        // Start from balanced; the frame-time controller can drop to low if needed.
        this.effectiveQuality = 'balanced';
      } else {
        this.effectiveQuality = this.quality;
      }
      this.profile = this.resolveProfile();
      document.body.classList.remove('quality-high', 'quality-balanced', 'quality-low');
      document.body.classList.add('quality-' + this.effectiveQuality);
      if (this.stage && this.stage.applyQuality) this.stage.applyQuality(this.profile);
      if (this.workbench && this.workbench.onQualityChange) this.workbench.onQualityChange();
    }

    setAutoQuality(next) {
      if (this.quality !== 'auto' || next === this.effectiveQuality) return;
      this.effectiveQuality = next;
      this.profile = this.resolveProfile();
      document.body.classList.remove('quality-high', 'quality-balanced', 'quality-low');
      document.body.classList.add('quality-' + next);
      if (this.stage && this.stage.applyQuality) this.stage.applyQuality(this.profile);
      if (this.workbench && this.workbench.onQualityChange) this.workbench.onQualityChange();
      this.updateUI();
    }

    get chartDpr() {
      return Math.min(window.devicePixelRatio || 1, this.profile.pixelRatio || 1.5);
    }

    get chartInterval() {
      return 1000 / (this.profile.chartFps || 20);
    }

    get uiInterval() {
      return 1000 / (this.profile.uiHz || 10);
    }

    tick(now) {
      if (!this.lastTick) {
        this.lastTick = now;
        this.lastRender = now;
        return true;
      }
      const tickDelta = now - this.lastTick;
      if (tickDelta > 0 && tickDelta < 200) {
        this.tickIntervals.push(tickDelta);
        if (this.tickIntervals.length > 120) this.tickIntervals.shift();
      }
      this.lastTick = now;

      let render = true;
      if (this.fpsCap !== 'auto') {
        const cap = Number(this.fpsCap);
        const interval = 1000 / cap;
        if (now - this.lastRender < interval - 1.0) render = false;
      }
      if (render) {
        if (this.lastRender) {
          const renderedDelta = now - this.lastRender;
          if (renderedDelta > 1 && renderedDelta < 500) {
            this.renderIntervals.push(renderedDelta);
            if (this.renderIntervals.length > 60) this.renderIntervals.shift();
          }
        }
        this.lastRender = now;
        this.renderCount += 1;
      }

      if (now - this.lastStats > 250) {
        this.lastStats = now;
        this.computeStats();
        this.updateReadout();
      }
      if (now - this.lastAutoAdjust > 3000) {
        this.lastAutoAdjust = now;
        this.autoAdjust();
      }
      return render;
    }

    computeStats() {
      if (this.renderIntervals.length > 3) {
        let sum = 0;
        for (let i = 0; i < this.renderIntervals.length; i += 1) sum += this.renderIntervals[i];
        const avg = sum / this.renderIntervals.length;
        this.frameMs = avg;
        this.fps = avg > 0 ? 1000 / avg : 0;
      }
      if (!this.screenHz && this.tickIntervals.length > 30) {
        const sorted = this.tickIntervals.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        this.screenHz = median > 0 ? Math.round(1000 / median) : 0;
      }
    }

    autoAdjust() {
      if (this.quality !== 'auto' || this.fpsCap !== 'auto') return;
      if (this.renderIntervals.length < 20) return;
      const frame = this.frameMs;
      if (frame > 24 && this.effectiveQuality !== 'low') {
        this.setAutoQuality('low');
      } else if (frame < 12.5 && this.effectiveQuality === 'low') {
        this.setAutoQuality('balanced');
      }
    }

    updateReadout() {
      if (this.dom.fps) this.dom.fps.textContent = this.fps > 0 ? this.fps.toFixed(0) : '—';
      if (this.dom.frame) this.dom.frame.textContent = this.frameMs > 0 ? this.frameMs.toFixed(1) + ' ms' : '—';
      if (this.dom.hz) this.dom.hz.textContent = this.screenHz ? this.screenHz + ' Hz' : '检测中';
      const info = this.stage && this.stage.renderer ? this.stage.renderer.info.render : null;
      if (this.dom.draws) this.dom.draws.textContent = info ? String(info.calls) : '—';
      if (this.dom.tris) this.dom.tris.textContent = info ? this.formatCompact(info.triangles) : '—';
      if (this.dom.chipText) {
        const label = this.quality === 'auto' ? '自动' : this.profile.label;
        this.dom.chipText.textContent = `${this.fps > 0 ? this.fps.toFixed(0) : '—'} FPS · ${label}`;
      }
    }

    formatCompact(value) {
      if (!Number.isFinite(value)) return '—';
      if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
      if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
      return String(value);
    }

    updateUI() {
      if (this.dom.qualityLabel) this.dom.qualityLabel.textContent = this.quality === 'auto' ? '自动' : this.profile.label;
      if (this.dom.fpsLabel) this.dom.fpsLabel.textContent = this.fpsCap === 'auto' ? '跟随显示器' : this.fpsCap + ' FPS';
      if (this.dom.ambienceLabel) this.dom.ambienceLabel.textContent = this.ambience === 'warm' ? '暖光展台' : '冷光实验室';
      if (this.dom.panel) {
        this.dom.panel.querySelectorAll('[data-ambience]').forEach((button) => {
          button.classList.toggle('active', button.dataset.ambience === this.ambience);
        });
        this.dom.panel.querySelectorAll('[data-quality]').forEach((button) => {
          button.classList.toggle('active', button.dataset.quality === this.quality);
        });
        this.dom.panel.querySelectorAll('[data-fps]').forEach((button) => {
          button.classList.toggle('active', button.dataset.fps === this.fpsCap);
        });
      }
      this.updateReadout();
    }
  }

  ML.Perf = new PerformanceManager();
})(window);
