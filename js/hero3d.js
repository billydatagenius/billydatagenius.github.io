/* ============================================================
   BDG Hero 3D — globe + drone (Three.js r128 + GSAP 3)
   - Globe: canvas z1 over the baked hero art, sphere centred on
     the baked hologram (~75% x / 43% y) so it replaces it; the
     founder, headline, CTAs are never covered.
   - Drone: canvas z6, pointer-events:none, path avoids the
     headline column and the baked script text.
   - Respects prefers-reduced-motion, pauses off-screen,
     degrades silently without WebGL or CDNs.
   ============================================================ */
(function(){
  'use strict';
  if (window.__bdgHero3DInit && window.__bdgHero3DInit !== window) return;
  window.__bdgHero3DInit = window;

  var hero = document.querySelector('.hero');
  if (!hero) return;
  if (typeof THREE === 'undefined') return;

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = function(){ return window.innerWidth <= 764; };
  var ticks = { globe: 0, drone: 0 };
  window.__bdgHero3D = ticks;

  /* ---------- shared helpers ---------- */
  function makeRenderer(canvas, dprCap){
    if (!window.WebGLRenderingContext) return null;
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }) ||
           canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return null;
    var r = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    return r;
  }
  function radialTexture(inner, outer, stops){
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    (stops || [[0, inner], [0.4, inner], [1, outer]]).forEach(function(s){ g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.Texture(c); t.needsUpdate = true; return t;
  }
  function latLon(lat, lon, r){
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -(r * Math.sin(phi) * Math.cos(theta)),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }
  function slerp(a, b, t){
    var omega = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    if (omega < 1e-6) return a.clone();
    var so = Math.sin(omega);
    return a.clone().multiplyScalar(Math.sin((1 - t) * omega) / so)
            .add(b.clone().multiplyScalar(Math.sin(t * omega) / so));
  }

  /* ============================================================
     GLOBE
     ============================================================ */
  function initGlobe(){
    var canvas = document.getElementById('globeCanvas');
    if (!canvas) return null;
    var renderer = makeRenderer(canvas, isMobile() ? 1.5 : 2);
    if (!renderer) return null;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0, 3);

    var world = new THREE.Group();      // parallax / position wrapper
    var globe = new THREE.Group();      // spins (drag + idle)
    globe.rotation.x = 0.22;
    globe.rotation.y = -1.1;            // start on the Atlantic / Europe-Africa side
    world.add(globe);
    scene.add(world);

    var R = 1;

    /* core sphere: dark ocean that occludes the far hemisphere (slightly
       translucent so the baked hologram's network glows through) */
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.986, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x06182e, transparent: true, opacity: 0.86 })
    ));

    /* fresnel rim tint on the sphere surface */
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 48),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { c: { value: new THREE.Color(0x2f8dff) } },
        vertexShader:
          'varying vec3 vN; varying vec3 vV;' +
          'void main(){ vN = normalize(normalMatrix * normal);' +
          ' vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz);' +
          ' gl_Position = projectionMatrix * mv; }',
        fragmentShader:
          'uniform vec3 c; varying vec3 vN; varying vec3 vV;' +
          'void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6);' +
          ' gl_FragColor = vec4(c, f * 0.5); }'
      })
    ));

    /* delicate grid lines (lat/lon every 20deg) */
    (function(){
      var pts = [], seg = 64, i;
      for (var lat = -60; lat <= 60; lat += 20){
        for (i = 0; i < seg; i++){
          pts.push(latLon(lat, i / seg * 360 - 180, R * 1.001),
                   latLon(lat, (i + 1) / seg * 360 - 180, R * 1.001));
        }
      }
      for (var lon = -180; lon < 180; lon += 20){
        for (i = 0; i < seg; i++){
          pts.push(latLon(i / seg * 180 - 90, lon, R * 1.001),
                   latLon((i + 1) / seg * 180 - 90, lon, R * 1.001));
        }
      }
      globe.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2e7cc4, transparent: true, opacity: 0.13,
          blending: THREE.AdditiveBlending, depthWrite: false })
      ));
    })();

    /* --- data: cities, mask-driven continents --- */
    var HUB = { 'New York': 1, 'London': 1, 'Dubai': 1, 'Tokyo': 1, 'Johannesburg': 1 };
    var CITIES = [
      [40.7, -74.0, 'New York'], [34.0, -118.2, 'Los Angeles'], [51.5, -0.12, 'London'],
      [48.85, 2.35, 'Paris'], [-26.2, 28.03, 'Johannesburg'], [25.2, 55.27, 'Dubai'],
      [19.07, 72.87, 'Mumbai'], [1.35, 103.82, 'Singapore'], [35.68, 139.69, 'Tokyo'],
      [37.56, 126.97, 'Seoul'], [-33.86, 151.2, 'Sydney'], [-23.55, -46.63, 'Sao Paulo'],
      [30.04, 31.23, 'Cairo'], [6.52, 3.37, 'Lagos'], [43.65, -79.38, 'Toronto'],
      [52.52, 13.4, 'Berlin']
    ];
    var goldCities = {};
    CITIES.forEach(function(c){ if (HUB[c[2]]) goldCities[c[2]] = true; });

    /* land dots sampled from the rasterised world mask */
    var mask = new Image();
    mask.src = 'images/globe-land-mask.png';
    mask.onload = function(){
      try {
        var mc = document.createElement('canvas'); mc.width = 720; mc.height = 360;
        var mx = mc.getContext('2d');
        mx.drawImage(mask, 0, 0, 720, 360);
        var md = mx.getImageData(0, 0, 720, 360).data;
        var isLand = function(lon, lat){
          var x = Math.min(719, Math.max(0, Math.round((lon + 180) / 360 * 720)));
          var y = Math.min(359, Math.max(0, Math.round((90 - lat) / 180 * 360)));
          return md[(y * 720 + x) * 4] > 127;
        };
        function nearestCity(lon, lat){
          var best = null, bd = 1e9;
          CITIES.forEach(function(c){
            var d = (c[0] - lat) * (c[0] - lat) + (c[1] - lon) * (c[1] - lon);
            if (d < bd){ bd = d; best = c[2]; }
          });
          return best || '';
        }
        var N = isMobile() ? 9000 : 15000;
        var blue = [], gold = [], ga = Math.PI * (3 - Math.sqrt(5));
        for (var i = 0; i < N; i++){
          var y = 1 - (i / (N - 1)) * 2;
          var rad = Math.sqrt(Math.max(0, 1 - y * y));
          var th = ga * i;
          var p = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
          var lat = Math.asin(y) * 180 / Math.PI;
          var lon = Math.atan2(p.z, -p.x) * 180 / Math.PI - 180;
          lon = ((lon % 360) + 540) % 360 - 180;
          if (!isLand(lon, lat)) continue;
          /* gold only in a small halo around a hub city, subtle otherwise */
          var bd = 1e9;
          CITIES.forEach(function(c){
            var d2 = (c[0] - lat) * (c[0] - lat) + (c[1] - lon) * (c[1] - lon);
            if (d2 < bd) bd = d2;
          });
          if (goldCities[nearestCity(lon, lat)] && HUB[nearestCity(lon, lat)] && bd < 130) gold.push(p.clone().multiplyScalar(R * 1.004));
          else blue.push(p.clone().multiplyScalar(R * (1.002 + (i % 7) * 0.0007)));
        }
        function mk(arr, color, size, opacity){
          if (!arr.length) return;
          var pos = new Float32Array(arr.length * 3);
          arr.forEach(function(v, i){ pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          globe.add(new THREE.Points(g, new THREE.PointsMaterial({
            color: color, size: size, sizeAttenuation: true, transparent: true, opacity: opacity,
            depthWrite: false, blending: THREE.AdditiveBlending
          })));
        }
        mk(blue, 0x5aa9ff, 0.0165, 0.8);
        mk(gold, 0xf2c14e, 0.026, 0.92);
      } catch (e) { /* mask unavailable: sphere + cities still render */ }
    };

    /* city nodes + great-circle arcs + travelling pulses */
    var pulses = [];
    (function(){
      var texCyan = radialTexture('rgba(140,210,255,.95)', 'rgba(140,210,255,0)');
      var texGold = radialTexture('rgba(255,205,110,.95)', 'rgba(255,205,110,0)');
      var texDot  = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
      var nodes = [];
      CITIES.forEach(function(c, idx){
        var isHub = !!goldCities[c[2]];
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: isHub ? texGold : texCyan, transparent: true, opacity: isHub ? 0.95 : 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sp.position.copy(latLon(c[0], c[1], R * 1.012));
        sp.scale.setScalar(isHub ? 0.085 : 0.06);
        sp.userData = { phase: idx * 0.7, base: isHub ? 0.085 : 0.06 };
        globe.add(sp);
        nodes.push(sp);
      });
      globe.userData.nodes = nodes;

      var LINKS = [
        [0, 2], [2, 5], [5, 8], [8, 10], [1, 8], [0, 11], [2, 13],
        [6, 5], [7, 8], [3, 1], [4, 13], [10, 5], [2, 3], [15, 8]
      ];
      LINKS.forEach(function(pair, k){
        var a = latLon(CITIES[pair[0]][0], CITIES[pair[0]][1], R * 1.012);
        var b = latLon(CITIES[pair[1]][0], CITIES[pair[1]][1], R * 1.012);
        var h = 0.10 + (k % 3) * 0.045;
        var pts = [];
        for (var i = 0; i <= 40; i++){
          var t = i / 40;
          pts.push(slerp(a, b, t).normalize().multiplyScalar(R * (1.012 + h * Math.sin(Math.PI * t))));
        }
        var goldArc = (k % 4 === 0);
        globe.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color: goldArc ? 0xf2b33d : 0x4fa8ff, transparent: true,
            opacity: goldArc ? 0.5 : 0.32, blending: THREE.AdditiveBlending, depthWrite: false
          })
        ));
        var pu = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texDot, color: goldArc ? 0xffd98a : 0x9fd4ff, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        pu.scale.setScalar(0.035);
        globe.add(pu);
        pulses.push({ sprite: pu, a: a, b: b, h: h, t: Math.random(), speed: 0.14 + Math.random() * 0.2 });
      });
    })();

    /* atmosphere + halo */
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.16, 48, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { c: { value: new THREE.Color(0x2e9bff) } },
        vertexShader:
          'varying vec3 vN; varying vec3 vV;' +
          'void main(){ vN = normalize(normalMatrix * normal);' +
          ' vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz);' +
          ' gl_Position = projectionMatrix * mv; }',
        fragmentShader:
          'uniform vec3 c; varying vec3 vN; varying vec3 vV;' +
          'void main(){ float f = pow(0.62 - dot(vN, vV), 3.0);' +
          ' gl_FragColor = vec4(c, clamp(f, 0.0, 1.0) * 0.55); }'
      })
    ));
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(46,145,255,.5)', 'rgba(46,145,255,0)'),
      transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.setScalar(R * 3.2);
    globe.add(halo);

    /* ambient particles drifting around the globe */
    var drift = (function(){
      var n = isMobile() ? 80 : 180;
      var pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++){
        var v = new THREE.Vector3().setFromSphericalCoords(
          R * (1.3 + Math.random() * 0.9),
          Math.acos(2 * Math.random() - 1),
          Math.random() * Math.PI * 2
        );
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var p = new THREE.Points(g, new THREE.PointsMaterial({
        color: 0x77b8ff, size: 0.02, sizeAttenuation: true, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      world.add(p);
      return p;
    })();

    /* --- interaction --- */
    var st = {
      spin: -0.055, userVel: 0, dragging: false, lastX: 0,
      par: { x: 0, y: 0 }, parT: { x: 0, y: 0 }
    };
    hero.addEventListener('pointerdown', function(e){
      if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) return;
      st.dragging = true;
      st.lastX = (e.touches ? e.touches[0].clientX : e.clientX);
    });
    window.addEventListener('pointermove', function(e){
      var x = (e.touches ? e.touches[0].clientX : e.clientX);
      var y = (e.touches ? e.touches[0].clientY : e.clientY);
      var r = hero.getBoundingClientRect();
      st.parT.x = ((x - r.left) / r.width - 0.5) * 2;
      st.parT.y = ((y - r.top) / r.height - 0.5) * 2;
      if (!st.dragging) return;
      var dx = x - st.lastX;
      if (dx){
        st.userVel = -dx * 0.0032;
        st.lastX = x;
      }
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function(ev){
      window.addEventListener(ev, function(){ st.dragging = false; });
    });

    /* --- layout: sphere centre ~75% x / 43% y of hero (the baked hologram) --- */
    var layout = { scale: 1 };
    function relayout(){
      var w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var halfH = Math.tan(19 * Math.PI / 180) * camera.position.z;
      var vw = halfH * camera.aspect, vh = halfH;
      var m = isMobile();
      var cx = m ? 0.88 : 0.78;
      var cy = m ? 0.46 : 0.355;
      var rW = (m ? 0.62 : 0.50) * vw;   // vw is half-visible width: NDC radius = rW/vw, so 0.5 -> 25% of hero width (matches the baked hologram)
      layout.scale = rW / R;
      if (introDone) globe.scale.setScalar(layout.scale);
      world.position.set((cx * 2 - 1) * vw, -(cy * 2 - 1) * vh, 0);
      halo.scale.setScalar(R * (m ? 2.6 : 3.2));
    }

    /* --- intro --- */
    var introDone = false, introT = 0;
    relayout();
    if (REDUCED){ introDone = true; globe.scale.setScalar(layout.scale); }
    else globe.scale.setScalar(layout.scale * 0.22);
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(hero);
    else window.addEventListener('resize', relayout);

    /* --- frame --- */
    var clock = new THREE.Clock();
    var visible = true, raf = 0;
    function frame(){
      raf = 0;
      var dt = Math.min(clock.getDelta(), 0.06);
      var t = clock.elapsedTime;

      if (!introDone){
        introT = Math.min(1, introT + dt * 1.1);
        var e = 1 - Math.pow(1 - introT, 3);
        globe.scale.setScalar(layout.scale * (0.22 + 0.78 * e));
        if (introT >= 1) introDone = true;
      }

      if (!st.dragging || Math.abs(st.userVel) < 0.001) st.userVel *= Math.pow(0.02, dt);
      globe.rotation.y += (st.spin + st.userVel) * dt;
      globe.rotation.x = 0.22 + Math.sin(t * 0.4) * 0.012;
      globe.position.y = Math.sin(t * 0.5) * 0.02;

      st.par.x += (st.parT.x * 0.055 - st.par.x) * dt * 4;
      st.par.y += (st.parT.y * 0.04 - st.par.y) * dt * 4;
      camera.position.x = st.par.x;
      camera.position.y = -st.par.y;
      camera.lookAt(0, 0, 0);

      if (globe.userData.nodes){
        globe.userData.nodes.forEach(function(sp){
          sp.scale.setScalar(sp.userData.base * (1 + Math.sin(t * 1.6 + sp.userData.phase) * 0.16));
        });
      }
      pulses.forEach(function(p){
        p.t = (p.t + p.speed * dt) % 1;
        p.sprite.position.copy(
          slerp(p.a, p.b, p.t).normalize().multiplyScalar(R * (1.012 + p.h * Math.sin(Math.PI * p.t)))
        );
      });
      if (drift) drift.rotation.y += dt * 0.02;

      ticks.globe++;
      renderer.render(scene, camera);
      if (window.__bdgHero3DDebug) window.__bdgHero3DDebug.globe = { renderer: renderer, scene: scene, camera: camera, globe: globe, clock: clock, introDone: function(){ return introDone; } };
      if (visible && !REDUCED) raf = requestAnimationFrame(frame);
    }
    if (window.IntersectionObserver){
      new IntersectionObserver(function(en){
        var was = visible;
        visible = en[0].isIntersecting;
        if (visible && !was && !raf && !REDUCED) raf = requestAnimationFrame(frame);
      }, { threshold: 0.02 }).observe(hero);
    }
    document.addEventListener('visibilitychange', function(){
      if (!document.hidden && visible && !raf && !REDUCED) raf = requestAnimationFrame(frame);
    });

    if (REDUCED){ renderer.render(scene, camera); return null; }
    raf = requestAnimationFrame(frame);
    return null;
  }

  /* ============================================================
     DRONE
     ============================================================ */
  function initDrone(){
    var canvas = document.getElementById('droneCanvas');
    if (!canvas) return null;
    var renderer = makeRenderer(canvas, isMobile() ? 1.25 : 1.75);
    if (!renderer || REDUCED) return null;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0, 6);

    scene.add(new THREE.AmbientLight(0x3c557a, 1.15));
    var hemi = new THREE.HemisphereLight(0x4a7cb5, 0x0c1830, 1.0); scene.add(hemi);
    var keyLight = new THREE.DirectionalLight(0xeaf3ff, 1.8); keyLight.position.set(-4, 6, 5); scene.add(keyLight);
    var rim = new THREE.DirectionalLight(0x37a2ff, 2.6); rim.position.set(5, -2, -4); scene.add(rim);
    var fill = new THREE.DirectionalLight(0x6fb5ff, 0.8); fill.position.set(2, 3, 6); scene.add(fill);

    /* rigid GSAP path applies to `pod`; `sway` adds cursor-follow;
       `wobble` inside adds organic micro-motion */
    var pod = new THREE.Group();
    var sway = new THREE.Group();
    var wobble = new THREE.Group();
    pod.add(sway);
    sway.add(wobble);
    scene.add(pod);

    /* --- model --- */
    var metal = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.55, roughness: 0.4 });
    var steel = new THREE.MeshStandardMaterial({ color: 0xc3ccd6, metalness: 0.8, roughness: 0.3 });
    var accent = new THREE.MeshStandardMaterial({ color: 0x1668b3, metalness: 0.4, roughness: 0.4,
      emissive: 0x0d3f73, emissiveIntensity: 0.9 });
    var ledWhite = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 1 });
    var ledBlue = new THREE.MeshBasicMaterial({ color: 0x54c7ff });

    var body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.5), metal);
    body.position.y = 0.02; wobble.add(body);
    var canopy = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.3), accent);
    canopy.position.set(0, 0.135, 0); wobble.add(canopy);
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), metal);
    nose.position.set(0, 0.03, 0.28); wobble.add(nose);
    var lens = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x8fdcff }));
    lens.position.set(0, 0.045, 0.315); wobble.add(lens);
    var belly = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), accent);
    belly.position.set(0, -0.075, 0); wobble.add(belly);

    var armGeo = new THREE.CylinderGeometry(0.028, 0.036, 0.46, 8);
    var props = [];
    var PODS = [[-0.33, 0.24], [0.33, 0.24], [-0.33, -0.24], [0.33, -0.24]];
    PODS.forEach(function(p, i){
      var arm = new THREE.Mesh(armGeo, steel);
      arm.position.set(p[0] * 0.55, 0.02, p[1] * 0.55);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -Math.atan2(p[1], p[0]);
      wobble.add(arm);
      var podCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.11, 12), metal);
      podCap.position.set(p[0], 0.075, p[1]); wobble.add(podCap);
      var prop = new THREE.Group();
      prop.position.set(p[0], 0.14, p[1]);
      var blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.035),
        new THREE.MeshStandardMaterial({ color: 0x20242c, metalness: 0.7, roughness: 0.4,
          transparent: true, opacity: 0.85 }));
      blade.rotation.y = i % 2 ? 0.5 : -0.5;
      prop.add(blade);
      var blur = new THREE.Mesh(new THREE.CircleGeometry(0.185, 24),
        new THREE.MeshBasicMaterial({ color: 0x62b6ff, transparent: true, opacity: 0.13,
          side: THREE.DoubleSide, depthWrite: false }));
      blur.rotation.x = -Math.PI / 2;
      prop.add(blur);
      wobble.add(prop);
      props.push({ group: prop, blur: blur, dir: i % 2 ? 1 : -1 });
      var led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), i < 2 ? ledWhite : ledBlue);
      led.position.set(p[0], 0.004, p[1]);
      wobble.add(led);
    });
    var under = new THREE.PointLight(0x2e9bff, 1.0, 3);
    under.position.set(0, -0.35, 0);
    wobble.add(under);

    /* --- layout --- */
    var layout = { vw: 1, vh: 1 };
    function relayout(){
      var w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var halfH = Math.tan(19 * Math.PI / 180) * camera.position.z;
      layout.vw = halfH * camera.aspect; layout.vh = halfH;
      pod.scale.setScalar(layout.vw * (isMobile() ? 0.12 : 0.155));
    }
    relayout();
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(hero);
    else window.addEventListener('resize', relayout);

    /* hero fractions -> world; x: 0 left .. 1 right, y: 0 top .. 1 bottom.
       layout.vw = half-visible width, layout.vh = half-visible height */
    function fx(x){ return (x * 2 - 1) * layout.vw; }
    function fy(y){ return -(y * 2 - 1) * layout.vh; }

    /* --- flight: two alternating passes that avoid the headline column,
           the baked script text and the CTA strip --- */
    function key(tl, at, dur, x, y, z, bank){
      tl.to(pod.position, { x: fx(x), y: fy(y), z: z, duration: dur, ease: 'sine.inOut' }, at);
      tl.to(pod.rotation, { z: bank, duration: dur * 0.7, ease: 'sine.inOut' }, at);
    }
    var tl = gsap.timeline({ repeat: -1 });
    tl.eventCallback('onRepeat', function(){ tl.timeScale(0.9 + Math.random() * 0.25); });

    /* pass A: enter left, sweep the lower corridor, exit right */
    pod.visible = false;
    tl.set(pod.position, { x: fx(-0.16), y: fy(0.97), z: -1.2 });
    tl.set(pod.rotation, { y: 0.5, z: 0.12, x: -0.05 });
    tl.call(function(){ pod.visible = true; });
    key(tl, 0.0, 2.2, 0.22, 0.93, -0.8, 0.16);
    key(tl, 2.2, 2.6, 0.52, 0.885, 0.3, 0.10);
    key(tl, 4.8, 2.4, 0.81, 0.845, 0.9, 0.02);
    key(tl, 7.2, 1.8, 1.11, 0.80, 1.4, -0.06);
    tl.call(function(){ pod.visible = false; });
    tl.to({}, { duration: 1.0 });

    /* pass B: enter right, slow patrol across the mid-right zone, exit right */
    tl.set(pod.position, { x: fx(1.16), y: fy(0.60), z: 1.1 });
    tl.set(pod.rotation, { y: -0.6, z: -0.1, x: -0.05 });
    tl.call(function(){ pod.visible = true; });
    tl.to(pod.position, { x: fx(0.81), y: fy(0.54), z: 0.4, duration: 2.8, ease: 'sine.out' });
    tl.to(pod.rotation, { y: -0.9, z: -0.14, duration: 2.0, ease: 'sine.inOut' }, '<');
    tl.to(pod.position, { x: fx(0.65), y: fy(0.46), z: 1.2, duration: 2.4, ease: 'sine.inOut' });
    tl.to(pod.rotation, { y: -1.5, z: -0.05, duration: 2.0, ease: 'sine.inOut' }, '<');
    tl.to(pod.position, { x: fx(0.83), y: fy(0.40), z: 0.2, duration: 2.6, ease: 'sine.inOut' });
    tl.to(pod.rotation, { y: -0.6, z: 0.10, duration: 2.0, ease: 'sine.inOut' }, '<');
    tl.to(pod.position, { x: fx(1.15), y: fy(0.355), z: -0.6, duration: 2.2, ease: 'sine.in' });
    tl.to(pod.rotation, { y: 0.4, z: 0.14, duration: 1.6, ease: 'sine.inOut' }, '<');
    tl.call(function(){ pod.visible = false; });
    tl.to({}, { duration: 1.2 });

    /* subtle cursor-follow offset */
    var follow = { x: 0, y: 0 };
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect();
      follow.x = ((e.clientX - r.left) / r.width - 0.5) * layout.vw * 0.05;
      follow.y = -((e.clientY - r.top) / r.height - 0.5) * layout.vh * 0.06;
    }, { passive: true });

    /* --- frame --- */
    var clock = new THREE.Clock();
    var visible = true, raf = 0;
    function frame(){
      raf = 0;
      var dt = Math.min(clock.getDelta(), 0.06);
      var t = clock.elapsedTime;
      props.forEach(function(p){
        p.group.rotation.y += p.dir * dt * 46;
        p.blur.material.opacity = 0.11 + Math.sin(t * 30 + p.dir * 2) * 0.02;
      });
      wobble.rotation.x = Math.sin(t * 6.7) * 0.03;
      wobble.rotation.z = Math.sin(t * 4.9) * 0.04;
      wobble.position.y = Math.sin(t * 2.1) * 0.045;
      wobble.position.z = Math.cos(t * 1.6) * 0.03;
      ledWhite.opacity = Math.sin(t * 9) > 0.55 ? 1 : 0.25;
      sway.position.x += (follow.x - sway.position.x) * dt * 2;
      sway.position.y += (follow.y - sway.position.y) * dt * 2;

      ticks.drone++;
      renderer.render(scene, camera);
      if (window.__bdgHero3DDebug) window.__bdgHero3DDebug.drone = { renderer: renderer, scene: scene, camera: camera, pod: pod, tl: tl };
      if (visible) raf = requestAnimationFrame(frame);
    }
    if (window.IntersectionObserver){
      new IntersectionObserver(function(en){
        visible = en[0].isIntersecting;
        if (!visible) tl.pause();
        else { tl.play(); if (!raf) raf = requestAnimationFrame(frame); }
      }, { threshold: 0.02 }).observe(hero);
    }
    document.addEventListener('visibilitychange', function(){
      if (document.hidden){ tl.pause(); }
      else if (visible){ tl.play(); if (!raf) raf = requestAnimationFrame(frame); }
    });

    raf = requestAnimationFrame(frame);
    return null;
  }

  /* ---------- boot ---------- */
  function boot(){
    if (typeof gsap === 'undefined') return;      // CDN failed: keep the plain hero
    try { initGlobe(); } catch (e) { (window.__bdgBootErrors = window.__bdgBootErrors || []).push('globe: ' + e.message); }
    try { initDrone(); } catch (e) { (window.__bdgBootErrors = window.__bdgBootErrors || []).push('drone: ' + e.message); }
    hero.classList.add('bdg-3d');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
