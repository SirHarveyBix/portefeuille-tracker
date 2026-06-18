---
name: clean-code-naming
description: Guidelines for clean naming conventions in this project, forbidding technical abbreviations in source code.
---

# Naming Conventions - Banning Technical Abbreviations

To maintain high code readability, readability standards, and self-documenting code, never use short technical abbreviations in this codebase.

## Mappings of Technical Abbreviations to Full Names

### Variables and Properties

- `fb` ➔ `firebaseInstance` or `firebase`
- `db` ➔ `database`
- `r` ➔ `row` or `record` or `response` or `radius`
- `m` ➔ `model`
- `el` ➔ `element`
- `v` ➔ `value`
- `t` ➔ `transaction` or `transactions`
- `ac` ➔ `assetClass`
- `bAmt` ➔ `buyAmount`
- `bSh` ➔ `buyShares`
- `cfg` ➔ `config` or `configuration`
- `msg` ➔ `message`
- `err` ➔ `error`
- `btn` ➔ `button`
- `mn` ➔ `minimumValue`
- `mx` ➔ `maximumValue`
- `vav` ➔ `volatilityValue` (or relevant contextual variable)
- `vx` / `vy` ➔ `velocityX` / `velocityY`
- `cx` / `cy` ➔ `centerX` / `centerY`
- `W` / `H` ➔ `width` / `height`
- `Alloc` ➔ `Allocation`

### Function and Path Names

- Avoid naming functions with prefixes like `fmt` or `loadAlloc`.
  - `fmtEur` ➔ `formatEuro`
  - `fmtNum` ➔ `formatNumber`
  - `fmtDate` ➔ `formatDate`
  - `loadAlloc` ➔ `loadAllocation`
  - `saveAlloc` ➔ `saveAllocation`

All developers and agents working on this codebase must strictly adhere to these naming conventions.
