import { describe, expect, it } from 'vitest';
import { decodeProgramRoute, encodeProgramRoute } from './route';

describe('program routes', () => {
  it('round trips a program through a share link', () => {
    const source = 'sin(r*.4-t)*(x^y)%7>>1?-u:v||~i';
    expect(decodeProgramRoute(encodeProgramRoute(source))).toBe(source);
  });

  it('produces a url safe route with no padding', () => {
    expect(encodeProgramRoute('>>>???')).toMatch(/^#\/p\/[A-Za-z0-9_-]+$/);
  });

  it('rejects anything that is not a program route', () => {
    expect(decodeProgramRoute('#/')).toBeNull();
    expect(decodeProgramRoute('#/p/')).toBeNull();
    expect(decodeProgramRoute('#/q/abcd')).toBeNull();
    expect(decodeProgramRoute('#/p/a')).toBeNull();
    expect(decodeProgramRoute('#/p/_w')).toBeNull();
  });
});
