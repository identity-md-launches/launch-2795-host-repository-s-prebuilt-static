import { describe, expect, it } from 'vitest';
import { GOLDEN_TIMES, goldenTable } from '../lang/golden.fixture';
import { PRESETS } from './presets';

const EXPECTED: ReadonlyMap<string, string> = new Map([
  ['Flywheel', 'b4227d65 36cfdf53 3cb5b6d7 873877e1 6c8b0dc7 bf9d9b8f'],
  ['Portrait of the CPU', '00fe17ed 186edda5 0d3f93ad de5175ed fe87a145 eedd0685'],
  ['Thermal Paste', '9a0e3c23 3f9a71bd c4f50144 04777a06 1838e63e 350b738c'],
  ['Power Nap', '03f33d55 8fb2b215 62a8ee5d 0374b5f5 2a0f9049 c0eba0fd'],
  ['Cardboard Tube', '31e9befd 53cecf35 07bc7021 d06868b1 452a525d f36546dd'],
  ['Seed Rain', '74c5ccb3 dbdb6e72 acdb08b6 c47486d0 5fcb1e25 98d1349d'],
  ['Cheek Pouches', '6758a12a c8450ab7 8ce7f22f aa522e14 43b38b9b cdcc4517'],
  ['Water Bottle', 'd35c4ed5 86b33115 1111e2b1 b3ac59f1 51d471ad 42632ad9'],
  ['Square Wheel', '813eb735 3e65fc59 3b7f584b c9aecfbf 25b84a21 8fcf4ea1'],
  ['Neon Treadmill', '66d2a5ed a62b617a b8739faf 8c562a75 91e66207 ded3abdf'],
  ['Cardio', '95948189 a086f089 e3ca3035 cfc9d405 4c80dc31 bf74dfd5'],
  ['Double Helix', '6536ec65 29291d95 e0c9bfb5 b9cfe6d5 9e9cc2e5 f0bc7b95'],
  ['Spin Cycle', 'd5340b6d b1a2c0c1 3415c275 0f82e8f9 67c09509 826b519d'],
  ['Inkblot Test', '2f57487d 417949eb 73ff0891 9b92bf2f dc52eaeb 4930053f'],
  ['Sunflower', 'df1b7b2b 8987ca4b 1e28e833 8e0c294b 6cf49d27 85e79e63'],
  ['Night Shift', '34f35306 c74a7a2a 4c97446e 894ab53e 231707ef eef3152f'],
  ['Munching Squares', 'ea118671 aed52315 e4f9f765 d5e19c49 218dc965 6831e5e5'],
  ['Fresh Bedding', '752372cc 209207f0 617f51ac 3edfcbf7 5272d534 41c18545'],
  ['Bubble Wrap', '956ad879 9e470755 af6de8d3 343797f7 65d890c3 242d4225'],
  ['Cat Radar', '6772d879 25a0354e 156bcc46 3e1e536e 1cb9b5da 43c9b194'],
  ['Sand Timer', '4edf19a5 1a357725 f8e1d209 e89e22a7 a09cd99b a8d3a541'],
  ['Program Counter', '23a95445 ee3d5165 7955fea5 366a0cf5 53bba325 9572fd85'],
  ['Vital Signs', 'f59e3ebe ef0f1ad2 c688f349 8dd781ff 95c3b789 483a6464'],
  ['Hamster Drive', '45639554 45473019 3896cef8 46de0e17 4eab5dae 3ed3b0ac'],
  ['Squeak EQ', 'fdde40dd 752470e9 be11f97d aa18f7e5 f187dddd 2f4a0c5d'],
  ['Table Tennis for One', 'bf2c4b55 b8cad721 0336f6e5 66902c8d 125364a9 0b58d7f5'],
]);

describe('preset golden frames', () => {
  const actual = goldenTable(PRESETS.map((preset) => preset.source));

  it('samples every golden time', () => {
    expect(actual[0]?.split(' ')).toHaveLength(GOLDEN_TIMES.length);
  });

  PRESETS.forEach((preset, index) => {
    it(`pins ${preset.name}`, () => {
      expect(actual[index]).toBe(EXPECTED.get(preset.name));
    });
  });
});
