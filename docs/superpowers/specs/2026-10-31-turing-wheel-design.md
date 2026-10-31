# Turing Wheel: design

A computer clocked by a hamster. Community project for Squeekchain's Code board.

## The idea in one paragraph

Squeekchain is a proof-of-work chain where a real hamster, Squeektoshi, runs on a real wheel. One work unit is one wheel pass (about 0.88 m). Turing Wheel treats that as a CPU clock: **one wheel pass is one clock cycle**. Anyone writes a tiny program, a single expression that paints a 64x36 LED display, and queues it on-chain. Each queued program owns the next 512 wheel passes. While the hamster runs, that program runs, in lockstep, on every screen in the world, because a frame is a pure function of `(source, t)` and `t` comes from the hamster's real wheel count. When he sleeps the machine halts. There is no server, no oracle and no backend.

The joke has to land in five seconds. The depth is that it is genuinely a shared deterministic computer with one very small CPU.

## The core loop

1. Land on a giant LED machine. It is running whatever the hamster is running, or it is halted because he is asleep.
2. While he sleeps, grab the crank and spin it by hand. You are now the clock. Feel how slow a hamster computer is.
3. Edit the one-line program. The LED responds as you type.
4. Queue it. A real Sepolia transaction reserves the next free 512 passes.
5. Come back when he runs and watch a real hamster execute your code, with everyone else, on stream.

## Vocabulary

- **Cycle**: one wheel pass. Use "cycles" in the UI, "wheel passes" in explanations.
- **Slice**: the 512 cycles a queued program owns.
- **House ROM**: built-in programs that fill empty slices, so the machine always has something to run.
- **Halted**: the hamster is not running.
- **Crank**: the hand clock, private to the viewer.

## WheelScript (src/lang)

A single expression evaluated once per cell, per frame. ASCII only, at most 140 bytes, no statements, no loops, no assignment. Bounded by construction, so it cannot hang.

Variables: `t` (cycles since this program started, may be fractional), `x` (0..63), `y` (0..35), `i` (`y*64+x`), `u` and `v` (x and y relative to the centre, in cells: `x-31.5`, `y-17.5`), `r` (distance from centre), `a` (angle from centre, radians).

Operators: `+ - * / % **`, comparisons returning 1 or 0, `&& || !`, ternary `?:`, bitwise `& | ^ ~ << >>` on int32, parentheses.

Functions: `sin cos tan abs floor ceil round sqrt sign min max mod atan2 hypot clamp mix step fract hash noise`.

Output: the value `v` for a cell maps to a level. `NaN` and infinities are 0. Sign picks the phosphor: positive is gold round LED, negative is blue square tile. Magnitude clamps to 1, then `round(|v| * 4)` gives level 0..4.

**Determinism is the product.** The same `(source, t)` must produce the same frame in every browser. `Math.sin`, `Math.pow`, `Math.atan2`, `Math.exp`, `Math.log` and `Math.hypot` are not bit-exact across engines, so they are forbidden. Implement trig and friends from IEEE-754 `+ - * /`, `floor`, `sqrt`, `abs` only. `Math.random`, `Date` and any host access are forbidden. Compile to closures. Never use `eval` or `new Function`, because the source is untrusted, comes from the chain, and may run under a strict CSP.

A source that fails to compile is valid on-chain, because the contract cannot parse it. The machine shows a deterministic SEGFAULT animation for that slice.

## Clock (src/chain)

`GET https://api.squeekchain.com/v1/status`, open CORS, numbers as strings:
`measurement.{freshness, observedAt, staleAfterSeconds, cumulativeWorkUnits, provenance, coreStatus, rpmMilli, speedMmPerSecond, distanceMm}`, `coreStatus` is `IDLE | ACTIVE | COUNTER_FAULT`.

Poll every 5s while visible, back off when hidden, honour Retry-After. Between polls, interpolate `work` from `rpmMilli` so animation is continuous, but stay monotonic: when a poll lands behind the interpolation, ease the clock, never step backwards, and never overrun real work by more than one poll's worth. When he is IDLE, `work` freezes exactly. `freshness` not online or stale data is `signal-lost`. `COUNTER_FAULT` is `fault`.

The Squeekchain console shows "SQUEEKTOSHI IS SLEEPING / 2H 41M / LIVE BY 21:00 UTC". Find where that comes from in `.design-ref/sepolia-bundle.js` (look near `current.json`, `modules` and `OFF AIR`) and surface it as `nextLiveAt`. If the source is not public, return null rather than invent one.

Never invent or simulate telemetry on the production path. `?sim=1` may run a clearly labelled SIMULATED clock for QA, and it must show that label on screen.

## Queue contract (contracts/)

`TuringWheel.sol`, Solidity ^0.8.24, deployed to Sepolia. Immutable: no owner, no admin, no upgrade, not payable. Reads Squeekchain core `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`, whose `state()` returns a `CoreState` tuple `(uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused)`.

```solidity
struct Program { address author; uint64 startWork; uint64 endWork; uint32 squeeks; bytes source; }

event ProgramQueued(uint256 indexed id, address indexed author, uint64 startWork, uint64 endWork, bytes source);
event Squeeked(uint256 indexed id, address indexed fan, uint32 total);

error SourceEmpty();
error SourceTooLong();
error SourceNotAscii();
error AlreadyQueued(uint64 untilWork);
error UnknownProgram();
error AlreadySqueeked();

function SLICE() external view returns (uint64);                  // 512
function LEAD() external view returns (uint64);                   // 768
function MAX_SOURCE_BYTES() external view returns (uint256);      // 140
function core() external view returns (address);
function programCount() external view returns (uint256);
function program(uint256 id) external view returns (Program memory);
function page(uint256 startId, uint256 limit) external view returns (Program[] memory);
function queueEnd() external view returns (uint64);
function currentWork() external view returns (uint64);
function hasSqueeked(uint256 id, address fan) external view returns (bool);
function submit(bytes calldata source) external returns (uint256 id);
function squeek(uint256 id) external;
```

`submit`: length 1..140, printable ASCII only (0x20..0x7e), then `startWork = max(queueEnd, core.state().cumulativeWork + LEAD)`, `endWork = startWork + SLICE`, `queueEnd = endWork`. An author may hold one unfinished program at a time: revert `AlreadyQueued(end)` while their last program's `endWork` exceeds current work. `squeek` is one per wallet per program, and works on any existing program.

Settled on-chain work lags live telemetry by minutes and uses the same units. The chain is the schedule. Telemetry is the clock.

`LEAD` exists because of that lag. Rounds are 600 seconds and settle about 36 seconds after they close, so settled work can trail live work by about 700 cycles at the observed peak, which is more than a whole slice. Without `LEAD`, a program queued while the hamster runs would own passes he has already spent. With it, a queued program genuinely owns its next 512 passes. The cost is that a program queued on an empty queue waits `LEAD` cycles, even while he sleeps and settled work equals live work. When the queue tail sits less than `LEAD` ahead of settled work, the new slice starts past the tail and house ROM fills the gap.

## Schedule (src/machine/schedule.ts)

Pure: `resolveSlot(work, queue, house)` returns the `Slot`. A queued program whose range contains `work` wins, with `t = work - startWork`. Otherwise the house slice is `floor(work / SLICE)`, the index is that modulo the house list, and `t = work mod SLICE`. Any two viewers with the same work and queue get the same answer.

## Display

Frames are `Int8Array(2304)`, levels -4..4. The renderer must feel like the Squeekchain console's LED wall: glowing gold round dots with bloom, blue square tiles, a faint off-state grid of dim cells, and phosphor decay between frames. A hamster at 1 Hz should read as a slow flowing light show, so sample continuous `t` every animation frame, not only on integer passes.

Any frame exports as a Squeekchain Code board cover: 1152 chars, row-major, two cells per char, alphabet `ABCDEFGHIJKLMNOPQRSTUVWXY`, char = `ALPHABET[a*5+b]` with `a` and `b` in 0..4 (use the absolute level). Reference encoder: `Qn` in `.design-ref`, reproduced in `squeekchain-tasks/cover.mjs`.

## Surfaces

- **The Machine**: the LED, with a telemetry rail: clock source, clock speed in Hz, cycles, program, author, cycles left in the slice, hamster state.
- **The Crank**: a physical dial you spin with pointer or thumb, with inertia and detents. Keyboard works too. Shows your Hz against the hamster's best. Crank state is local.
- **The Editor**: one line of code, live compile, inline error caret, byte meter out of 140, presets, Run, Queue (wallet tx), Share link, Copy cover.
- **The Queue**: on-chain programs with live LED thumbnails, start cycle, author, position, ETA in cycles, and a Squeek button. History is replayable because every frame is pure: scrub any past program.
- **The Datasheet**: the language reference, written as a parody hardware datasheet. CPU: 1 hamster. Clock: variable.

Wallet is injected only, EIP-6963 discovery with `window.ethereum` fallback, switch to Sepolia on connect. Reading the machine, cranking and editing need no wallet.

URL routes: `#/`, `#/p/<base64url source>` opens a program in the editor, `?overlay=1` renders a transparent LED only, for OBS stream overlays.

Sound is optional, off by default: a relay tick per cycle via WebAudio.

## Style: this must look like it belongs to Squeekchain

Study `.design-ref/squeekchain-console.png`, `.design-ref/squeekchain-home.png` and `.design-ref/squeekchain.css` before drawing anything.

- Near-black `--sqk-bg #0b0b0d`, raised `#0f0f12`, page `#1a1a20`, lines `#1c1c24` and `#26262f`, panels with 1px borders and 10px radius.
- Gold `#ffc048`, `#f2c230`, lettering `#ffe28a`. Blue `#5b7cfa`, `#4460cf`, `#2f4499`, lettering `#a8baff`. Pink `#f06bae`. Green status `#35d07f`, orange `#e8b04a`. Light-blue active tab, as on their range selector.
- Barlow Condensed for huge display numerals and headlines, light weights. IBM Plex Mono uppercase, wide tracking, for labels and data. Quicksand only for voice.
- Small square status lamps before panel titles. `?` affordance squares. Dotted-grid backgrounds. Segmented range controls. Everything reads as an instrument.
- Self-host fonts from `@fontsource`. No CDNs, trackers or external assets. The only network calls are the Squeekchain API and Sepolia RPC.

Do not copy their logo, mascot art or the word mark. Draw our own wheel mark in the same dot language. Footer: "Community project. Not affiliated with the Squeekchain team." Never imply it is official.

## Engineering rules

- TypeScript strict, Vitest, TDD for `lang`, `machine` and contract logic. Forge tests for the contract.
- Static build: relative URLs and hash routing only, so it runs from any IPFS gateway subpath.
- No backend, no `console.log`, no secrets in the repo. Handle API failure honestly, never with fake data.
- Prefer immutable patterns. Small focused files under 800 lines. Comments only for what code cannot say.
- Copy: never use the em dash character anywhere, including comments, docs and UI strings.
- Mobile first from 360px wide. Keyboard accessible. Respect `prefers-reduced-motion`.
- Target well under 200 KB of JS gzipped. 60 fps on a mid laptop.
