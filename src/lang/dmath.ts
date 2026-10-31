// Deterministic math. Host trig, pow, exp and log are not bit-exact across engines, so every
// function here is built only from IEEE-754 + - * /, floor, abs and sqrt. Polynomial kernels
// follow fdlibm. Changing any constant changes every frame ever rendered.

const PI = 3.141592653589793;
const PIO2 = 1.5707963267948966;
const TWO_OVER_PI = 0.6366197723675814;
const TWO_32 = 4294967296;

// Past this every double is an integer, and multiples of pi/2 can no longer be resolved.
const HUGE = 4503599627370496;
const INVERSE_HUGE = 2.220446049250313e-16;

// pi/2 split into 26-bit pieces, so n * P1..P3 is exact for n up to 2^27.
const P1 = 1.5707963109016418;
const P2 = 1.5893254712295857e-8;
const P3 = 6.123233601181349e-17;
const P4 = 3.9455541665632055e-24;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function kernelSin(r: number): number {
  const z = r * r;
  return r + z * r * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kernelCos(r: number): number {
  const z = r * r;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

// Sine is already noise out here, so any bounded in-range answer will do. A true remainder
// would let a hostile program spend microseconds per cell on every viewer's screen.
function foldHuge(x: number): number {
  if (x - x !== 0) return NaN;
  let folded = x;
  while (Math.abs(folded) >= HUGE) folded *= INVERSE_HUGE;
  return folded;
}

export function dsin(x: number): number {
  const small = Math.abs(x) < HUGE ? x : foldHuge(x);
  const n = Math.floor(small * TWO_OVER_PI + 0.5);
  const r = small - n * P1 - n * P2 - n * P3 - n * P4;
  const quadrant = n - 4 * Math.floor(n * 0.25);
  if (quadrant === 0) return kernelSin(r);
  if (quadrant === 1) return kernelCos(r);
  if (quadrant === 2) return -kernelSin(r);
  return -kernelCos(r);
}

export function dcos(x: number): number {
  const small = Math.abs(x) < HUGE ? x : foldHuge(x);
  const n = Math.floor(small * TWO_OVER_PI + 0.5);
  const r = small - n * P1 - n * P2 - n * P3 - n * P4;
  const quadrant = n - 4 * Math.floor(n * 0.25);
  if (quadrant === 0) return kernelCos(r);
  if (quadrant === 1) return -kernelSin(r);
  if (quadrant === 2) return -kernelCos(r);
  return kernelSin(r);
}

export function dtan(x: number): number {
  return dsin(x) / dcos(x);
}

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, PIO2] as const;
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17,
] as const;
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;

export function datan(x: number): number {
  if (x !== x) return x;
  const ax = Math.abs(x);
  if (ax >= 7.378697629483821e19) return x < 0 ? -PIO2 : PIO2;
  if (ax < 7.450580596923828e-9) return x;

  const band = ax < 0.4375 ? -1 : ax < 0.6875 ? 0 : ax < 1.1875 ? 1 : ax < 2.4375 ? 2 : 3;
  const z =
    band === -1
      ? ax
      : band === 0
        ? (2 * ax - 1) / (2 + ax)
        : band === 1
          ? (ax - 1) / (ax + 1)
          : band === 2
            ? (ax - 1.5) / (1 + 1.5 * ax)
            : -1 / ax;

  const w = z * z;
  const s = w * w;
  const even = w * (AT0 + s * (AT2 + s * (AT4 + s * (AT6 + s * (AT8 + s * AT10)))));
  const odd = s * (AT1 + s * (AT3 + s * (AT5 + s * (AT7 + s * AT9))));
  if (band === -1) return x - x * (even + odd);

  const r = ATAN_HI[band]! - (z * (even + odd) - ATAN_LO[band]! - z);
  return x < 0 ? -r : r;
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y < 0 ? datan(y / x) - PI : datan(y / x) + PI;
  if (x === 0) return y > 0 ? PIO2 : y < 0 ? -PIO2 : y;
  return NaN;
}

// Powers of two from -550 to 550. Two of them reach the whole exponent range of a double.
const POW2_ZERO = 550;
const POW2 = new Float64Array(2 * POW2_ZERO + 1);
POW2[POW2_ZERO] = 1;
for (let k = 1; k <= POW2_ZERO; k += 1) {
  POW2[POW2_ZERO + k] = POW2[POW2_ZERO + k - 1]! * 2;
  POW2[POW2_ZERO - k] = POW2[POW2_ZERO - k + 1]! * 0.5;
}

function powInt(base: number, power: number): number {
  let result = 1;
  let square = base;
  let k = power;
  while (k > 0) {
    if (k % 2 === 1) result *= square;
    square *= square;
    k = Math.floor(k * 0.5);
  }
  return result;
}

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const E1 = 1.66666666666666019037e-1;
const E2 = -2.77777777770155933842e-3;
const E3 = 6.61375632143793436117e-5;
const E4 = -1.6533902205465251539e-6;
const E5 = 4.13813679705723846039e-8;

export function dexp(x: number): number {
  if (x !== x) return x;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = Math.floor(INV_LN2 * x + 0.5);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const z = r * r;
  const c = r - z * (E1 + z * (E2 + z * (E3 + z * (E4 + z * E5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  const half = Math.floor(k * 0.5);
  return y * POW2[half + POW2_ZERO]! * POW2[k - half + POW2_ZERO]!;
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

const TWO_54 = 18014398509481984;
const MIN_NORMAL = 2.2250738585072014e-308;
const SQRT2 = 1.4142135623730951;

export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;

  let m = x < MIN_NORMAL ? x * TWO_54 : x;
  let e = x < MIN_NORMAL ? -54 : 0;
  for (let bits = 512; bits >= 1; bits >>= 1) {
    const scale = POW2[POW2_ZERO + bits]!;
    if (m >= scale) {
      m *= POW2[POW2_ZERO - bits]!;
      e += bits;
    } else if (m * scale < 2) {
      m *= scale;
      e -= bits;
    }
  }
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }

  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const r = w * (LG2 + w * (LG4 + w * LG6)) + z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const halfSquare = 0.5 * f * f;
  return e * LN2_HI - (halfSquare - (s * (halfSquare + r) + e * LN2_LO) - f);
}

const MAX_INT_POWER = 1073741824;

export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (y !== y || x !== x) return NaN;
  const integral = Math.floor(y) === y;
  if (integral && Math.abs(y) <= MAX_INT_POWER) {
    return y > 0 ? powInt(x, y) : 1 / powInt(x, -y);
  }
  if (x >= 0) return dexp(y * dlog(x));
  if (!integral) return NaN;
  const magnitude = dexp(y * dlog(-x));
  return Math.floor(y * 0.5) * 2 === y ? magnitude : -magnitude;
}

const REM_QUOTIENT_LIMIT = 9007199254740992;

// Remainder takes time proportional to the exponent gap, and past 2^53 the quotient has no
// integer precision left, so the true remainder is noise that only costs frame time.
export function drem(a: number, b: number): number {
  if (Math.abs(a / b) < REM_QUOTIENT_LIMIT) return a % b;
  return a - a === 0 && b === b && b !== 0 ? 0 : NaN;
}

export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dmod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

export function dfract(x: number): number {
  return x - Math.floor(x);
}

export function dround(x: number): number {
  return Math.floor(x + 0.5);
}

export function dceil(x: number): number {
  return -Math.floor(-x);
}

export function dsign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : x;
}

export function dmin(a: number, b: number): number {
  return a < b || a !== a ? a : b;
}

export function dmax(a: number, b: number): number {
  return a > b || a !== a ? a : b;
}

export function dclamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function dmix(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

export function dstep(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}

// 32-bit multiply out of doubles: each partial product stays under 2^53, so it is exact.
function mul32(a: number, b: number): number {
  return ((a & 0xffff) * b + (((a >>> 16) * b) << 16)) | 0;
}

function avalanche(value: number): number {
  const a = mul32(value ^ (value >>> 16), 0x85ebca6b);
  const b = mul32(a ^ (a >>> 13), 0xc2b2ae35);
  return b ^ (b >>> 16);
}

function absorb(seed: number, x: number): number {
  const whole = Math.floor(x);
  const low = whole | 0;
  const high = (whole / TWO_32) | 0;
  const tail = ((x - whole) * TWO_32) | 0;
  return avalanche(((seed + 0x9e3779b9) | 0) ^ low ^ mul32(high, 0xcc9e2d51) ^ mul32(tail, 0x1b873593));
}

export function dhash(a: number, b = 0, c = 0): number {
  return (absorb(absorb(absorb(0x5ee4, a), b), c) >>> 0) / TWO_32;
}

function buildPermutation(): Uint8Array {
  const order = new Uint8Array(512);
  for (let k = 0; k < 256; k += 1) order[k] = k;
  for (let k = 255; k > 0; k -= 1) {
    const pick = (avalanche(k + 0x5ee4) >>> 0) % (k + 1);
    const held = order[k]!;
    order[k] = order[pick]!;
    order[pick] = held;
  }
  for (let k = 0; k < 256; k += 1) order[k + 256] = order[k]!;
  return order;
}

const PERM = buildPermutation();

// Raw Perlin rarely leaves +-0.6, which would sit on the two dimmest LED levels.
const NOISE_GAIN = 1.5;

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const a = h < 8 ? x : y;
  const b = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? a : -a) + ((h & 2) === 0 ? b : -b);
}

function fade(f: number): number {
  return f * f * f * (f * (f * 6 - 15) + 10);
}

// Omitted axes sit off the integer lattice, where Perlin noise would otherwise flatten.
export const NOISE_DEFAULT_Y = 0.31;
export const NOISE_DEFAULT_Z = 0.67;

export function dnoise(x: number, y = NOISE_DEFAULT_Y, z = NOISE_DEFAULT_Z): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const ix = fx & 255;
  const iy = fy & 255;
  const iz = fz & 255;
  const dx = x - fx;
  const dy = y - fy;
  const dz = z - fz;
  const u = fade(dx);
  const v = fade(dy);
  const w = fade(dz);

  const a = PERM[ix]! + iy;
  const aa = PERM[a]! + iz;
  const ab = PERM[a + 1]! + iz;
  const b = PERM[ix + 1]! + iy;
  const ba = PERM[b]! + iz;
  const bb = PERM[b + 1]! + iz;

  const n000 = grad(PERM[aa]!, dx, dy, dz);
  const n100 = grad(PERM[ba]!, dx - 1, dy, dz);
  const n010 = grad(PERM[ab]!, dx, dy - 1, dz);
  const n110 = grad(PERM[bb]!, dx - 1, dy - 1, dz);
  const n001 = grad(PERM[aa + 1]!, dx, dy, dz - 1);
  const n101 = grad(PERM[ba + 1]!, dx - 1, dy, dz - 1);
  const n011 = grad(PERM[ab + 1]!, dx, dy - 1, dz - 1);
  const n111 = grad(PERM[bb + 1]!, dx - 1, dy - 1, dz - 1);

  const y0 = n000 + u * (n100 - n000) + v * (n010 + u * (n110 - n010) - n000 - u * (n100 - n000));
  const y1 = n001 + u * (n101 - n001) + v * (n011 + u * (n111 - n011) - n001 - u * (n101 - n001));
  const n = NOISE_GAIN * (y0 + w * (y1 - y0));
  return n > 1 ? 1 : n < -1 ? -1 : n;
}
