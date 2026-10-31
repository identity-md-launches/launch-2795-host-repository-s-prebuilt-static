import { describe, expect, it } from 'vitest';
import { TURING_WHEEL_ABI } from './abi';

interface AbiParameter {
  readonly type: string;
  readonly indexed?: boolean;
  readonly components?: readonly { readonly name: string; readonly type: string }[];
}

interface AbiEntry {
  readonly type: string;
  readonly name?: string;
  readonly stateMutability?: string;
  readonly inputs?: readonly AbiParameter[];
  readonly outputs?: readonly AbiParameter[];
}

const artifacts = import.meta.glob<{ abi: readonly AbiEntry[] }>(
  '../../contracts/out/TuringWheel.sol/TuringWheel.json',
  { eager: true },
);
const compiled = Object.values(artifacts)[0]?.abi;

const shapeOf = (parameter: AbiParameter) => ({
  type: parameter.type,
  indexed: parameter.indexed ?? false,
  components: parameter.components?.map(({ name, type }) => ({ name, type })) ?? [],
});

const signatureOf = (entry: AbiEntry) => ({
  type: entry.type,
  name: entry.name,
  stateMutability: entry.stateMutability,
  inputs: entry.inputs?.map(shapeOf) ?? [],
  outputs: entry.outputs?.map(shapeOf) ?? [],
});

const signatures = (abi: readonly AbiEntry[]) =>
  abi
    .filter((entry) => entry.type !== 'constructor')
    .map(signatureOf)
    .sort((a, b) => `${a.type}${a.name}`.localeCompare(`${b.type}${b.name}`));

describe.skipIf(compiled === undefined)('TURING_WHEEL_ABI', () => {
  it('matches the compiled contract, entry for entry', () => {
    expect(signatures(TURING_WHEEL_ABI as readonly AbiEntry[])).toEqual(signatures(compiled ?? []));
  });
});
