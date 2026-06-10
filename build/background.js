let extensionSettingsCached = {}

// Page detection config: matched by tab title, injected scripts and CSS
const PAGE_CONFIGS = [
    {
        titleMatch: 'Properties on Page TraceEvent',
        scripts: [
            './build/lib/sqlformatter.min.js',
            './build/content_scripts/tracer-sql-with-inserts.js',
        ],
        css: true,
        requireComplete: false,
    },
    {
        titleMatch: 'Properties on Page ',
        scripts: ['./build/content_scripts/tracer-context-page.js'],
        css: true,
        requireComplete: false,
    },
    {
        titleMatch: 'Tracer - PegaRULES',
        scripts: ['./build/content_scripts/tracer.js'],
        css: false,
        requireComplete: true,
    },
    {
        titleMatch: 'Tracer Settings',
        scripts: ['./build/content_scripts/tracer-settings.js'],
        css: true,
        requireComplete: true,
    },
    {
        titleMatch: 'Clipboard Viewer',
        scripts: ['./build/content_scripts/clipboard.js'],
        css: false,
        requireComplete: true,
    },
]

getExtensionSettings()

/* ── Tab color marker ──
Adds a colored dot to the favicon of tabs that match a project URL */

//this function is injected into the page context via executeScript
//params: { color, tabTitle } — color for favicon dot, tabTitle to override document.title
function applyTabMarker(params) {
    const { color, tabTitle } = params || {}

    //── replace favicon with colored circle ──
    if (color) {
        const existing = document.querySelector('link[data-pega-marker]')
        if (existing && existing.dataset.pegaColor === color) {
            //already set, skip
        } else {
            if (existing) existing.remove()

            const size = 32
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            const ctx = canvas.getContext('2d')

            //full-size colored circle
            const half = size / 2
            ctx.beginPath()
            ctx.arc(half, half, half, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.fill()

            const link = document.createElement('link')
            link.rel = 'icon'
            link.type = 'image/png'
            link.href = canvas.toDataURL('image/png')
            link.dataset.pegaMarker = 'true'
            link.dataset.pegaColor = color

            document
                .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
                .forEach((el) => {
                    if (!el.dataset.pegaMarker) el.remove()
                })

            document.head.appendChild(link)
        }
    }

    //── tab title override ──
    if (tabTitle) {
        //store original title so we can restore later
        if (!document.documentElement.dataset.pegaOrigTitle) {
            document.documentElement.dataset.pegaOrigTitle = document.title
        }
        document.title = tabTitle
    } else if (document.documentElement.dataset.pegaOrigTitle) {
        //title was cleared while the marker still applies (e.g. color kept) — restore
        document.title = document.documentElement.dataset.pegaOrigTitle
        delete document.documentElement.dataset.pegaOrigTitle
    }
}

function removeTabMarker() {
    //restore favicon
    const marker = document.querySelector('link[data-pega-marker]')
    if (marker) marker.remove()

    //restore original title
    const origTitle = document.documentElement.dataset.pegaOrigTitle
    if (origTitle) {
        document.title = origTitle
        delete document.documentElement.dataset.pegaOrigTitle
    }
}

//check a single tab against projects and apply/remove marker
function markTab(tabId, tabUrl) {
    const projects = extensionSettingsCached?.projects || []

    const match = projects.find(
        (p) => p.enabled && p.url && tabUrl && tabUrl.includes(p.url)
    )

    if (match && (match.color || match.tabTitle)) {
        chrome.scripting
            .executeScript({
                target: { tabId },
                func: applyTabMarker,
                args: [{
                    color: match.color || null,
                    tabTitle: match.tabTitle || null,
                }],
            })
            .catch(() => {})
    } else {
        chrome.scripting
            .executeScript({
                target: { tabId },
                func: removeTabMarker,
            })
            .catch(() => {})
    }
}

//mark all open tabs that match project URLs
function markAllTabs() {
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (tab.id && tab.url) {
                markTab(tab.id, tab.url)
            }
        }
    })
}

// Helpers for processedTabs persisted in session storage.
// chrome.storage.session survives SW wake cycles within a browser session,
// unlike in-memory variables which reset every time the service worker restarts.
async function getProcessedTabs() {
    const result = await chrome.storage.session.get('processedTabs')
    return new Set(result.processedTabs ?? [])
}

async function addProcessedTab(tabId) {
    const tabs = await getProcessedTabs()
    tabs.add(tabId)
    await chrome.storage.session.set({ processedTabs: [...tabs] })
}

async function deleteProcessedTab(tabId) {
    const tabs = await getProcessedTabs()
    tabs.delete(tabId)
    await chrome.storage.session.set({ processedTabs: [...tabs] })
}

//changes extension icon from active to not active and vice versa
function setExtensionStatusIcon() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0]

        chrome.storage.sync.get('settings').then((result) => {
            const settings = Array.isArray(result.settings)
                ? result.settings
                : []

            const urls = settings.map((s) => s.url)

            const isActive = urls.length > 0 && urls.some((url) => url && activeTab.url.includes(url))
            chrome.action.setIcon({
                path: isActive ? '/assets/img/icon-38.png' : '/assets/img/icon_grey-38.png',
            })
        })
    })
}

//tab loading event: fresh load/refresh
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    setExtensionStatusIcon()

    //mark tab with project color on every complete load
    if (changeInfo.status === 'complete' && tab.url) {
        markTab(tabId, tab.url)
    }

    //exit if tab already processed
    const processedTabs = await getProcessedTabs()
    if (processedTabs.has(tabId)) {
        return
    }

    await addProcessedTab(tabId)

    const isComplete = changeInfo.status === 'complete'
    const matched = PAGE_CONFIGS.find(
        (cfg) => tab.title.includes(cfg.titleMatch) && (!cfg.requireComplete || isComplete)
    )

    if (matched) {
        injectJavascript(tabId, matched.scripts)
        if (matched.css) injectCSS(tabId)
    } else if (isComplete) {
        injectJavascript(tabId, ['./build/content-checker.js'])
        await deleteProcessedTab(tabId) //tab might not be ready yet and should be processed later
    } else {
        await deleteProcessedTab(tabId) //tab might not be ready yet and should be processed later
    }
})

//remove tab from processed tabs when it's closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await deleteProcessedTab(tabId)
})

//injects js into content page. used in content-checker.js
function injectJavascript(tabId, jsFilesArr, callback) {
    chrome.scripting
        .executeScript({
            target: { tabId: tabId },
            files: [...jsFilesArr],
        })
        .then(() => {
            if (callback) {
                callback()
            }
        })
        .catch((err) => {
            if (
                !err.message?.includes('Cannot access') &&
                !err.message?.includes('error page')
            ) {
                console.error('[pega-ext] inject error:', err)
            }
        })
}

function injectCSS(tabId) {
    chrome.scripting
        .insertCSS({
            target: { tabId: tabId },
            files: ['./build/styles.css'],
        })
        .then(() => {})
        .catch((err) => console.error(err))
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender?.tab?.id

    console.log('message received', message)
    //request for extension settings from content script
    if (message.message === 'getSettings') {
        let payload = getExtensionSettings()

        if (sendResponse) {
            sendResponse({
                payload: payload,
            })
        }
    } else if (
        message.type === 'settingsUpdated' &&
        message.sender === 'pega-extension'
    ) {
        /* loop through all processed tabs and send a message to update settings
        also update settings local copy */
        getProcessedTabs().then((tabs) => {
            for (const t of tabs) {
                chrome.tabs.sendMessage(t, {
                    type: 'settingsUpdated',
                    sender: 'pega-extension',
                })

                console.log('message sent', {
                    type: 'settingsUpdated',
                    sender: 'pega-extension',
                    tabId: t,
                })
            }
        })

        //refresh settings cache, then re-mark all tabs with updated project colors
        chrome.storage.sync
            .get('settings')
            .then((result) => {
                extensionSettingsCached = result.settings
                markAllTabs()
            })
            .catch(() => {})
    } else if (
        message.type === 'settingsSet' &&
        message.sender === 'pega-extension'
    ) {
        console.log('====', message)
        if (message.payload) {
            updateExtensionSetting(message.payload.key, message.payload.value)
        }
    }

    if (tabId && message.script) {
        injectJavascript(tabId, [`./build/content_scripts/${message.script}`])
        addProcessedTab(tabId)
    }

    if (tabId && message.styles) {
        injectCSS(tabId)
        addProcessedTab(tabId)
    }
})

//extension activeness indicator: switching extension icon depending on tab url
chrome.tabs.onActivated.addListener(setExtensionStatusIcon)

/* get cached settings and update cache with new settings from synced storage
browser closes connection for sending message before getting new data from
async storage hence returning previously cached data and update it in async way */
function getExtensionSettings() {
    //update settings cache
    chrome.storage.sync
        .get('settings')
        .then((result) => {
            extensionSettingsCached = result.settings
        })
        .catch((err) => console.error('Failed to get extension settings', err))

    return extensionSettingsCached
}

/* set extension settings. some settings saved from content scripts
 */
function updateExtensionSetting(key, value) {
    if (!key) {
        console.warn('key cannot be empty')
    }

    chrome.storage.sync.get('settings').then((result) => {
        const extSettings = result.settings ?? {}
        extSettings[key] = value

        chrome.storage.sync.set({ settings: extSettings })

        chrome.runtime.sendMessage({
            type: 'settingsUpdated',
            sender: 'pega-extension',
        })
    })
}

//sync between browser should trigger settings refresh. not tested at all
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        chrome.storage.sync
            .get('settings')
            .then((result) => {
                extensionSettingsCached = result.settings
                markAllTabs()
            })
            .catch(() => {})
    }
})