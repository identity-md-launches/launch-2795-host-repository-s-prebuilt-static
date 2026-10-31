# Turing Wheel contracts

`TuringWheel.sol` is the on-chain queue for Turing Wheel: each program owns 512 cycles of settled Squeekchain core work, starting at least 768 cycles ahead of it so settlement lag cannot eat the slice. It is immutable, with no owner, no admin and no upgrades, and it is not payable. The design lives in `../docs/superpowers/specs/2026-10-31-turing-wheel-design.md`.

## Build and test

```bash
forge build
forge test
```

The fork suite skips itself unless it is pointed at Sepolia. It only reads the real core on a local fork and broadcasts nothing:

```bash
forge test --fork-url https://ethereum-sepolia-rpc.publicnode.com --match-contract Fork
```

To also pin `cumulativeWork` to the Squeekchain API, pass the value in:

```bash
SQUEEKCHAIN_API_WORK=$(curl -s https://api.squeekchain.com/v1/core | jq -r .core.cumulativeWork) \
  forge test --fork-url https://ethereum-sepolia-rpc.publicnode.com --match-contract Fork
```

The API indexes 12 confirmations behind the head, so that check can briefly disagree if a settlement lands in that window. Rerun it if so.

## Deploy

The only constructor argument is the Squeekchain core address on Sepolia, `0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44`.
