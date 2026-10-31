import { decodeFunctionResult, encodeFunctionData, hexToString, type Hex } from 'viem';
import type { Address, QueuedProgram } from '../types';
import { TURING_WHEEL_ABI } from './abi';
import type { ReadClient } from './rpc';

export const PAGE_SIZE = 50;

export type UintView = 'programCount' | 'queueEnd' | 'currentWork' | 'LEAD' | 'SLICE';

export interface ContractReads {
  uint(functionName: UintView): Promise<number>;
  page(startId: number, limit?: number): Promise<readonly QueuedProgram[]>;
}

/** Bare eth_calls: viem's readContract adds about 17 KB gzipped of code paths this never takes. */
export function createContractReads(client: ReadClient, address: Address): ContractReads {
  const ethCall = (data: Hex) => client.request({ method: 'eth_call', params: [{ to: address, data }, 'latest'] }) as Promise<Hex>;

  return {
    async uint(functionName) {
      const data = await ethCall(encodeFunctionData({ abi: TURING_WHEEL_ABI, functionName }));
      return Number(decodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, data }));
    },
    async page(startId, limit = PAGE_SIZE) {
      const args = [BigInt(startId), BigInt(limit)] as const;
      const data = await ethCall(encodeFunctionData({ abi: TURING_WHEEL_ABI, functionName: 'page', args }));
      const rows = decodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName: 'page', data });
      return rows.map((row, index) => ({
        id: startId + index,
        author: row.author,
        source: hexToString(row.source),
        startWork: Number(row.startWork),
        endWork: Number(row.endWork),
        squeeks: row.squeeks,
      }));
    },
  };
}
