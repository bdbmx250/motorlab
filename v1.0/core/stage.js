/* Three.js stage: renderer, camera, lights, laboratory floor, camera fitting. */
(function (global) {
  const ML = global.MotorLab;
  const THREE = global.THREE;

  class Stage {
    constructor(canvas) {
      this.canvas = canvas;
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.floorY = -2.55;
      this.quality = null;
      this.ambience = 'warm';
      this.explodedLighting = false;
      this.animTime = 0;
      this.cameraTween = null;
      this.defaultDirection = new THREE.Vector3(0.58, 0.32, 0.76).normalize();
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x03080e, 0.028);
      this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 160);
      this.camera.position.set(8.4, 5.4, 11.2);
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.48;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setClearColor(0x000000, 0);
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.065;
      this.controls.rotateSpeed = 0.55;
      this.controls.zoomSpeed = 0.85;
      this.controls.panSpeed = 0.7;
      this.controls.minDistance = 3.4;
      this.controls.maxDistance = 42;
      this.controls.minPolarAngle = 0.16;
      this.controls.maxPolarAngle = 1.62;
      this.controls.target.set(0, 0, 0);
      this.controls.screenSpacePanning = true;
      this.controls.autoRotate = false;
      this.controls.autoRotateSpeed = 0.55;
      this.initLights();
      this.buildLab();
      this.resize();
    }

    initLights() {
      const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x1a130f, 0.25);
      this.scene.add(hemi);
      this.hemiLight = hemi;

      const key = new THREE.DirectionalLight(0xfff3e2, 0.32);
      key.position.set(7.5, 10.5, 8.5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 30;
      key.shadow.camera.left = -8;
      key.shadow.camera.right = 8;
      key.shadow.camera.top = 8;
      key.shadow.camera.bottom = -8;
      key.shadow.bias = -0.0003;
      key.shadow.normalBias = 0.025;
      this.scene.add(key);
      this.keyLight = key;

      const fill = new THREE.PointLight(0x54d8ff, 0.1, 30, 2);
      fill.position.set(-7, 2.8, 6.5);
      this.scene.add(fill);
      const rim = new THREE.PointLight(0xff9860, 0.14, 26, 2);
      rim.position.set(5.5, 1.6, -8);
      this.scene.add(rim);
      const under = new THREE.PointLight(0x2f86a4, 0.06, 16, 2);
      under.position.set(0, -2, 2.2);
      this.scene.add(under);
      this.fillLight = fill;
      this.rimLight = rim;
      this.underLight = under;

      const front = new THREE.DirectionalLight(0x97dcff, 0.1);
      front.position.set(-5, 4, 9);
      this.scene.add(front);
      this.frontLight = front;

      const spot = new THREE.SpotLight(0xffc489, 0, 42, 0.44, 0.82, 1.2);
      spot.position.set(4.5, 8.2, 5.2);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = false;
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.spotLight = spot;

      const explodedAmbient = new THREE.AmbientLight(0xbfe9ff, 0);
      this.scene.add(explodedAmbient);
      this.explodedAmbient = explodedAmbient;

      this.lightProfiles = {
        cool: {
          hemiSky: 0xbfe9ff, hemiGround: 0x1a130f, hemiBase: 0.25,
          key: 0xfff3e2, keyBase: 0.32, keyExploded: 0.82,
          fill: 0x54d8ff, fillBase: 0.1, fillExploded: 0.24,
          rim: 0xff9860, rimBase: 0.14, rimExploded: 0.3,
          under: 0x2f86a4, underBase: 0.06,
          front: 0x97dcff, frontBase: 0.1, frontExploded: 0.18,
          spot: 0x9fdcff, spotBase: 0.1, spotExploded: 0.22,
          ambient: 0xbfe9ff, ambientExploded: 0.32,
          fog: 0x03080e, exposure: 0.48, floorGlow: 0x2f86a4
        },
        warm: {
          hemiSky: 0xffd6a2, hemiGround: 0x2a1509, hemiBase: 0.38,
          key: 0xffd8ad, keyBase: 0.53, keyExploded: 1.02,
          fill: 0xffa86b, fillBase: 0.16, fillExploded: 0.3,
          rim: 0xff6f3f, rimBase: 0.38, rimExploded: 0.62,
          under: 0xc2662f, underBase: 0.12,
          front: 0xffbd87, frontBase: 0.15, frontExploded: 0.22,
          spot: 0xffc27a, spotBase: 0.68, spotExploded: 1.0,
          ambient: 0xffcf9a, ambientExploded: 0.14,
          fog: 0x0a0604, exposure: 0.57, floorGlow: 0xff9b53
        }
      };
    }

    setAmbience(mode) {
      if (!this.lightProfiles) return;
      this.ambience = mode === 'cool' ? 'cool' : 'warm';
      const p = this.lightProfiles[this.ambience];
      if (this.hemiLight) {
        this.hemiLight.color.setHex(p.hemiSky);
        this.hemiLight.groundColor.setHex(p.hemiGround);
      }
      if (this.keyLight) this.keyLight.color.setHex(p.key);
      if (this.fillLight) this.fillLight.color.setHex(p.fill);
      if (this.rimLight) this.rimLight.color.setHex(p.rim);
      if (this.underLight) this.underLight.color.setHex(p.under);
      if (this.frontLight) this.frontLight.color.setHex(p.front);
      if (this.spotLight) this.spotLight.color.setHex(p.spot);
      if (this.explodedAmbient) this.explodedAmbient.color.setHex(p.ambient);
      if (this.scene.fog) this.scene.fog.color.setHex(p.fog);
      this.renderer.toneMappingExposure = p.exposure;
      if (this.floorGlow && this.floorGlow.material) this.floorGlow.material.color.setHex(p.floorGlow);
      this.applyLighting();
      document.body.classList.toggle('ambience-warm', this.ambience === 'warm');
      document.body.classList.toggle('ambience-cool', this.ambience === 'cool');
    }

    applyLighting() {
      if (!this.lightProfiles) return;
      const p = this.lightProfiles[this.ambience] || this.lightProfiles.warm;
      const exploded = !!this.explodedLighting;
      this.lightBase = { fill: p.fillBase, rim: p.rimBase };
      if (this.hemiLight) this.hemiLight.intensity = exploded ? p.hemiBase + 0.47 : p.hemiBase;
      if (this.keyLight) this.keyLight.intensity = exploded ? p.keyExploded : p.keyBase;
      if (this.fillLight) this.fillLight.intensity = exploded ? p.fillExploded : p.fillBase;
      if (this.rimLight) this.rimLight.intensity = exploded ? p.rimExploded : p.rimBase;
      if (this.underLight) this.underLight.intensity = p.underBase;
      if (this.frontLight) this.frontLight.intensity = exploded ? p.frontExploded : p.frontBase;
      if (this.spotLight) this.spotLight.intensity = exploded ? p.spotExploded : p.spotBase;
      if (this.explodedAmbient) this.explodedAmbient.intensity = exploded ? p.ambientExploded : 0;
    }

    buildLab() {
      this.lab = new THREE.Group();
      this.scene.add(this.lab);

      const floorY = this.floorY;
      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(10.5, 10.9, 0.16, 128),
        ML.makeStandard(0x02070b, 0.2, 0.78, { envMapIntensity: 0.1 })
      );
      platform.position.y = floorY - 0.08;
      platform.receiveShadow = true;
      this.lab.add(platform);

      const underlay = new THREE.Mesh(
        new THREE.CircleGeometry(17, 128),
        new THREE.MeshBasicMaterial({ color: 0x01060a, transparent: true, opacity: 0.94, depthWrite: false })
      );
      underlay.rotation.x = -Math.PI / 2;
      underlay.position.y = floorY - 0.17;
      this.lab.add(underlay);

      const glowTexture = ML.makeCanvasTexture(512, 512, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(70, 191, 225, 0.26)');
        g.addColorStop(0.24, 'rgba(32, 116, 146, 0.14)');
        g.addColorStop(0.62, 'rgba(12, 48, 66, 0.05)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(17.5, 17.5),
        new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = floorY + 0.012;
      this.lab.add(glow);
      this.floorGlow = glow;

      const ringDefs = [
        [2.55, 2.57, 0x51c6e8, 0.34],
        [3.75, 3.765, 0x2b829f, 0.22],
        [5.15, 5.17, 0x51c6e8, 0.2],
        [7.3, 7.32, 0x2b6c80, 0.18]
      ];
      ringDefs.forEach((def) => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(def[0], def[1], 160),
          new THREE.MeshBasicMaterial({ color: def[2], transparent: true, opacity: def[3], depthWrite: false, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = floorY + 0.014;
        this.lab.add(ring);
      });

      const ticks = [];
      for (let i = 0; i < 96; i += 1) {
        const a = (i / 96) * Math.PI * 2;
        const inner = i % 8 === 0 ? 4.1 : 4.28;
        const outer = i % 8 === 0 ? 4.38 : 4.34;
        ticks.push(Math.cos(a) * inner, floorY + 0.018, Math.sin(a) * inner);
        ticks.push(Math.cos(a) * outer, floorY + 0.018, Math.sin(a) * outer);
      }
      const tickGeo = new THREE.BufferGeometry();
      tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
      this.lab.add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: 0x4b9ab4, transparent: true, opacity: 0.25, depthWrite: false })));

      const labelTexture = ML.makeCanvasTexture(1024, 160, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(130, 205, 232, 0.4)';
        ctx.font = '500 36px "Cascadia Mono", Consolas, monospace';
        ctx.fillText('MOTORLAB  /  ELECTRIC MACHINERY  /  VIRTUAL LAB', w / 2, h * 0.4);
        ctx.fillStyle = 'rgba(106, 164, 185, 0.3)';
        ctx.font = '400 20px "Cascadia Mono", Consolas, monospace';
        ctx.fillText('STRUCTURE  ·  FIELD  ·  TORQUE  ·  LOSS', w / 2, h * 0.68);
      });
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(6.8, 1.05),
        new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(0, floorY + 0.02, 4.6);
      this.lab.add(label);

      const particleCount = 230;
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 3.5 + Math.random() * 9;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = -1.2 + Math.random() * 8;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        const c = new THREE.Color(Math.random() > 0.9 ? 0xffb06f : 0x6dd5f0);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const pTex = ML.makeCanvasTexture(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(200,240,255,0.6)');
        g.addColorStop(1, 'rgba(80,180,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
        size: 0.075,
        map: pTex,
        transparent: true,
        opacity: 0.5,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      }));
      this.lab.add(this.particles);

      this.contactShadow = new THREE.Mesh(
        new THREE.CircleGeometry(2.8, 64),
        new THREE.MeshBasicMaterial({
          map: ML.makeCanvasTexture(256, 256, (ctx, w, h) => {
            const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            g.addColorStop(0, 'rgba(0,0,0,0.55)');
            g.addColorStop(0.56, 'rgba(0,0,0,0.26)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
          }),
          transparent: true,
          opacity: 0.55,
          depthWrite: false
        })
      );
      this.contactShadow.rotation.x = -Math.PI / 2;
      this.contactShadow.position.y = floorY + 0.021;
      this.lab.add(this.contactShadow);
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      const width = this.canvas.clientWidth || this.width;
      const height = this.canvas.clientHeight || this.height;
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
      const cap = this.quality ? this.quality.pixelRatio : 2;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
      this.renderer.setSize(width, height, false);
    }

    applyQuality(profile) {
      this.quality = profile || { pixelRatio: 1.5, shadowSize: 1024, shadows: true, blur: 'balanced' };
      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || (window.innerHeight - 72);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio || 1.5));
      this.renderer.setSize(width, height, false);
      this.renderer.shadowMap.enabled = !!this.quality.shadows;
      if (this.keyLight) {
        const size = this.quality.shadowSize || 1024;
        if (this.keyLight.shadow.mapSize.x !== size) {
          this.keyLight.shadow.mapSize.set(size, size);
          if (this.keyLight.shadow.map) {
            this.keyLight.shadow.map.dispose();
            this.keyLight.shadow.map = null;
          }
        }
      }
      if (this.particles) this.particles.visible = this.quality.blur !== 'low';
      if (this.floorGlow) this.floorGlow.visible = this.quality.blur !== 'low';
    }

    applyFit(box, safe, padding) {
      if (!box || box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const corners = [];
      [box.min.x, box.max.x].forEach((x) => {
        [box.min.y, box.max.y].forEach((y) => {
          [box.min.z, box.max.z].forEach((z) => corners.push(new THREE.Vector3(x, y, z)));
        });
      });
      const direction = (safe && safe.direction ? safe.direction : this.defaultDirection).clone().normalize();
      const safeW = ML.clamp((safe && safe.halfW) || 0.34, 0.12, 0.9);
      const safeH = ML.clamp((safe && safe.halfH) || 0.38, 0.12, 0.9);
      const tempCamera = this.camera.clone();
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      let distance = Math.max(3.4, sphere.radius / Math.tan(ML.degToRad(this.camera.fov) / 2) / Math.min(safeH, safeW) * 0.6);
      const fillTarget = 0.94;
      for (let i = 0; i < 8; i += 1) {
        tempCamera.position.copy(center).addScaledVector(direction, distance);
        tempCamera.lookAt(center);
        tempCamera.updateMatrixWorld(true);
        let maxX = 0;
        let maxY = 0;
        corners.forEach((corner) => {
          const p = corner.clone().project(tempCamera);
          maxX = Math.max(maxX, Math.abs(p.x));
          maxY = Math.max(maxY, Math.abs(p.y));
        });
        const ratio = Math.max(maxX / safeW, maxY / safeH);
        if (!Number.isFinite(ratio) || ratio <= 0) break;
        const next = ML.clamp(distance * ratio / fillTarget, 3.4, 46);
        if (Math.abs(next - distance) < 0.01) {
          distance = next;
          break;
        }
        distance = next;
      }
      distance *= (padding || 1.0) * 0.74;
      distance = ML.clamp(distance, 3.4, 46);
      this.flyTo(center.clone().addScaledVector(direction, distance), center, 1.05);
    }

    fitToObject(object, safe, padding) {
      const box = new THREE.Box3().setFromObject(object);
      this.applyFit(box, safe, padding);
    }

    setExplodedLighting(exploded) {
      this.explodedLighting = !!exploded;
      this.applyLighting();
    }

    flyTo(position, target, duration) {
      this.cameraTween = {
        fromPosition: this.camera.position.clone(),
        toPosition: position.clone(),
        fromTarget: this.controls.target.clone(),
        toTarget: target.clone(),
        startTime: performance.now(),
        duration: (duration === undefined ? 1.0 : duration) * 1000
      };
    }

    updateCameraTween(now) {
      if (!this.cameraTween) return;
      const t = ML.clamp((now - this.cameraTween.startTime) / this.cameraTween.duration, 0, 1);
      const eased = ML.easeInOutCubic(t);
      this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, eased);
      this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, eased);
      if (t >= 1) this.cameraTween = null;
    }

    update(dt, time) {
      this.animTime = time;
      this.controls.update();
      this.updateCameraTween(performance.now());
      if (this.particles) this.particles.rotation.y += dt * 0.004;
      const base = this.lightBase || { fill: 0.1, rim: 0.14 };
      if (this.fillLight) this.fillLight.intensity = base.fill + Math.sin(time * 0.55) * 0.02;
      if (this.rimLight) this.rimLight.intensity = base.rim + Math.sin(time * 0.42 + 1.8) * 0.015;
      if (this.floorGlow) this.floorGlow.material.opacity = 0.48 + Math.sin(time * 0.3) * 0.03;
    }

    render() {
      this.renderer.render(this.scene, this.camera);
    }
  }

  ML.Stage = Stage;
})(window);
