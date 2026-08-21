# RELAY//10 design contract

## Product proposition

> You get ten seconds. Then the game belongs to someone else.

The sentence defines both the arcade rule and the distribution mechanic. A completed leg
creates a baton link; sharing that link gives another browser the next deterministic leg.

## Loop

1. Accept or create a relay.
2. Steer the signal for ten seconds.
3. Collect sparks and avoid gates and mines.
4. Choose one gift for the next runner.
5. Share the baton or continue locally.

Three hits end the current chain. No login or remote leaderboard is required.

## Determinism

Obstacle chunks derive from:

```text
relay seed + absolute chunk index
```

The state transports cumulative distance, score, energy, combo, normalized vertical
position, next leg, selected gift, and a bounded 24-leg summary. It does not transport the
entire obstacle field.

Daily seeds use the UTC date. Open relays use `crypto.getRandomValues`.

## Handoff gifts

- `shield`: restores one energy up to the capacity of three;
- `magnet`: enlarges spark collection range for one leg;
- `calm`: reduces scroll speed for one leg.

Every gift is consumed when the incoming leg begins. It is never recursively re-applied.

## Failure and pause semantics

The game pauses when its document becomes hidden. Frame deltas are clamped, so background
throttling cannot advance the world by a large single step. Collision damage grants a short
invulnerability window and clears combo. Energy reaching zero ends the chain.

## Claim ceiling

The implementation demonstrates a serverless, deterministic handoff between compatible
browsers. It does not establish fair competition: players can edit client code, generate
valid checksums, alter local storage, or manufacture a relay state. Any future public
leaderboard requires a separate authoritative verification design.
