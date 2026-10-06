# fx-580VN X — web emulator

A Casio fx-580VN X style scientific calculator that runs entirely in the browser.
Written from scratch in TypeScript: the engine, the display renderer and the
keyboard are all original code with no runtime dependencies.

## What this is, and what it is not

The original Windows emulator you may have on disk (`fx-580VN X Emulator.exe`)
loads `SimU8engine.dll` (a CPU simulator), `CLASSWIZ_P20.dll` (the UI) and
`ActivationFx.dll` (a licence check). Those are Windows DLLs from Casio and
OKI Semiconductor. They cannot run in a browser, and this project does not
include, decompile or work around any of them — including the activation
system.

What is here instead is an independent reimplementation of the *calculator*:
the same key layout, the same notation, the same scientific behaviour, written
in TypeScript that you can read and audit.

## Features

- 4 basic modes plus BASE-N and COMPLEX
- DEG / RAD / GRA angle units, applied at the function boundary
- SIN, COS, TAN, ASIN, ACOS, ATAN, LOG, LN, SINH/COSH/TANH, and their inverses
- `√`, `∛`, `x²`, `x³`, `x⁻¹`, `x!`, `nPr`, `nCr`, `Abs`, `Int`, `Frac`
- `d/c` fraction conversion with exact BigInt arithmetic
- GCD, LCM, MIN, MAX, HYPOT, digit sum/product/extraction
- Percent with the real percent-of-base semantics (`200+10%` = 220)
- Implicit multiplication (`2π`, `2(3+4)`, `3√9`)
- Dot-matrix LCD rendered on canvas, 12 characters, 2 rows
- SHIFT / ALPHA modifier layers, MENU navigation, SETUP, MODE cycling
- SOLVE (linear by closed form, otherwise bisection then Newton), EQN mode
- Statistics over data lists (mean, σx, min, max, regression)
- Matrix arithmetic: determinant, inverse, transpose, product
- Playable on a phone: pointer events, no keyboard required

## Running it

```bash
npm install
npm run dev      # dev server with hot reload
npm test         # 42 unit tests, no browser needed
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

## Deploying to GitHub Pages

The Vite config sets `base: './'`, so the build is fully relative and works
from any subpath — including a project page at
`https://<user>.github.io/<repo>/`.

```bash
git init
git add .
git commit -m "fx-580VN X web emulator"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch**,
branch `main`, folder `/ (root)`. GitHub runs the build and publishes `dist/`.

To automate it, add `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

## Architecture

```
src/core/     engine, no DOM, fully unit tested
  tokenizer   display string -> tokens
  parser      tokens -> AST (implicit multiplication, postfix, right-assoc ^)
  evaluator   AST -> value, holding all calculator state
  value       number | complex | fraction | matrix | symbolic | error
  complex     complex arithmetic and principal branches
  fraction    exact BigInt rational arithmetic
  functions   angle conversion and the scientific library
  format      LCD number formatting (Fix / Sci / Eng / Norm)
  solver      SOLVE and EQN mode
  stats       data lists and statistics
  pipeline    compute() and display(), the only entry points the UI needs

src/ui/       presentation, all state lives in the controller
  controller  entry editing, modifiers, menus, replay, mode logic
  layout      the physical key map with SHIFT and ALPHA bindings
  menus       the MENU / SETUP / MATH tree as data
  lcd         dot-matrix canvas renderer
  mode        mode list and setup options
```

Two design decisions worth knowing:

**Errors are values.** Every core operation returns a value; a failure is a
`{ kind: 'Math Error' }` value that propagates through the rest of the
expression. Nothing throws, so a bad argument can never leave the calculator in
a broken state, and `compute()` always succeeds so the UI has one code path.

**The controller has no DOM dependency.** `displayRows()` returns the two rows
the LCD should show. That is why the whole state machine is tested in Node —
the tests press keys and assert on display text, exactly as a user would.

## Accuracy notes

Two behaviours are deliberate and differ from a guess at the original:

- `(-4)!` returns Math Error rather than the gamma value `1/24`. The reciprocal
  gamma extension has a sign convention that is easy to get wrong and cannot be
  verified against the real firmware from here.
- Internal arithmetic rounds to 15 significant digits, matching the published
  mantissa spec.

Anything matching published fx-580VN X behaviour (angle handling, percent,
`d/c` approximation, `▸` menu cursor) is asserted in the test suite.

## Licence

MIT. This project is not affiliated with, endorsed by, or connected to Casio
or OKI Semiconductor. "fx-580VN X" and "ClassWiz" are trademarks of their
respective owners, used here only to describe which calculator this is
modelled on.
