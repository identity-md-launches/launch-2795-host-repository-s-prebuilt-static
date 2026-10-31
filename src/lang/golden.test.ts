import { describe, expect, it } from 'vitest';
import { GOLDEN_SOURCES, GOLDEN_TIMES, dmathFingerprint, goldenTable } from './golden.fixture';

// Any change here means every viewer on the old build disagrees with every viewer on the new
// one. Regenerate only for a deliberate, announced change to the language.
const EXPECTED: readonly string[] = [
  'd049ccc5 d049ccc5 d049ccc5 d049ccc5 d049ccc5 d049ccc5',
  'a8e6266d 68b699c5 0d6c9cc5 0ed15875 b65f0585 a79c3be5',
  'a63b0c2b 551deee7 5c20fe17 9e155ba7 32cb3061 17e712ca',
  'a5b2fa15 0abf9561 6f095fe1 2bbab289 b95cad4d cbc777f5',
  '6b41e9a9 5d9933d5 4cb4dc26 bb89ca5f 4f3c540d d22795ff',
  '394e4e75 9f634c35 930c1785 7fdce165 7abdc745 a82a91b5',
  '0448d7d3 3869d381 148a6dd9 d5ab55d5 8f0dbb81 2aa6954d',
  'df42e08d df42e08d df42e08d df42e08d df42e08d df42e08d',
  '7e24bc71 43ff77dd 8d9ae425 fc606d65 c728fac5 7e24bc71',
  '800369c5 800369c5 800369c5 800369c5 800369c5 800369c5',
  '881db625 881db625 881db625 881db625 881db625 881db625',
  '1dc02f97 1dc02f97 1dc02f97 1dc02f97 1dc02f97 1dc02f97',
  '5aef7fa1 4a06aed1 68401aa1 1e67e579 9395bd69 68401aa1',
  'f1119085 f1119085 f1119085 f1119085 f1119085 f1119085',
  '5fc9eead 5fc9eead 5fc9eead 5fc9eead 5fc9eead 5fc9eead',
  '8d9d2635 655137e3 d6161ebb 0253793c 9cba62bf 71de642f',
  '95592695 3de831c5 3de831c5 95592695 95592695 3de831c5',
  '470086a5 470086a5 470086a5 470086a5 470086a5 470086a5',
  '8ab64545 b81020a5 9e90c219 8b18af8d 074e81d1 9bf5a721',
  '78207b88 78207b88 78207b88 78207b88 78207b88 78207b88',
  'ee7cd4c5 ee7cd4c5 ee7cd4c5 ee7cd4c5 ee7cd4c5 ee7cd4c5',
  'ee7cd4c5 7da9306f 3db7e294 6bea309c ccefbcdd ec7a55f6',
  '73abcdd5 fd8fe28d 18e80270 27387c4b 8118d7c0 f2b57a20',
  'd6362375 d6362375 d6362375 d6362375 d6362375 d6362375',
  '61cf49fe 61cf49fe 61cf49fe 61cf49fe 61cf49fe 61cf49fe',
  '710265ef 98c44061 5ecad549 56b2b924 ae4d8b07 2d5d821d',
  '87feec83 c470dbb3 50a9fdc3 10a45503 77e79073 82eeceb3',
  '298ef6e5 b078ba85 b502c4c5 70f73185 b5cb6885 e7d8ab9d',
  'a8b57785 c84d2685 3b488845 d6158fc5 9787ff45 d2bfa685',
  '736eb86d 828822dd a6d9d805 5ea89b3d 2d1d8845 213cc015',
  '839f10d8 784a812f 1a18df42 dd927563 4edd5fcf f5afb875',
];

const FINGERPRINT: Readonly<Record<string, string>> = {
  dsin: 'd5f5c2d3',
  dcos: 'c17a3ba7',
  dtan: 'ae3e9aae',
  datan: '880b6184',
  datan2: '304eac94',
  dexp: 'f34c5c26',
  dlog: '211b6f72',
  dpow: '8b862da5',
  dhypot: '3d8e65c1',
  dhash: 'ea139654',
  dnoise: '7e17a5fb',
  dmod: '23c881fc',
  drem: '56f2602f',
};

describe('dmath raw bits', () => {
  it('stays bit-exact over 200000 inputs, not just to the nearest LED level', () => {
    expect(dmathFingerprint()).toEqual(FINGERPRINT);
  });
});

describe('golden frames', () => {
  it('covers every source', () => {
    expect(EXPECTED).toHaveLength(GOLDEN_SOURCES.length);
    expect(EXPECTED[0]?.split(' ')).toHaveLength(GOLDEN_TIMES.length);
  });

  const actual = goldenTable(GOLDEN_SOURCES);

  GOLDEN_SOURCES.forEach((source, index) => {
    it(`pins ${source}`, () => {
      expect(actual[index]).toBe(EXPECTED[index]);
    });
  });
});
