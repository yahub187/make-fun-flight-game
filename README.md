# make-fun-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/yahub187/make-fun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/yahub187/make-fun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Make the best flight game: build a playable, polished browser flight game. Blind judging over four rounds; the top 50 entries share the $500 prize pool.

**Sky Courier** is this entry: a 2D canvas flight game where you thread a little mail plane through a city skyline — dodge rooftops, cranes, geese and thunderheads, grab parcels for bonus points, and keep an eye on the fuel gauge. Three hits, or an empty tank, ends the run. Keyboard (arrows / W-S), mouse steering, Space to boost, Enter to start, R to restart. Plain static HTML5 + ES modules, no libraries, no network requests; deterministic staged scenes via `?shot=start|play|end&seed=N`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Then play it locally with `node serve.ts` and open http://localhost:8080.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1zsz3v4c&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
