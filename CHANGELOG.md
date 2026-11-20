# Changelog

## 1.1 — Hooja support

**Problem:** on hooja.fun/allocation every wallet came back "Inconclusive", even wallets the site clearly shows as eligible.

**Why:** the site runs a Cloudflare captcha before each lookup, so a result takes ~15–20 s to appear. The extension gave up after 4 s and read the page while it still said "CHECKING...". The site also keeps the previous wallet's result on screen during the next check, so waiting longer on its own could have credited one wallet with another's result.

**What changed:**
- New Hooja adapter: waits for each check to actually start and finish, then reads the site's own Eligible / Not eligible label and allocation (e.g. "WHITELIST: 1 GTD SPOT · tier: GTD").
- Each result is matched to the wallet that was checked; a leftover result from the previous wallet triggers a re-check instead of a wrong answer.
- Captcha: wallets are spaced 5–9 s apart so Cloudflare asks for a click less often. When it does, the extension beeps, flashes the tab title and scrolls to the box, then waits for you. The captcha is never bypassed.
- Generic mode now keeps waiting while a page shows it's still busy (disabled button, "checking…"), so other slow checkers stop timing out.
- The "Phase 1 + 2" breakdown only shows on the site it was built for.
