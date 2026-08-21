# Attention and prior-art research

Research was performed on 21 August 2026 before selecting the concept. This is product
rationale, not a prediction that RELAY//10 will become popular.

## Observed signals

- Current browser-game roundups continue to emphasize instant play and low commitment.
  [PC Gamer's 2026 browser-game guide](https://www.pcgamer.com/best-browser-games/) spans
  quick daily puzzles, arcade games, creative toys, and deeper sessions.
- Current itch.io web discovery prominently features visually distinctive, compact and
  characterful games. See the live [top web games](https://itch.io/games/platform-web) and
  [top-rated web games](https://itch.io/games/top-rated/platform-web) listings.
- Daily games remain a crowded but active format. [Listdle](https://listdle.com/) exists
  solely to index daily-game variants, so a daily seed alone is not differentiation.
- The Game Band's 2026 Dartwords launch pairs a familiar daily format with a memorable
  character, reinforcing the value of a proposition with personality rather than another
  anonymous grid. See [The Verge's coverage](https://www.theverge.com/entertainment/981014/dartwords-clippy-word-game).
- Short gameplay clips can provide discovery when the mechanic is immediately readable.
  Push to Talk's analysis of a viral 15-second indie-game post is a useful example:
  [“my indie game for 15 seconds”](https://www.pushtotalk.gg/p/tamashika-viral-tweet).

## Concepts rejected after prior-art checks

### The player's old route returns as an enemy

Rejected because the mechanic already appears directly in contemporary products including
Echo Shift and ECHO LOOP. A different title or visual skin would not create a defensible hook.

### Absurd AI CAPTCHA microgames

Rejected because CAPTCHA-as-game is already crowded, including Neal.fun-style challenges,
CaptchaWare, The Captcha Game, and multiple dedicated browser implementations.

### Daily orbital physics shot

Rejected as the lead concept because daily orbit puzzles, gravity-well rocket puzzles, and
orbital launch games already form a visible cluster.

## Selected hypothesis

RELAY//10 combines four known attention strengths—instant play, a one-sentence rule, short
clip readability, and shareable results—but changes the role of sharing:

> The share is not a receipt after play. The share is required to hand the live run to the
> next person.

The URL-fragment transport also permits a complete static deployment. MDN documents fragment
handling in its [URI fragment reference](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).

## What must be measured

The alpha cannot substantiate attention or retention claims. A real evaluation needs at
least:

- start-to-leg-completion rate;
- handoff-button activation rate;
- successful recipient-open rate;
- chain-length distribution;
- replay rate and daily return rate;
- mobile crash and input-failure reports;
- qualitative reports on whether ten seconds feels meaningful or arbitrary.

No analytics SDK is included in the alpha. Any telemetry proposal must be opt-in, minimal,
documented, and reviewed before implementation.
