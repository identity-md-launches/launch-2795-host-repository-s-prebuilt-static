import { decodeFunctionData, encodeFunctionResult, toHex, type Hex } from 'viem';
import { TURING_WHEEL_ABI } from './abi';

export const T0 = Date.parse('2026-10-31T18:00:00.000Z');
export const EPOCH_A = 'c011f01a-93ba-45ff-8579-619ddfdf40ec';
export const EPOCH_B = '7e0d9a44-1c55-4a0e-9d11-2b6f2f3f8a10';

export interface MeasurementFixture {
  readonly freshness?: string;
  readonly observedAt?: number;
  readonly staleAfterSeconds?: number | string;
  readonly counterEpoch?: string;
  readonly cumulativeWorkUnits?: string;
  readonly provenance?: string;
  readonly coreStatus?: string;
  readonly rpmMilli?: number | string;
}

/** The shape of a real /v1/status response captured 2026-10-31, including the fields we ignore. */
export function statusBody(fixture: MeasurementFixture = {}, generatedAt = Date.now()) {
  const observedAt = fixture.observedAt ?? generatedAt;
  const rpmMilli = fixture.rpmMilli ?? 0;
  return {
    schemaVersion: 1,
    installationId: 'stream-game-sepolia-test-20261025-01',
    revision: 'vzq0TBBWT_DW84wPsrC99a4x7uR2LTigPcmY2Qkizmg',
    generatedAt: new Date(generatedAt).toISOString(),
    measurement: {
      freshness: fixture.freshness ?? 'online',
      observedAt: new Date(observedAt).toISOString(),
      receivedAt: new Date(observedAt + 300).toISOString(),
      staleAfterSeconds: fixture.staleAfterSeconds ?? 120,
      counterEpoch: fixture.counterEpoch ?? EPOCH_A,
      cumulativeWorkUnits: fixture.cumulativeWorkUnits ?? '58518',
      provenance: fixture.provenance ?? 'hardware',
      coreStatus: fixture.coreStatus ?? 'IDLE',
      rpmMilli,
      speedMmPerSecond: Math.round((Number(rpmMilli) / 60_000) * 878),
      distanceMm: 0,
    },
    builder: { status: 'available' },
    oracle: { state: 'accepted', reason: null },
    settlementQueue: { status: 'available', state: 'submitted' },
    modules: [
      {
        instanceId: 'wheel',
        moduleType: 'wheel.counter',
        driverId: 'usb-rp2040-a3144e-lm393',
        moduleVersion: '0.2.1',
        schemaVersion: 1,
        state: 'ready',
        observedAt: new Date(observedAt).toISOString(),
        provenance: 'hardware',
        health: { checkedAt: new Date(observedAt).toISOString() },
        data: {},
      },
    ],
  };
}

export function jsonResponse(
  body: unknown,
  init: { readonly status?: number; readonly headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers),
    json: async () => body,
  } as Response;
}

export interface ChainProgram {
  readonly author: `0x${string}`;
  readonly startWork: bigint;
  readonly endWork: bigint;
  readonly squeeks: number;
  readonly source: `0x${string}`;
}

export function chainProgram(index: number, source = `t+${index}`, squeeks = 0): ChainProgram {
  const startWork = BigInt(58_000 + index * 512);
  return {
    author: '0x00000000000000000000000000000000000000AA',
    startWork,
    endWork: startWork + 512n,
    squeeks,
    source: toHex(source),
  };
}

export interface FakeRpc {
  readonly fetch: typeof fetch;
  /** One entry per POST, holding the JSON-RPC methods it carried. */
  readonly posts: { readonly url: string; readonly methods: readonly string[] }[];
  /** Every decoded contract call, in arrival order. */
  readonly calls: { readonly functionName: string; readonly args: readonly unknown[] }[];
}

type RpcRequest = { readonly id: number; readonly method: string; readonly params: readonly unknown[] };

export interface ChainViews {
  readonly queueEnd: bigint;
  readonly currentWork: bigint;
  readonly lead: bigint;
}

export function fakeRpc(
  state: () => readonly ChainProgram[],
  isDown: (url: string) => boolean = () => false,
  extra: (request: RpcRequest) => unknown = () => undefined,
  views: () => ChainViews = () => ({ queueEnd: 0n, currentWork: 0n, lead: 768n }),
): FakeRpc {
  const posts: { url: string; methods: string[] }[] = [];
  const calls: { functionName: string; args: readonly unknown[] }[] = [];

  function contractCall(data: Hex): Hex {
    const { functionName, args = [] } = decodeFunctionData({ abi: TURING_WHEEL_ABI, data });
    calls.push({ functionName, args });
    const programs = state();
    if (functionName === 'programCount') {
      return encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, result: BigInt(programs.length) });
    }
    if (functionName === 'page') {
      const [startId, limit] = args as readonly [bigint, bigint];
      const result = programs.slice(Number(startId), Number(startId + limit));
      return encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, result });
    }
    if (functionName === 'queueEnd') {
      return encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, result: views().queueEnd });
    }
    if (functionName === 'currentWork') {
      return encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, result: views().currentWork });
    }
    if (functionName === 'LEAD') {
      return encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName, result: views().lead });
    }
    throw new Error(`fakeRpc has no answer for ${functionName}`);
  }

  function answer(request: RpcRequest) {
    const custom = extra(request);
    if (custom !== undefined) return { jsonrpc: '2.0', id: request.id, ...(custom as object) };
    if (request.method === 'eth_call') {
      const [call] = request.params as readonly [{ data?: Hex; input?: Hex }];
      return { jsonrpc: '2.0', id: request.id, result: contractCall((call.data ?? call.input) as Hex) };
    }
    if (request.method === 'eth_chainId') return { jsonrpc: '2.0', id: request.id, result: '0xaa36a7' };
    throw new Error(`fakeRpc has no answer for ${request.method}`);
  }

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (isDown(url)) throw new TypeError('Failed to fetch');
    const body = JSON.parse(String(init?.body)) as RpcRequest | readonly RpcRequest[];
    const requests = Array.isArray(body) ? (body as readonly RpcRequest[]) : [body as RpcRequest];
    posts.push({ url, methods: requests.map((request) => request.method) });
    const payload = Array.isArray(body) ? requests.map(answer) : answer(body as RpcRequest);
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  return { fetch: fetchFn, posts, calls };
}
