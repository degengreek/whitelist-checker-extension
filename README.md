# WL Checker

A small Chrome extension that checks **all your wallets at once** against an NFT whitelist / allowlist checker.

Many mints have a "whitelist checker": a page where you paste your wallet address to see whether you're on the list. If you hold lots of wallets, that means pasting them one by one. With WL Checker you save your addresses once, then **right-click on the checker page** and get a results table for all of them in seconds.

It works in two ways, picked automatically from the page you're on:

| Page | What you get |
|---|---|
| **Any site with a whitelist checker** | The extension finds the wallet input and the check button on the page, runs each of your saved wallets through it one by one, and shows a table: **eligible**, **not eligible**, or **inconclusive** for each wallet, plus the phase or allocation when the site shows it. |
| **OpenSea drop pages** (`opensea.io/collection/...`) | A richer view: a wallets × phases grid showing which of your OpenSea-linked wallets are eligible for **every phase** of the mint schedule, with max mint amounts. |

> Not affiliated with OpenSea or any project. Results are only as good as what the sites report. Not financial advice.

---

## Install (about 1 minute)

The extension isn't on the Chrome Web Store, so you load it manually:

1. Download this repository (**Code → Download ZIP**) and unzip it. Or: `git clone <this repo>`.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. (Optional) Pin the extension from the puzzle-piece menu so the icon is always visible.

Works in Chrome and other Chromium browsers (Brave, Edge, …).

## How to use

### 1. Add your wallets
Click the extension icon, paste a wallet address (`0x…`), optionally add a label, and press **Add**. You can also use **Import bulk** to paste many addresses, one per line (an optional label can follow the address).

### 2. Run a check
Go to the page with the whitelist checker, **right-click anywhere on the page → "Run WL Check"**. A results panel appears at the bottom-right.

> After installing, updating or reloading the extension, **refresh the page** once before running a check.

### OpenSea drops
Open a drop page, e.g. `https://opensea.io/collection/<name>/overview`, **while signed in to OpenSea**, then right-click → **Run WL Check**.

- It uses the wallets **linked to your OpenSea account**, so you don't need to add them to the popup. (Addresses you've saved in the popup are only used to show your labels.)
- You get one row per wallet and one column per mint phase. A ✓ means eligible; the small number is the maximum total that wallet can mint through that phase.
- Buttons: **Copy CSV**, **Copy by phase** (addresses grouped under each phase) and **Refresh**.

### Other sites
The extension looks for the wallet input box and the check button on the page, then runs your saved wallets one by one. If the site's answer can't be understood, the wallet is marked **Inconclusive** — that is *not* the same as "not eligible".

---

## Privacy & security

The short version: **it only reads public wallet addresses, it never touches private keys, and it can't move funds.**

**What it never does**
- It never asks for, reads, or stores **private keys, seed phrases, or passwords**.
- It never connects to your wallet, never asks you to sign anything, and never sends a transaction. It **cannot mint or transfer** anything.
- It has no server, no analytics, no tracking, and loads **no remote code**. Everything runs locally in your browser.
- It doesn't read your browsing history, cookies or other tabs. It only runs on the page where you click **Run WL Check**.

**What it stores**
- Your saved wallet addresses and labels, using Chrome's extension storage (`chrome.storage.sync`). That means they live inside your Chrome profile and, if you're signed in to Chrome with sync on, Chrome syncs them across your devices through your Google account — the same way it syncs bookmarks. They are never sent to the developer or any third party by this extension. Remove a wallet with the **×** button, or uninstall the extension to delete everything.
- Wallet addresses are public on-chain information, but you should still only save addresses you're comfortable having in your browser profile.

**What it sends over the network**
- **OpenSea mode:** one read-only request to OpenSea's own website (the same data the page already loads for you), using your existing signed-in session. Nothing else.
- **Any other whitelist checker site:** it types your addresses into **that site's own checker form**, exactly as if you pasted them yourself. That means **the site receives those addresses** and can see that they were checked together. Only use it on sites you trust.

**Permissions, explained**

| Permission | Why |
|---|---|
| `contextMenus` | The right-click "Run WL Check" entry. |
| `storage` | Saving your wallet list and labels. |
| `activeTab`, `scripting` | Running the checker on the current tab, only at the moment you click "Run WL Check". Chrome grants access to that one tab temporarily — the extension has **no standing access to any website**. |

**Hardening in the code**
- All text shown in the panel and popup is escaped / inserted as plain text, so a malicious label or page text can't inject HTML.
- The results panel is isolated in a closed Shadow DOM so the page's own scripts can't read or restyle it.
- Copied CSV is protected against spreadsheet formula injection.
- No `eval`, no inline scripts, no remote scripts (Manifest V3).

The code is small and open — please read it. No software can honestly promise zero risk, so if you spot something, open an issue.

---

## Limitations

- The popup only accepts EVM (`0x…`) addresses. OpenSea mode also shows any Solana wallets linked to your account.
- Generic mode is heuristic: sites with unusual layouts, results shown as images, or checkers that need a wallet connection may come back as Inconclusive.
- OpenSea mode relies on the same internal data OpenSea's own page uses. If OpenSea changes it, the extension will show an error instead of a wrong answer, and may need an update.
- Each site can rate-limit lookups. The extension waits between wallets and retries politely.

## Files

```
manifest.json   extension definition and permissions
background.js   right-click menu + injects the checker
content.js      the checker and results panel (runs on the page)
popup.html/js/css   wallet manager UI
icons/          extension icons
```

## Contributing

Issues and pull requests are welcome. To try changes, edit the files, click the reload icon for the extension in `chrome://extensions`, and refresh the page you're testing on.

## License

[MIT](LICENSE)
