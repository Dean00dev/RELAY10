# Alpha playtest contract

Automated checks validate deterministic state transport, generated-world bounds, static
delivery, and a simulated gameplay lifecycle. They do not establish that the game feels
good on physical hardware.

## Required first-device pass

Record the device, operating system, browser, orientation, and result for each check:

- the start screen fits without horizontal scrolling;
- dragging from any point moves the signal without moving the page;
- one leg lasts approximately ten seconds;
- gates, mines, sparks, damage, energy, and score remain visible;
- switching apps pauses rather than consuming the leg;
- the handoff screen offers exactly three gifts;
- native sharing or clipboard fallback produces a baton link;
- opening the link starts the displayed next leg with the chosen gift;
- reduced motion and sound controls persist after reload;
- a deliberately damaged baton is rejected without executing or freezing the page.

## Recommended matrix

| Priority | Platform | Browser |
|---|---|---|
| P0 | Current iPhone | Safari |
| P0 | Desktop | Chrome or Chromium |
| P1 | Android phone | Chrome |
| P1 | Desktop | Firefox |
| P2 | iPad | Safari |

## Alpha acceptance rule

Do not describe the game as device-verified until at least the two P0 rows pass. Automated
CI success and a mobile-sized lifecycle simulation are supporting evidence, not substitutes
for physical input, rendering, sound, share-sheet, and safe-area testing.
