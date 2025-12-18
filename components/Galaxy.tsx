'use client';

import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef, useCallback } from 'react';

// 🆕 全局 WebGL 上下文管理器 - 防止创建过多上下文
// 移除复杂的 WeakRef 管理逻辑，回归 React 标准生命周期
// Safari 对 WeakRef 和 WebGL 上下文的交互可能存在兼容性问题

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const getFragmentShader = (layers: number) => `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;

varying vec2 vUv;

#define NUM_LAYER ${layers.toFixed(1)}
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5; 
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;
      
      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);
  
  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;

interface GalaxyProps {
  focal?: [number, number];
  rotation?: [number, number];
  starSpeed?: number;
  density?: number;
  hueShift?: number;
  disableAnimation?: boolean;
  speed?: number;
  mouseInteraction?: boolean;
  glowIntensity?: number;
  saturation?: number;
  mouseRepulsion?: boolean;
  twinkleIntensity?: number;
  rotationSpeed?: number;
  repulsionStrength?: number;
  autoCenterRepulsion?: number;
  transparent?: boolean;
  isMobile?: boolean;
}

export default function Galaxy({
  focal = [0.5, 0.5],
  rotation = [1.0, 0.0],
  starSpeed = 0.5,
  density = 1,
  hueShift = 140,
  disableAnimation = false,
  speed = 1.0,
  mouseInteraction = true,
  glowIntensity = 0.3,
  saturation = 0.0,
  mouseRepulsion = true,
  repulsionStrength = 2,
  twinkleIntensity = 0.3,
  rotationSpeed = 0.1,
  autoCenterRepulsion = 0,
  transparent = true,
  isMobile = false,
  ...rest
}: GalaxyProps) {
  const ctnDom = useRef<HTMLDivElement>(null);
  const targetMousePos = useRef({ x: 0.5, y: 0.5 });
  const smoothMousePos = useRef({ x: 0.5, y: 0.5 });
  const targetMouseActive = useRef(0.0);
  const smoothMouseActive = useRef(0.0);
  
  // 🆕 使用 ref 存储渲染器相关对象，避免重复创建
  const rendererRef = useRef<Renderer | null>(null);
  const programRef = useRef<Program | null>(null);
  const animateIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // 🆕 存储最新的 props 值，避免依赖数组变化导致重新创建上下文
  const propsRef = useRef({
    focal, rotation, starSpeed, density, hueShift, disableAnimation,
    speed, mouseInteraction, glowIntensity, saturation, mouseRepulsion,
    twinkleIntensity, rotationSpeed, repulsionStrength, autoCenterRepulsion, transparent, isMobile
  });
  
  // 更新 props ref
  useEffect(() => {
    propsRef.current = {
      focal, rotation, starSpeed, density, hueShift, disableAnimation,
      speed, mouseInteraction, glowIntensity, saturation, mouseRepulsion,
      twinkleIntensity, rotationSpeed, repulsionStrength, autoCenterRepulsion, transparent, isMobile
    };
    
    // 更新已存在的 program uniforms（不重新创建上下文）
    if (programRef.current) {
      const p = programRef.current;
      p.uniforms.uFocal.value = new Float32Array(focal);
      p.uniforms.uRotation.value = new Float32Array(rotation);
      p.uniforms.uDensity.value = density;
      p.uniforms.uHueShift.value = hueShift;
      p.uniforms.uSpeed.value = speed;
      p.uniforms.uGlowIntensity.value = glowIntensity;
      p.uniforms.uSaturation.value = saturation;
      p.uniforms.uMouseRepulsion.value = mouseRepulsion;
      p.uniforms.uTwinkleIntensity.value = twinkleIntensity;
      p.uniforms.uRotationSpeed.value = rotationSpeed;
      p.uniforms.uRepulsionStrength.value = repulsionStrength;
      p.uniforms.uAutoCenterRepulsion.value = autoCenterRepulsion;
    }
  });

  useEffect(() => {
    // 🆕 防止 React 严格模式下重复初始化
    if (isInitializedRef.current || !ctnDom.current) return;
    isInitializedRef.current = true;
    
    const ctn = ctnDom.current;
    const props = propsRef.current;
    
    const renderer = new Renderer({
      alpha: props.transparent,
      premultipliedAlpha: false
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;
    
    // 移除 registerContext 调用

    if (props.transparent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.clearColor(0, 0, 0, 1);
    }

    let program: Program;

    function resize() {
      // Mobile optimization: limit dpr to 1.5 to save battery/perf
      const dpr = props.isMobile ? Math.min(window.devicePixelRatio, 1.5) : 1;
      renderer.dpr = dpr;
      const scale = 1;
      renderer.setSize(ctn.offsetWidth * scale, ctn.offsetHeight * scale);
      if (program) {
        program.uniforms.uResolution.value = new Color(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / gl.canvas.height
        );
      }
    }
    window.addEventListener('resize', resize, false);
    resize();

    const geometry = new Triangle(gl);
    const numLayers = props.isMobile ? 2.0 : 4.0;
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: getFragmentShader(numLayers),
      uniforms: {
        uTime: { value: 0 },
        uResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
        },
        uFocal: { value: new Float32Array(props.focal) },
        uRotation: { value: new Float32Array(props.rotation) },
        uStarSpeed: { value: props.starSpeed },
        uDensity: { value: props.density },
        uHueShift: { value: props.hueShift },
        uSpeed: { value: props.speed },
        uMouse: {
          value: new Float32Array([smoothMousePos.current.x, smoothMousePos.current.y])
        },
        uGlowIntensity: { value: props.glowIntensity },
        uSaturation: { value: props.saturation },
        uMouseRepulsion: { value: props.mouseRepulsion },
        uTwinkleIntensity: { value: props.twinkleIntensity },
        uRotationSpeed: { value: props.rotationSpeed },
        uRepulsionStrength: { value: props.repulsionStrength },
        uMouseActiveFactor: { value: 0.0 },
        uAutoCenterRepulsion: { value: props.autoCenterRepulsion },
        uTransparent: { value: props.transparent }
      }
    });
    // 🆕 存储 program 引用，用于在 props 变化时更新 uniforms
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry, program });

    function update(t: number) {
      animateIdRef.current = requestAnimationFrame(update);
      const currentProps = propsRef.current;
      
      if (!currentProps.disableAnimation) {
        program.uniforms.uTime.value = t * 0.001;
        program.uniforms.uStarSpeed.value = (t * 0.001 * currentProps.starSpeed) / 10.0;
      }

      const lerpFactor = 0.05;
      smoothMousePos.current.x += (targetMousePos.current.x - smoothMousePos.current.x) * lerpFactor;
      smoothMousePos.current.y += (targetMousePos.current.y - smoothMousePos.current.y) * lerpFactor;

      smoothMouseActive.current += (targetMouseActive.current - smoothMouseActive.current) * lerpFactor;

      program.uniforms.uMouse.value[0] = smoothMousePos.current.x;
      program.uniforms.uMouse.value[1] = smoothMousePos.current.y;
      program.uniforms.uMouseActiveFactor.value = smoothMouseActive.current;

      renderer.render({ scene: mesh });
    }
    animateIdRef.current = requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    function handleMouseMove(e: MouseEvent) {
      const rect = ctn.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      targetMousePos.current = { x, y };
      targetMouseActive.current = 1.0;
    }

    function handleMouseLeave() {
      targetMouseActive.current = 0.0;
    }

    // 使用 propsRef 获取初始值，后续鼠标事件始终监听
    if (props.mouseInteraction && !props.isMobile) {
      ctn.addEventListener('mousemove', handleMouseMove);
      ctn.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      // 🆕 清理动画帧
      if (animateIdRef.current) {
        cancelAnimationFrame(animateIdRef.current);
      }
      window.removeEventListener('resize', resize);
      
      // 清理事件监听器
      ctn.removeEventListener('mousemove', handleMouseMove);
      ctn.removeEventListener('mouseleave', handleMouseLeave);
      
      // 移除 canvas
      if (gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      
      // 简化清理逻辑：直接释放上下文
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch (e) {
        // 忽略错误
      }
      
      // 重置初始化标志，以便组件重新挂载时可以创建新上下文
      isInitializedRef.current = false;
      rendererRef.current = null;
      programRef.current = null;
    };
  }, []); // 🆕 空依赖数组 - 只在挂载时初始化一次

  return <div ref={ctnDom} className="w-full h-full relative" {...rest} />;
}
