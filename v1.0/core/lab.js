/* MotorLab guided experiment drawer. */
(function (ML) {
  const esc = (value) => String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  class LabEngine {
    constructor(workbench) {
      this.workbench = workbench;
      this.machine = null;
      this.experiments = [];
      this.active = null;
      this.stepIndex = 0;
      this.records = [];
      this.completed = new Set();
      this.dom = {
        btn: document.getElementById('labBtn'),
        panel: document.getElementById('labPanel'),
        body: document.getElementById('labBody'),
        title: document.getElementById('labTitle'),
        close: document.getElementById('labClose')
      };
      this.bind();
      this.workbench.onMachineLoad = (machine) => this.load(machine);
      if (this.workbench.machine) this.load(this.workbench.machine);
    }

    bind() {
      if (this.dom.btn) {
        this.dom.btn.addEventListener('click', () => this.toggle());
      }
      if (this.dom.close) this.dom.close.addEventListener('click', () => this.setOpen(false));
      if (this.dom.body) {
        this.dom.body.addEventListener('click', (event) => {
          const start = event.target.closest('[data-start]');
          if (start) {
            this.start(start.dataset.start);
            return;
          }
          const action = event.target.closest('[data-lab]');
          if (!action) return;
          if (action.dataset.lab === 'back') this.backToList();
          else if (action.dataset.lab === 'setup') this.setupCurrent();
          else if (action.dataset.lab === 'record') this.recordCurrent();
          else if (action.dataset.lab === 'restart') this.restart();
          else if (action.dataset.lab === 'export') this.exportCsv();
        });
      }
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isOpen()) this.setOpen(false);
      });
    }

    isOpen() {
      return !!(this.dom.panel && this.dom.panel.classList.contains('is-open'));
    }

    setOpen(open) {
      if (!this.dom.panel) return;
      this.dom.panel.classList.toggle('is-open', open);
      this.dom.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (this.dom.btn) this.dom.btn.classList.toggle('is-active', open);
    }

    toggle() {
      const open = !this.isOpen();
      this.setOpen(open);
      if (open) this.render();
    }

    hide() {
      this.setOpen(false);
      if (this.dom.btn) this.dom.btn.hidden = true;
    }

    load(machine) {
      if (!machine) {
        this.machine = null;
        this.experiments = [];
        this.active = null;
        this.hide();
        return;
      }
      this.machine = machine;
      this.experiments = (ML.experiments && ML.experiments[machine.id]) || [];
      this.active = null;
      this.stepIndex = 0;
      this.records = [];
      this.completed = this.loadCompleted(machine.id);
      if (this.dom.btn) this.dom.btn.hidden = !this.experiments.length;
      if (this.dom.title) {
        this.dom.title.textContent = machine.name ? machine.name + ' · 测量实验' : '测量实验';
      }
      if (this.isOpen()) this.render();
    }

    loadCompleted(machineId) {
      try {
        const raw = JSON.parse(localStorage.getItem('motorlab.lab.v1.' + machineId) || '[]');
        return new Set(Array.isArray(raw) ? raw : []);
      } catch (error) {
        return new Set();
      }
    }

    saveCompleted() {
      if (!this.machine) return;
      try {
        localStorage.setItem('motorlab.lab.v1.' + this.machine.id, JSON.stringify(Array.from(this.completed)));
      } catch (error) {
        // localStorage may be unavailable in some file:// contexts.
      }
    }

    start(id) {
      const experiment = this.experiments.find((item) => item.id === id);
      if (!experiment) return;
      this.active = experiment;
      this.stepIndex = 0;
      this.records = [];
      this.render();
    }

    backToList() {
      this.active = null;
      this.stepIndex = 0;
      this.records = [];
      this.render();
    }

    restart() {
      if (!this.active) return;
      this.stepIndex = 0;
      this.records = [];
      this.render();
    }

    context() {
      if (!this.machine || !this.workbench) return null;
      const readout = this.workbench.getReadout ? this.workbench.getReadout() : null;
      if (!readout) return null;
      return {
        inputs: Object.assign({}, this.workbench.inputs || {}),
        metrics: readout.metrics || {},
        data: readout.data || {},
        state: this.workbench.state,
        machine: this.machine,
        readout
      };
    }

    setupCurrent() {
      if (!this.active) return;
      const step = this.active.steps[this.stepIndex];
      if (!step || !step.setup) return;
      Object.keys(step.setup).forEach((id) => {
        if (this.workbench.setInput) this.workbench.setInput(id, step.setup[id]);
      });
      ML.showToast('参数已设置 · 等读数稳定后记录', 1600);
    }

    isStable(ctx) {
      if (!this.machine) return true;
      const metrics = ctx.metrics || {};
      const inputs = ctx.inputs || {};
      if (this.machine.id === 'dc') {
        return Math.abs((metrics.torque || 0) - (inputs.loadTorque || 0)) < 1.2;
      }
      if (this.machine.id === 'induction') {
        return Math.abs((metrics.torque || 0) - (inputs.load || 0)) < 2.8;
      }
      if (this.machine.id === 'synchronous') {
        return !!(ctx.state && ctx.state.synced) && Math.abs((metrics.speed || 0) - 1500) < 30;
      }
      return true;
    }

    recordCurrent() {
      if (!this.active) return;
      const step = this.active.steps[this.stepIndex];
      if (!step || !step.record) return;
      const ctx = this.context();
      if (!ctx) {
        ML.showToast('仿真尚未就绪', 1500);
        return;
      }
      if (step.check && !step.check(ctx)) {
        ML.showToast('参数还没到位，先点“一键设置”或手动调整', 2200);
        return;
      }
      if (!this.isStable(ctx)) {
        ML.showToast('读数还在变化，等稳定后再记录', 2200);
        return;
      }
      let row = {};
      try {
        row = step.capture ? step.capture(ctx) : {};
      } catch (error) {
        row = {};
      }
      this.records.push(row);
      this.stepIndex += 1;
      if (this.stepIndex >= this.active.steps.length) {
        this.completeExperiment();
      } else {
        this.render();
        ML.showToast('已记录 ' + this.records.length + ' / ' + this.active.steps.length + ' 组数据', 1500);
      }
    }

    completeExperiment() {
      if (!this.active) return;
      this.completed.add(this.active.id);
      this.saveCompleted();
      this.render();
      ML.showToast('实验完成 · 可以导出数据了', 2400);
    }

    exportCsv() {
      if (!this.active || !this.records.length) return;
      const header = this.active.columns.map((column) => column.label);
      const rows = this.records.map((record) => this.active.columns.map((column) => record[column.key] === undefined ? '' : record[column.key]));
      const csv = '\uFEFF' + [header].concat(rows).map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'MotorLab-' + this.machine.id + '-' + this.active.id + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    }

    render() {
      if (!this.dom.body) return;
      if (!this.machine) {
        this.dom.body.innerHTML = '<p class="lab-empty">请先选择一个机型。</p>';
        return;
      }
      if (!this.active) {
        this.renderList();
      } else {
        this.renderTask();
      }
    }

    renderList() {
      const done = this.experiments.filter((experiment) => this.completed.has(experiment.id)).length;
      const cards = this.experiments.map((experiment) => {
        const complete = this.completed.has(experiment.id);
        return '<button class="lab-exp-card' + (complete ? ' is-complete' : '') + '" type="button" data-start="' + esc(experiment.id) + '">' +
          '<span class="lab-exp-index">' + esc(experiment.index) + '</span>' +
          '<span class="lab-exp-main"><b>' + esc(experiment.title) + '</b><small>' + esc(experiment.en) + '</small><em>' + esc(experiment.goal) + '</em></span>' +
          '<span class="lab-exp-arrow">' + (complete ? '已完成' : '开始') + '</span>' +
          '</button>';
      }).join('');
      this.dom.body.innerHTML =
        '<div class="lab-list-head"><span>选择实验</span><b>' + done + ' / ' + this.experiments.length + ' 完成</b></div>' +
        (cards || '<p class="lab-empty">该机型暂无实验任务。</p>') +
        '<p class="lab-list-note">实验数据需要手动记录。先点“一键设置”，等读数稳定后点“记录当前数据”。</p>';
    }

    renderTask() {
      const experiment = this.active;
      const total = experiment.steps.length;
      const completed = this.stepIndex >= total;
      const progress = Math.min(100, Math.round(this.stepIndex / total * 100));
      const steps = experiment.steps.map((step, index) => {
        const isDone = completed || index < this.stepIndex;
        const isCurrent = !completed && index === this.stepIndex;
        let actions = '';
        if (isCurrent) {
          if (step.setup) actions += '<button type="button" class="lab-mini-btn" data-lab="setup">一键设置</button>';
          if (step.record) actions += '<button type="button" class="lab-record-btn" data-lab="record">记录当前数据</button>';
        }
        return '<li class="lab-step' + (isDone ? ' is-done' : '') + (isCurrent ? ' is-current' : '') + '">' +
          '<span class="lab-step-no">' + (isDone ? '✓' : String(index + 1).padStart(2, '0')) + '</span>' +
          '<div class="lab-step-main"><b>' + esc(step.title) + '</b><p>' + esc(step.instruction) + '</p>' + actions + '</div>' +
          '</li>';
      }).join('');

      const table = this.records.length ? (
        '<div class="lab-table-wrap"><table class="lab-table"><thead><tr>' +
        experiment.columns.map((column) => '<th>' + esc(column.label) + '</th>').join('') +
        '</tr></thead><tbody>' +
        this.records.map((record) => '<tr>' + experiment.columns.map((column) => '<td>' + esc(record[column.key]) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>'
      ) : '<p class="lab-empty lab-empty-small">还没有记录。完成上面的步骤后，数据会出现在这里。</p>';

      const footer = completed ? (
        '<div class="lab-conclusion"><span>结论 / CONCLUSION</span><p>' + esc(experiment.conclusion) + '</p></div>' +
        '<div class="lab-actions"><button type="button" class="lab-mini-btn" data-lab="restart">重做实验</button>' +
        (this.records.length ? '<button type="button" class="lab-mini-btn" data-lab="export">导出 CSV</button>' : '') +
        '<button type="button" class="lab-mini-btn" data-lab="back">返回列表</button></div>'
      ) : (
        '<div class="lab-actions">' +
        (this.records.length ? '<button type="button" class="lab-mini-btn" data-lab="export">导出 CSV</button>' : '') +
        '<button type="button" class="lab-mini-btn" data-lab="back">返回列表</button></div>'
      );

      this.dom.body.innerHTML =
        '<button class="lab-back" type="button" data-lab="back">← 返回实验列表</button>' +
        '<div class="lab-task-head"><span class="lab-task-en">EXPERIMENT ' + esc(experiment.index) + ' · ' + esc(experiment.en) + '</span>' +
        '<h4>' + esc(experiment.title) + '</h4><p>' + esc(experiment.goal) + '</p></div>' +
        '<div class="lab-progress"><span style="width:' + progress + '%"></span></div>' +
        '<div class="lab-progress-label"><b>' + Math.min(this.stepIndex, total) + ' / ' + total + ' 组</b><span>' + (completed ? '已完成' : '进行中') + '</span></div>' +
        '<p class="lab-intro">' + esc(experiment.intro) + '</p>' +
        '<ol class="lab-steps">' + steps + '</ol>' +
        '<div class="lab-table-block"><div class="lab-table-head"><span>数据记录</span><b>' + this.records.length + ' 组</b></div>' + table + '</div>' +
        footer;
    }
  }

  ML.LabEngine = LabEngine;
})(window.MotorLab);
