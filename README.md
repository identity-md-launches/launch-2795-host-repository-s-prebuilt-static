# Turing Wheel

A computer clocked by a hamster. Community project for [Squeekchain](https://squeekchain.com). Not affiliated with the Squeekchain team.

One wheel pass of Squeektoshi's real wheel is one CPU cycle. Anyone writes a one-line program for a 64x36 LED display and queues it on-chain. Each program owns the next 512 wheel passes. While he runs it, every viewer sees the same frame, because a frame is a pure function of the source and his wheel count. When he sleeps, the machine halts, and you can grab the crank and be the clock yourself.

There is no server, no oracle and no token.

## How it works

- **WheelScript** (`src/lang`): a single expression, evaluated per cell. It cannot loop, so it cannot hang. Math is built from IEEE-754 basics rather than host `Math.sin` and friends, because those are not bit-exact across engines. Sources compile to closures, never `eval`.
- **Clock** (`src/chain`): live wheel telemetry from `api.squeekchain.com`. Telemetry is the clock, and the chain is the schedule.
- **Queue** (`contracts/`): an immutable Sepolia contract with no owner, reading `SqueekCore.state()` directly. It is at [`0x1B53382F61DB4bb991aA329d62D04C904E86c20B`](https://sepolia.etherscan.io/address/0x1B53382F61DB4bb991aA329d62D04C904E86c20B), with source verified on Sourcify.
- **Machine** (`src/ui`): a WebGL2 LED wall with a Canvas2D fallback, in vanilla TypeScript.

## Run it

```bash
npm install
npm run dev
npm test
cd contracts && forge test
```

`?overlay=1` gives a transparent LED for OBS. `?sim=1` runs a labelled simulated clock for testing.

`dist/` is committed on purpose, so the prebuilt site can be hosted from this repository.

MIT licensed.
