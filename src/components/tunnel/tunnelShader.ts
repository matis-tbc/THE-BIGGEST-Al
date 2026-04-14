export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
// Infinite Fractal Descent
//
// Technique: Layered 2D fractal zoom with depth compositing.
// 6 depth layers rendered at exponentially spaced zoom levels.
// Each layer uses iterative fold/rotate/scale to create
// kaleidoscopic structures. Layers composite front-to-back
// so closer "structures" occlude deeper ones — creating the
// illusion of passing through 3D worlds.
//
// The infinite loop works via mod() on the zoom phase:
// when a layer passes the camera, it wraps to the back.
// With 6 layers this is seamless.
//
// Performance: ~48 fold ops per pixel. No raymarching.
// ═══════════════════════════════════════════════════════════

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;

  #define PI  3.14159265359
  #define TAU 6.28318530718

  mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  // ── Fractal pattern ──────────────────────────────────────
  // Iterative fold fractal. Returns two values:
  //   .x = structure intensity (high = solid surface, low = void)
  //   .y = edge intensity (high = edge/ridge of structure)
  //
  // The seed parameter makes each depth layer structurally unique.
  //
  vec2 fractalPattern(vec2 p, float seed) {
    float intensity = 0.0;
    float edge = 0.0;
    float scale = 1.0;

    // Per-layer variation from seed
    float rotBase = 0.6 + seed * 0.4;
    vec2 offset = vec2(
      0.5 + 0.15 * sin(seed * 5.0),
      0.4 + 0.12 * cos(seed * 7.0)
    );

    for (int i = 0; i < 8; i++) {
      float fi = float(i);

      // Fold — creates kaleidoscope symmetry
      p = abs(p);

      // Subtract offset — creates branching/structure
      p -= offset;

      // Rotate — each iteration slightly different
      p *= rot2(rotBase + fi * 0.08);

      // Scale into detail
      p *= 1.25;
      scale *= 1.25;

      // Accumulate structure intensity
      float d = length(p) / scale;
      intensity += exp(-3.5 * d);

      // Edge detection — sharp ridges where the folds create creases
      float edgeD = min(abs(p.x), abs(p.y)) / scale;
      edge += exp(-15.0 * edgeD) * 0.5;
    }

    intensity /= 8.0;
    edge /= 8.0;

    return vec2(intensity, edge);
  }

  // ── Main ─────────────────────────────────────────────────
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

    // Slow master time
    float time = uTime * 0.06;

    // Mouse — gentle drift
    vec2 mouse = (uMouse - 0.5) * 0.15;
    uv += mouse;

    // Slow overall rotation for visual interest
    uv *= rot2(time * 0.15);

    // ── Colors — true black base, electric blue highlights ──
    vec3 blue       = vec3(0.2, 0.5, 1.0);
    vec3 brightBlue = vec3(0.4, 0.7, 1.0);
    vec3 darkBlue   = vec3(0.02, 0.04, 0.12);
    vec3 deepBlack  = vec3(0.0, 0.0, 0.01);
    vec3 white      = vec3(0.95, 0.97, 1.0);
    vec3 accentPink = vec3(1.0, 0.3, 0.6);
    vec3 accentCyan = vec3(0.0, 0.95, 0.9);
    vec3 accentGold = vec3(1.0, 0.8, 0.2);

    // ── Layered depth rendering ──
    vec3 col = vec3(0.0);
    float opacity = 0.0;

    const int LAYERS = 6;
    float layerSpacing = 1.0;
    float zoomSpeed = time * 2.5;

    for (int i = 0; i < LAYERS; i++) {
      float fi = float(i);

      // ── Zoom phase for this layer ──
      // mod() wraps layers seamlessly — when one passes through,
      // it reappears at the deepest level
      float totalLayers = float(LAYERS);
      float phase = mod(zoomSpeed + fi * layerSpacing, totalLayers * layerSpacing);
      float normalizedPhase = phase / (totalLayers * layerSpacing); // 0 = far, 1 = past us

      // Zoom: exponential so deeper layers are much smaller
      float zoom = exp(phase - totalLayers * layerSpacing * 0.5);

      // ── Layer UV ──
      vec2 layerUV = uv * zoom;

      // Per-layer rotation — each "world" has its own orientation
      // Seed from the continuous layer ID so it changes each cycle
      float layerCycle = floor((zoomSpeed + fi * layerSpacing) / (totalLayers * layerSpacing));
      float seed = hash(fi + layerCycle * 13.0) * TAU;
      layerUV *= rot2(seed * 0.5 + fi * 0.3);

      // ── Kaleidoscope pre-fold ──
      // Apply N-fold symmetry BEFORE the fractal iterations
      // This creates the mandala/column structures
      float symmetry = 5.0 + floor(hash(fi + layerCycle * 7.0) * 4.0); // 5-8 fold
      float angle = atan(layerUV.y, layerUV.x);
      float r = length(layerUV);
      angle = mod(angle, TAU / symmetry) - PI / symmetry;
      angle = abs(angle);
      layerUV = r * vec2(cos(angle), sin(angle));

      // ── Evaluate fractal pattern ──
      float patternSeed = seed + layerCycle * 3.7;
      vec2 pattern = fractalPattern(layerUV, patternSeed);
      float structure = pattern.x;
      float edges = pattern.y;

      // ── Depth-based appearance ──
      // Structures fade in from the distance, peak at mid-depth, fade as they pass
      float depthAlpha = sin(normalizedPhase * PI);
      depthAlpha = pow(depthAlpha, 1.2);

      // Closer structures are brighter and more opaque
      float closeness = 1.0 - normalizedPhase; // 1 = close, 0 = far

      // ── Structure solidity ──
      float solid = smoothstep(0.15, 0.5, structure);

      // ── Color this layer ──
      // Base: near-black with a hint of deep blue
      vec3 layerColor = mix(deepBlack, darkBlue, structure * 0.4);

      // Blue glow on edges — the primary highlight
      layerColor += blue * pow(edges, 1.3) * 1.2;

      // Bright white-blue on the sharpest peaks — cranked up
      layerColor += white * pow(edges, 2.5) * 1.0;

      // Brighter blue bloom on strong edges
      layerColor += brightBlue * pow(edges, 1.8) * 0.5;

      // Lighting: very dark base, edges pop hard
      float brightness = 0.3 + 0.7 * closeness;
      layerColor *= brightness;

      // ── Subtle accents — rare pops of color ──
      float accentPhase = fi * 0.33 + layerCycle * 0.5;
      float pinkAmt  = max(0.0, sin(accentPhase * TAU + 0.0)) * 0.04;
      float cyanAmt  = max(0.0, sin(accentPhase * TAU + 2.0)) * 0.03;
      float goldAmt  = max(0.0, sin(accentPhase * TAU + 4.0)) * 0.025;
      layerColor += accentPink * pinkAmt * pow(edges, 2.0);
      layerColor += accentCyan * cyanAmt * pow(edges, 1.5);
      layerColor += accentGold * goldAmt * pow(edges, 2.0);

      // ── Composite front-to-back ──
      float layerOpacity = solid * depthAlpha * 0.7;
      col += layerColor * layerOpacity * (1.0 - opacity);
      opacity += layerOpacity * (1.0 - opacity);
      opacity = min(opacity, 1.0);
    }

    // ── Deep background — pure black ──
    col += deepBlack * (1.0 - opacity);

    // ── Post-processing ──

    // Contrast boost — darks darker, brights brighter
    col = pow(col, vec3(1.3));
    // Then tone map to keep highlights from blowing out
    col = col / (col + vec3(0.3));
    // Gamma for punch
    col = pow(col, vec3(0.85));

    // Vignette — draws eyes to center where the descent happens
    vec2 vuv = gl_FragCoord.xy / uResolution;
    float vig = 1.0 - 0.45 * pow(length(vuv - 0.5) * 1.5, 2.5);
    col *= vig;

    gl_FragColor = vec4(col, 1.0);
  }
`;
