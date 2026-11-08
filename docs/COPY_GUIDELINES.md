# BACKSTOP copy guidelines

These rules apply to every user-facing string in the web app (`web/src`): JSX
text, string literals that reach the screen (labels, hints, errors, toasts,
`aria-label`s, metadata) and any Markdown/JSON content shipped with the app.
They are enforced by `pnpm copy:lint` (`scripts/lint-copy.mjs`), which runs in
CI next to ESLint.

## Positioning

BACKSTOP is **a token with an unusual exit mechanic**: sellers offer tokens to
holders at a discount before anything reaches the market, and the treasury can
always be redeemed pro-rata. Describe what the mechanism does. Do not describe
BACKSTOP as an investment, a security, a savings product or a way to earn.

- No price predictions or targets ("will go up", "to the moon", "100x").
- No language that frames buying as investing. The word **"invest"** and its
  forms (investing, investment, investor) are not used at all.
- Rates, rewards and yields are **variable** and described as estimates.
- Explain risks and irreversible actions plainly, in the place where the user
  takes the action.

## Banned words and phrases (case-insensitive)

| Banned | Why | Say instead |
| --- | --- | --- |
| guaranteed, guarantee(s) | Nothing about price, fills or rates is guaranteed. | "enforced on-chain", "checked at launch", "always available" (only for redemption, which cannot be paused) |
| risk-free, risk free | Every action here carries risk. | describe the specific risk |
| safe return(s) | Implies a promised outcome. | "variable rate", "estimated" |
| profit, profits | Reads as a promise of gains. | "proceeds", "tokens received", "rewards (variable)" |
| invest, investing, investment, investor | BACKSTOP is not positioned as an investment. | "hold", "buy", "absorb", "holders" |
| moon, 100x, 1000x, "price will" | Price predictions. | do not predict |

## Required context

1. **"Yield" is always variable.** Any string (or source line) that says
   "yield" must also say "variable" — e.g. "variable yield (estimated)". Prefer
   "fee rewards" or "estimated APR (variable)" where it reads better.
2. **Chest withdrawals are time-locked — say so wherever withdrawal is
   mentioned.** Any screen or component whose copy mentions withdrawing must
   also state the lock (the 60-day rolling lock and the 25% early-withdrawal
   penalty for chests; the lock term for Shield principal). The chest page keeps
   the lock and penalty visible at all times, connected or not. The linter
   checks this per file: a file whose copy mentions "withdraw" must also mention
   the lock ("lock", "locked", "time-locked", "unlock").
3. **Offers cannot be cancelled — say so before the user commits.** The sell
   flow explains the offer mechanic, shows estimated proceeds, the frozen
   discount and the Return Ticket *before* the confirm button, and requires an
   explicit acknowledgement of the no-cancel rule.
4. **Estimates are labelled as estimates.** Proceeds, discounts, APRs and
   yields computed in the browser say "estimated" or "about", and name what
   they are based on.

## Voice

- Plain verbs, sentence case, active voice. Buttons say what happens: "Post
  offer", "Lock in the Shield", "Burn and redeem".
- An action keeps its name through the flow: the "Post offer" button produces
  an "Offer posted" toast.
- Errors say what went wrong and how to fix it, without apologising.
- Empty states invite the next action.

## Escape hatch

The linter scans string literals and JSX text, so code identifiers inside
strings can occasionally trip it. Add `// copy-lint-ignore` (or
`{/* copy-lint-ignore */}` in JSX) on the same line, or
`// copy-lint-ignore-next-line` on the line above, and explain why in the
comment. Never use it to ship banned copy.

## Running the linter

```sh
pnpm copy:lint                 # scans web/src
node scripts/lint-copy.mjs dir # scans another directory
```

It prints `file:line` for every violation and exits non-zero when any are
found.
