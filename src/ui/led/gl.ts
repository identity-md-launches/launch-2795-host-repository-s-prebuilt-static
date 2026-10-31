import { COLS, ROWS } from '../../types';
import { BLUR_FRAG, BRIGHT_FRAG, COMPOSITE_FRAG, FULLSCREEN_VERT } from './shaders';
import type { LedSurface, SurfaceOptions } from './surface';

const NEAR_W = COLS * 4;
const NEAR_H = ROWS * 4;
const FAR_W = COLS * 3;
const FAR_H = ROWS * 3;

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Pass {
  readonly program: WebGLProgram;
  readonly uniforms: Uniforms;
}
interface Target {
  readonly texture: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  }
  return shader;
}

function createPass(gl: WebGL2RenderingContext, frag: string, names: readonly string[]): Pass {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
  }
  const uniforms: Uniforms = Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  return { program, uniforms };
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number, hdr: boolean): Target {
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!texture || !fbo) throw new Error('target allocation failed');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D, 0,
    hdr ? gl.RGBA16F : gl.RGBA8,
    width, height, 0, gl.RGBA,
    hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, fbo, width, height };
}

/** Half-float bloom keeps the dark falloff free of banding; RGBA8 plus dither is the floor. */
function supportsHdr(gl: WebGL2RenderingContext): boolean {
  return Boolean(gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float'));
}

export function createGlSurface(canvas: HTMLCanvasElement, options: SurfaceOptions): LedSurface | null {
  const gl = canvas.getContext('webgl2', {
    alpha: options.transparent,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  try {
    let hdr = supportsHdr(gl);
    const bright = createPass(gl, BRIGHT_FRAG, ['uCells']);
    const blur = createPass(gl, BLUR_FRAG, ['uTex', 'uStep']);
    const composite = createPass(gl, COMPOSITE_FRAG, [
      'uCells', 'uNear', 'uFar', 'uRes', 'uPitch', 'uTransparent', 'uPower',
    ]);
    const vao = gl.createVertexArray();

    const cells = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cells);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, COLS, ROWS, 0, gl.RG, gl.FLOAT, null);

    let nearA = createTarget(gl, NEAR_W, NEAR_H, hdr);
    if (hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      hdr = false;
      nearA = createTarget(gl, NEAR_W, NEAR_H, false);
    }
    const nearB = createTarget(gl, NEAR_W, NEAR_H, hdr);
    const farA = createTarget(gl, FAR_W, FAR_H, hdr);
    const farB = createTarget(gl, FAR_W, FAR_H, hdr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let pitch = 8;
    const lost = (event: Event): void => {
      event.preventDefault();
      options.onLost?.();
    };
    canvas.addEventListener('webglcontextlost', lost);

    const pass = (target: Target, source: WebGLTexture, dx: number, dy: number): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform2f(blur.uniforms['uStep'] as WebGLUniformLocation, dx / target.width, dy / target.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return {
      kind: 'webgl2',
      resize(width, height, nextPitch) {
        pitch = nextPitch;
        canvas.width = width;
        canvas.height = height;
      },
      draw(heat, power) {
        gl.bindVertexArray(vao);
        gl.disable(gl.BLEND);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cells);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RG, gl.FLOAT, heat);

        gl.useProgram(bright.program);
        gl.uniform1i(bright.uniforms['uCells'] as WebGLUniformLocation, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, nearA.fbo);
        gl.viewport(0, 0, NEAR_W, NEAR_H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.useProgram(blur.program);
        gl.uniform1i(blur.uniforms['uTex'] as WebGLUniformLocation, 0);
        pass(nearB, nearA.texture, 1.15, 0);
        pass(nearA, nearB.texture, 0, 1.15);
        pass(farA, nearA.texture, 1.6, 0);
        pass(farB, farA.texture, 0, 1.6);
        pass(farA, farB.texture, 3.2, 0);
        pass(farB, farA.texture, 0, 3.2);
        pass(farA, farB.texture, 5, 0);
        pass(farB, farA.texture, 0, 5);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(composite.program);
        gl.uniform1i(composite.uniforms['uCells'] as WebGLUniformLocation, 0);
        gl.uniform1i(composite.uniforms['uNear'] as WebGLUniformLocation, 1);
        gl.uniform1i(composite.uniforms['uFar'] as WebGLUniformLocation, 2);
        gl.uniform2f(composite.uniforms['uRes'] as WebGLUniformLocation, canvas.width, canvas.height);
        gl.uniform1f(composite.uniforms['uPitch'] as WebGLUniformLocation, pitch);
        gl.uniform1f(composite.uniforms['uTransparent'] as WebGLUniformLocation, options.transparent ? 1 : 0);
        gl.uniform1f(composite.uniforms['uPower'] as WebGLUniformLocation, power);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, nearA.texture);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, farB.texture);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cells);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      destroy() {
        canvas.removeEventListener('webglcontextlost', lost);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
  } catch {
    return null;
  }
}
