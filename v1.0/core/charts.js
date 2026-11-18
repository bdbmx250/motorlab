/* Canvas chart primitives shared by all machine modules. */
(function (global) {
  const ML = global.MotorLab;

  const Charts = {
    colors: {
      cyan: '#57dcff',
      amber: '#ffc66b',
      mint: '#66e6c2',
      rose: '#ff7e9b',
      violet: '#b49bff',
      blue: '#7cb8ff',
      muted: 'rgba(125, 166, 185, 0.72)',
      grid: 'rgba(112, 172, 199, 0.09)',
      ink: '#e9f5fa'
    },

    prepare(canvas, force) {
      const dprCap = ML.Perf ? ML.Perf.chartDpr : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      if (force || !canvas._mlCtx || !canvas._mlW || !canvas._mlH) {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas._mlW = Math.max(160, rect.width);
        canvas._mlH = Math.max(90, rect.height);
      }
      const w = canvas._mlW;
      const h = canvas._mlH;
      const pixelW = Math.round(w * dpr);
      const pixelH = Math.round(h * dpr);
      if (canvas.width !== pixelW || canvas.height !== pixelH || canvas._mlDpr !== dpr) {
        canvas.width = pixelW;
        canvas.height = pixelH;
        canvas._mlCtx = canvas.getContext('2d');
        canvas._mlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas._mlDpr = dpr;
      } else if (!canvas._mlCtx) {
        canvas._mlCtx = canvas.getContext('2d');
        canvas._mlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas._mlDpr = dpr;
      }
      return { ctx: canvas._mlCtx, w, h };
    },

    frame(w, h, pad) {
      const p = Object.assign({ left: 34, right: 14, top: 14, bottom: 24 }, pad || {});
      return { left: p.left, right: w - p.right, top: p.top, bottom: h - p.bottom, w, h, pad: p };
    },

    clear(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(8, 24, 38, 0.22)');
      g.addColorStop(1, 'rgba(4, 12, 20, 0.035)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },

    grid(ctx, box, columns, rows) {
      ctx.save();
      ctx.strokeStyle = Charts.colors.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      for (let i = 0; i <= columns; i += 1) {
        const x = box.left + (i / columns) * (box.right - box.left);
        ctx.beginPath();
        ctx.moveTo(x, box.top);
        ctx.lineTo(x, box.bottom);
        ctx.stroke();
      }
      for (let i = 0; i <= rows; i += 1) {
        const y = box.top + (i / rows) * (box.bottom - box.top);
        ctx.beginPath();
        ctx.moveTo(box.left, y);
        ctx.lineTo(box.right, y);
        ctx.stroke();
      }
      ctx.restore();
    },

    border(ctx, box) {
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 190, 218, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.restore();
    },

    label(ctx, text, x, y, options) {
      const o = options || {};
      ctx.save();
      ctx.fillStyle = o.color || Charts.colors.muted;
      ctx.font = `${o.weight || 400} ${o.size || 9}px "Cascadia Mono", Consolas, monospace`;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'alphabetic';
      ctx.fillText(text, x, y);
      ctx.restore();
    },

    line(ctx, points, color, width, options) {
      if (!points || points.length < 2) return;
      const o = options || {};
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (o.dash) ctx.setLineDash(o.dash);
      if (o.glow !== false) {
        ctx.shadowColor = color;
        ctx.shadowBlur = o.glow === undefined ? 5 : o.glow;
      }
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
      ctx.restore();
    },

    dot(ctx, x, y, color, radius, options) {
      const o = options || {};
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = o.glow === undefined ? 10 : o.glow;
      ctx.beginPath();
      ctx.arc(x, y, radius || 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    arrow(ctx, x1, y1, x2, y2, color, width, label, options) {
      const o = options || {};
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width || 1.4;
      ctx.shadowColor = color;
      ctx.shadowBlur = o.glow === undefined ? 5 : o.glow;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const size = o.head || 6;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(angle - 0.42) * size, y2 - Math.sin(angle - 0.42) * size);
      ctx.lineTo(x2 - Math.cos(angle + 0.42) * size, y2 - Math.sin(angle + 0.42) * size);
      ctx.closePath();
      ctx.fill();
      if (label) {
        ctx.shadowBlur = 0;
        ctx.font = `${o.labelSize || 10}px "Cascadia Mono", Consolas, monospace`;
        ctx.fillText(label, x2 + (o.labelDx === undefined ? 6 : o.labelDx), y2 + (o.labelDy === undefined ? -6 : o.labelDy));
      }
      ctx.restore();
    },

    poly(ctx, points, fill, opacity) {
      if (!points || points.length < 3) return;
      ctx.save();
      ctx.globalAlpha = opacity === undefined ? 1 : opacity;
      ctx.fillStyle = fill;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    frameFor(box, xMin, xMax, yMin, yMax) {
      const spanX = Math.max(1e-9, xMax - xMin);
      const spanY = Math.max(1e-9, yMax - yMin);
      return {
        x: (value) => box.left + ((value - xMin) / spanX) * (box.right - box.left),
        y: (value) => box.bottom - ((value - yMin) / spanY) * (box.bottom - box.top),
        xMin, xMax, yMin, yMax, box
      };
    },

    axisTicks(ctx, frame, options) {
      const o = options || {};
      const xTicks = o.xTicks || 4;
      const yTicks = o.yTicks || 4;
      for (let i = 0; i <= xTicks; i += 1) {
        const value = frame.xMin + (i / xTicks) * (frame.xMax - frame.xMin);
        const x = frame.x(value);
        Charts.label(ctx, (o.xFormat ? o.xFormat(value) : value.toFixed(o.xDigits === undefined ? 0 : o.xDigits)), x, frame.box.bottom + 13, { align: 'center', size: o.size || 8 });
      }
      for (let i = 0; i <= yTicks; i += 1) {
        const value = frame.yMin + (i / yTicks) * (frame.yMax - frame.yMin);
        const y = frame.y(value);
        Charts.label(ctx, (o.yFormat ? o.yFormat(value) : value.toFixed(o.yDigits === undefined ? 0 : o.yDigits)), frame.box.left - 6, y + 3, { align: 'right', size: o.size || 8 });
      }
      if (o.xUnit) Charts.label(ctx, o.xUnit, frame.box.right, frame.box.bottom + 20, { align: 'right', size: 7 });
      if (o.yUnit) Charts.label(ctx, o.yUnit, frame.box.left, frame.box.top - 3, { size: 7 });
    },

    note(ctx, text, x, y, color) {
      Charts.label(ctx, text, x, y, { color: color || 'rgba(104, 151, 169, 0.65)', size: 7.5 });
    },

    legendDot(ctx, x, y, color, text) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(155, 195, 212, 0.85)';
      ctx.font = '8px "Microsoft YaHei UI", sans-serif';
      ctx.fillText(text, x + 6, y + 3);
      ctx.restore();
    },

    wave(ctx, box, amplitude, cycles, phase, color, width) {
      const points = [];
      const count = 100;
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const x = box.left + t * (box.right - box.left);
        const y = (box.top + box.bottom) / 2 - Math.cos(phase - t * Math.PI * 2 * cycles) * amplitude;
        points.push([x, y]);
      }
      Charts.line(ctx, points, color, width || 1.4);
      return points;
    }
  };

  ML.Charts = Charts;
})(window);
