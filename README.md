#Implemented features

-   Pega tab refresh icon
    -   Application definition
    -   Branch
-   Tag icon on rule form - copies rule signature to clipboard. By default rule signature is a combination of most importand rule info attributes e.g.
    > rule_type class.name
-   Key icon on rule form - copies rule pzInsKey to clipboard.
-   Tab switch - allows to switch instantly between two most recent tabs. Hotkey configuration available from extension popup and separate for different os types
    known bugs: - Sometimes not switching to New rule tab (not saved rule) - Sometimes not switching from section rule
-   Close tab on middle click
-   Log icon on dev studio left corner - opens local logs menu or external logs depending on single click or double click. Configurable from extension popup
-   DB Query with parameter values in prettified format, icon on this field copies result SQL to clipboard
-   Toggle Pega rulesets in Tracer settings
-   Most useful pages pinned in Clipboard viewer - by default: pyWorkPage, pyWorkCover, newAssignPage, pyDisplayHarness, RH_1
-   Reorder tabs by drag and drop
-   Settings change applies instantly without browser tab refresh

#To be implemented:

-   make rule signature configurable from extension popup
-   prettify tabs
    -   minimize home tab
    -   avoid empty spaces in tabs headers
-   add functionality to create personal sets of rulesets to toggle
-   allow to pin pages in clipboard viewer
-   memorize width of the left panel in Clipboard viewer
-   tab card - most useful tab information on hover. allow to disable
-   hide/show settings for tracer columns
-   allow to change UI elements sizes from menu
-   change warnings view to the one from the screenshot
-   prettify pages viewer in tracer - clipboard like
    -   add icon in the header. try to use OOTB icon with pi notation (like in the toolbar of the dev tools)
-   highlight environment on tab icon, dev studio, tracer
-   get start and end of a rule execution in tracer
-   add new row in validate rule on enter
-   open tab in new browser window
-   split view
-   extension settings
-   allow to turn off features
-   extension icon view update on allowed tabs
-   highlight nested rows in data transform

Extension settings synced between browsers

#Known bugs:

-   Dev Studio tabs reordered in initial state after browser tab refresh - no plans to fix this

# Building for Chrome Web Store

| Command | Description |
|---|---|
| `just release` | Bumps patch version in `manifest.json`, builds zip, opens output folder |
| `just build` | Builds zip with current version, no version change |
| `just clean` | Removes previously generated zip files |
| `just format` | Formats all source files with prettier |

The zip is created in the parent directory (e.g. `../pega-extension-0.0.1.0.zip`).
It includes: `manifest.json`, `popup.html`, `popup.js`, `popup.css`, `build/`, `assets/` (excluding `backup/`).

Version format is `major.minor.patch.build`. `just release` auto-increments the rightmost component and carries over (e.g. `0.0.0.99` → `0.0.1.0`).

#How to start development

1. Reinstall the extension

#TODO:

1. check tab switch with different shortcuts for win and mac
2. make new shortcut work without pega page refresh. partly implemented, look at getExtensionSettings() definition. but it's dev portal's initiative, should be popup's
3. clipboard pages prioritization doesn't work properly in VDI. double check
4. implement decode base64 functionality for any selected text - like confluence comments work - https://stackoverflow.com/a/64513026/17654999
5. add new tab in popup: Buddy - proxy to pega knowledgebase
6. add dev studio enhancements extension setting.
    1. when activated, new options show up: class and name copy feature, key icon, rule signature icon, app/branch refresh icon
    2. siblings icon
       3.2 references icon
7. fix pe\_\_tcp_body-tidy-header width. width is incorrect when main element width is less then 300

#architecture
#API messages types

-   bakcground.js worker subscribed to getSettings message (chrome.runtime.onMessage)
    returns extension settings by request
-   push messages from popup scripts on settins update - implemented in setExtensionSettings() function - sends chrome.runtime.sendMessage({
    type: 'settingsUpdated',
    sender: 'pega-extension',
    })
    all push notifiacations should have sender = 'pega-extension'

#worker

-   injects static files only on tab load event, tab activation shouldn't do anything because current code wasn't designed in a singleton way i.e. new extension load won't substitute extention artefacts on the tab, but just add new ones

-   there is a fallback script for the pages that not identified by title it's content-checker.js
-   every time settings got updated, message got sent with type 'settingsUpdate' it causes worker to update settings local copy

sendMessage({
type: 'settingsSet',
sender: 'pega-extension',
payload: {
key: 'key',
value: 'value'
}
})

-   for now viewMode stored directly in settings with 'tcp-viewMode' key //TODO: include project prefix

#Hot to sneak install to your closed workstation
1. Get your build and zip it
2. Encode in base64. You can use any online tool, for example https://base64.guru/converter/encode/file
3. Use online clipboard (https://online-clipboard.online/online-clipboard/) or send resulting text to you machine that is closed to the world
4. Use guide from the page https://www.geeksforgeeks.org/how-to-convert-base64-to-file-in-javascript/, but make it zip and MIME: application/zip
5. Modify downloaded file's properties: mark it as trusted
6. Extract contents and add to your browser