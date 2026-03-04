# Pega Extension

A Chrome extension that adds quality-of-life improvements for developers working in Pega Dev Studio, Tracer, and Clipboard Viewer.

---

## Features

### Dev Studio

- **Refresh icon** on App definition and Branch selector — reload without navigating away
- **Tag icon** on rule form — copies rule signature to clipboard (e.g. `rule_type class.name`)
- **Key icon** on rule form — copies `pzInsKey` to clipboard
- **Tab switch** — instantly jump between the two most recently visited tabs via a configurable hotkey (set per OS from the extension popup)
- **Middle-click** to close a tab
- **Drag and drop** tab reordering
- **Log icon** in Dev Studio corner — single click opens local logs menu, double click opens external logs (configurable from popup)

### Tracer

- **DB Query with parameter values** — prettified SQL with actual parameter values substituted in; copy icon sends result to clipboard
- **Tracer Settings buttons** — three extra buttons added to the Tracer Settings page:
  - *Deselect OOTB* — unchecks all `Pega-*` and `Theme-Cosmos` rulesets
  - *Select All* — selects all event types
  - *Deselect All* — deselects all event types
- **Context page viewer** — opens an enhanced property viewer for clipboard pages in Tracer, with tree view and tidy/default display modes and advanced search

### Clipboard Viewer

- **Pinned pages** — moves the most useful pages to the top automatically. Default pinned: `pyWorkPage`, `pyWorkCover`, `newAssignPage`, `pyDisplayHarness`, `RH_1`

### General

- **Settings sync** — extension settings synced across browsers via Chrome Storage API
- **Instant settings apply** — settings changes take effect without reloading Pega tabs

---

## Backlog

- Make rule signature format configurable from the popup
- Prettify tabs (minimize home tab, remove empty space in tab headers)
- Personal ruleset sets to toggle in Tracer
- Allow pinning custom pages in Clipboard Viewer
- Remember left panel width in Clipboard Viewer
- Tab card — show useful rule info on hover (with option to disable)
- Show/hide Tracer column settings
- Resizable UI elements from the popup menu
- Highlight environment on tab icon, Dev Studio, Tracer
- Show rule execution start/end time in Tracer
- Add new row in Validate rule on Enter
- Open tab in new browser window
- Split view
- Per-feature on/off toggles in extension settings
- Highlight nested rows in Data Transform
- Prettify pages viewer in Tracer (clipboard-style)

---

## Known Bugs

- Dev Studio tabs reset to original order after browser tab refresh — no plans to fix
- Tab switch sometimes doesn't work for unsaved (New) rule tabs
- Tab switch sometimes doesn't work when switching from a Section rule tab
- Clipboard page pinning may not work correctly in VDI environments

---

## Building for Chrome Web Store

| Command | Description |
| --- | --- |
| `just release` | Bumps patch version in `manifest.json`, builds zip, opens output folder |
| `just build` | Builds zip with current version, no version change |
| `just clean` | Removes previously generated zip files |
| `just format` | Formats all source files with prettier |

The zip is created in the parent directory (e.g. `../pega-extension-0.0.1.0.zip`).
It includes: `manifest.json`, `popup.html`, `popup.js`, `popup.css`, `build/`, `assets/` (excluding `backup/`).

Version format is `major.minor.patch.build`. `just release` auto-increments the rightmost component and carries over (e.g. `0.0.0.99` → `0.0.1.0`).

---

## Development

### Getting started

1. Clone the repo
2. Run `just install` to install dev dependencies
3. Load the extension in Chrome: go to `chrome://extensions`, enable Developer mode, click *Load unpacked*, select the project folder
4. After making changes, click the refresh icon on the extension card in `chrome://extensions`

### Architecture

The extension follows standard Manifest V3 architecture:

```
popup.html / popup.js       — extension popup UI, settings management
build/background.js         — service worker, tab lifecycle, script injection
build/content_scripts/      — scripts injected into Pega pages
build/styles.css            — styles injected into Pega pages
```

Script injection is driven by tab title matching — each Pega page type gets a dedicated content script. The mapping is defined in `PAGE_CONFIGS` in `background.js`.

#### Message passing

All messages must include `sender: 'pega-extension'`.

**Request settings** (content script → background):
```js
chrome.runtime.sendMessage({ message: 'getSettings' })
// response: { payload: <settings object> }
```

**Notify settings updated** (popup → background → all tabs):
```js
chrome.runtime.sendMessage({ type: 'settingsUpdated', sender: 'pega-extension' })
```

**Set a specific setting** (content script → background):
```js
chrome.runtime.sendMessage({
    type: 'settingsSet',
    sender: 'pega-extension',
    payload: { key: 'tcp-viewMode', value: 'tidy' }
})
```

#### Service worker notes

- Scripts are injected only on tab load — not on tab activation. Re-injecting on activation would stack duplicate extension artifacts on the page.
- `content-checker.js` is a fallback script for pages not matched by `PAGE_CONFIGS`.
- Processed tab IDs are stored in `chrome.storage.session` so they survive service worker restarts within a browser session.

---

## Sneaky Install (closed workstation)

If your workstation does not have internet, you can sideload the build:

1. Create a zip using `just build` or `just release`
2. Base64-encode it — any online tool works, e.g. [base64.guru](https://base64.guru/converter/encode/file)
3. Transfer the base64 string to your machine (online clipboard, email, etc.)
4. Decode it back to a file in the browser using [this approach](https://stackoverflow.com/a/64513026/17654999) — use `application/zip` as MIME type
5. Mark the downloaded file as trusted in its properties
6. Extract and load in Chrome via *Load unpacked*