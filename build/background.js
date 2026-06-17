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

/* settings enabled by default. seeded into storage only when the key is
missing, so an explicit user 'off' is never overridden */
const DEFAULT_SETTINGS = {
    'tcp-enabled': true,
    'dev-studio-enabled': true,
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync
        .get('settings')
        .then((result) => {
            const stored = result.settings
            //normalize: guards against a legacy array-shaped settings root
            const settings =
                stored && typeof stored === 'object' && !Array.isArray(stored)
                    ? stored
                    : {}
            let changed = false

            for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
                if (!(key in settings)) {
                    settings[key] = value
                    changed = true
                }
            }

            if (changed) {
                extensionSettingsCached = settings
                return chrome.storage.sync.set({ settings })
            }
        })
        .catch((err) =>
            console.error('Failed to seed default settings', err)
        )
})

/* ── Tab color marker ──
Adds a colored dot to the favicon of tabs that match a project URL */

//this function is injected into the page context via executeScript
//params: { color, tabTitle } — color for favicon dot, tabTitle to override document.title
function applyTabMarker(params) {
    const { color, tabTitle } = params || {}

    //── replace favicon with colored circle ──
    if (color) {
        //disable original favicon links instead of removing them, so they can be
        //restored when the color is cleared. [rel~="icon"] is token-based and also
        //catches "shortcut icon", "alternate icon" etc. runs on every pass since
        //pages may re-add icon links dynamically; idempotent because disabled
        //links no longer match the selector
        document.querySelectorAll('link[rel~="icon" i]').forEach((el) => {
            if (!el.dataset.pegaMarker) {
                el.dataset.pegaOrigRel = el.rel
                el.rel = 'pega-disabled'
            }
        })

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
            link.setAttribute('sizes', '32x32')
            link.href = canvas.toDataURL('image/png')
            link.dataset.pegaMarker = 'true'
            link.dataset.pegaColor = color

            document.head.appendChild(link)
        }
    } else {
        //color was cleared while the marker still applies (e.g. title kept) — restore favicon
        const marker = document.querySelector('link[data-pega-marker]')
        if (marker) marker.remove()

        const disabled = document.querySelectorAll('link[data-pega-orig-rel]')
        if (marker && disabled.length === 0) {
            //the browser re-evaluates favicons only on icon-link insertion or
            //rel/href mutation, not on removal — on pages without their own
            //icon links, insert the default candidate to force the dot off
            const fallback = document.createElement('link')
            fallback.rel = 'icon'
            fallback.href = '/favicon.ico'
            document.head.appendChild(fallback)
        }
        disabled.forEach((el) => {
            el.rel = el.dataset.pegaOrigRel
            delete el.dataset.pegaOrigRel
        })
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

    //re-enable original favicon links disabled by applyTabMarker
    const disabled = document.querySelectorAll('link[data-pega-orig-rel]')
    if (marker && disabled.length === 0) {
        //the browser re-evaluates favicons only on icon-link insertion or
        //rel/href mutation, not on removal — on pages without their own
        //icon links, insert the default candidate to force the dot off
        const fallback = document.createElement('link')
        fallback.rel = 'icon'
        fallback.href = '/favicon.ico'
        document.head.appendChild(fallback)
    }
    disabled.forEach((el) => {
        el.rel = el.dataset.pegaOrigRel
        delete el.dataset.pegaOrigRel
    })

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

/* the extension is considered active on a tab when it does something there:
the tab belongs to an enabled project (color/title markers, tab switch etc.)
or extension content scripts were injected into it (tracer tools, dev studio
enhancements) */
async function isExtensionActiveOnTab(tab) {
    if (!tab?.id) return false

    //read storage directly: the in-memory cache may be empty right after
    //a service worker cold start
    const { settings } = await chrome.storage.sync.get('settings')
    const projects = settings?.projects || []

    const matchesProject = projects.some(
        (p) => p.enabled && p.url && tab.url && tab.url.includes(p.url)
    )
    if (matchesProject) return true

    const processedTabs = await getProcessedTabs()
    return processedTabs.has(tab.id)
}

/* sets the toolbar icon for a specific tab. tab-scoped icons follow tab and
window switches automatically and reset to the (grey) default on navigation */
function setTabStatusIcon(tabId, tab) {
    isExtensionActiveOnTab(tab)
        .then((isActive) =>
            chrome.action.setIcon({
                tabId: tabId,
                path: isActive
                    ? '/assets/img/icon-38.png'
                    : '/assets/img/icon_grey-38.png',
            })
        )
        .catch(() => {}) //tab may be gone by the time the icon is set
}

//refresh icons for all open tabs. used when settings change
function refreshAllTabIcons() {
    chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
            if (t.id) setTabStatusIcon(t.id, t)
        }
    })
}

//tab loading event: fresh load/refresh
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    //mark tab with project color on every complete load
    if (changeInfo.status === 'complete' && tab.url) {
        markTab(tabId, tab.url)
    }

    try {
        /* a navigation or reload wipes injected scripts — drop the processed
        membership so the new page is re-evaluated (and the icon recomputed).
        return right away: at this point tab.title still belongs to the
        OUTGOING page, so falling through could match and inject against the
        wrong page. later title/complete events carry the new page's title */
        if (changeInfo.status === 'loading') {
            await deleteProcessedTab(tabId)
            return
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

        //diagnostic: shows the actual tab title and which config (if any) matched
        console.log('[pega-ext] evaluating tab', tabId, '| status=', changeInfo.status, '| title=', JSON.stringify(tab.title), '| matched=', matched ? matched.titleMatch : 'NONE')

        if (matched) {
            injectJavascript(tabId, matched.scripts)
            if (matched.css) injectCSS(tabId)
        } else if (isComplete) {
            injectJavascript(tabId, ['./build/content-checker.js'])
            await deleteProcessedTab(tabId) //tab might not be ready yet and should be processed later
        } else {
            await deleteProcessedTab(tabId) //tab might not be ready yet and should be processed later
        }
    } finally {
        /* refresh icon after the processedTabs add/delete dance settles,
        so a transient membership never sticks as a wrong icon state */
        setTabStatusIcon(tabId, tab)
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
            console.log('[pega-ext] injected', jsFilesArr)
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
        /* respond from storage rather than the in-memory cache: the cache is
        empty right after a service worker cold start. merging the defaults
        keeps them effective even if the install-time seeding failed */
        chrome.storage.sync
            .get('settings')
            .then((result) => {
                sendResponse({
                    payload: { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) },
                })
            })
            .catch(() => sendResponse({ payload: { ...DEFAULT_SETTINGS } }))

        return true //keep the message channel open for the async response
    } else if (
        message.type === 'settingsUpdated' &&
        message.sender === 'pega-extension'
    ) {
        /* loop through all processed tabs and send a message to update settings
        also update settings local copy */
        getProcessedTabs().then((tabs) => {
            for (const t of tabs) {
                chrome.tabs
                    .sendMessage(t, {
                        type: 'settingsUpdated',
                        sender: 'pega-extension',
                    })
                    .catch(() => {}) //tab may have no content-script listener

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
                refreshAllTabIcons()
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
            .then(() => setTabStatusIcon(tabId, sender.tab))
            .catch(() => {})
    }

    if (tabId && message.styles) {
        injectCSS(tabId)
        addProcessedTab(tabId)
            .then(() => setTabStatusIcon(tabId, sender.tab))
            .catch(() => {})
    }
})

/* extension activeness indicator: per-tab icons follow tab switches on their
own, but tabs opened before the service worker started have no tab-scoped
icon yet — evaluate them on first activation */
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs
        .get(activeInfo.tabId)
        .then((tab) => setTabStatusIcon(activeInfo.tabId, tab))
        .catch(() => {})
})

//tabs restored on browser startup have no tab-scoped icon yet
chrome.runtime.onStartup.addListener(() => refreshAllTabIcons())

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

/* serializes settings writes so two near-simultaneous saves (e.g. tracer column
 * widths + hidden columns, which are separate keys on the one `settings` object)
 * can't both read the same baseline and clobber each other's update */
let settingsWriteChain = Promise.resolve()

/* set extension settings. some settings saved from content scripts
 */
function updateExtensionSetting(key, value) {
    if (!key) {
        console.warn('key cannot be empty')
    }

    //run each read-modify-write to completion before the next one starts
    settingsWriteChain = settingsWriteChain
        .catch(() => {}) //a prior failure must not break the chain
        .then(() => chrome.storage.sync.get('settings'))
        .then((result) => {
            const extSettings = result.settings ?? {}
            extSettings[key] = value
            return chrome.storage.sync.set({ settings: extSettings })
        })
        .then(() =>
            //broadcast that settings changed; no receiver (e.g. popup closed) is
            //fine - swallow the "Receiving end does not exist" rejection
            chrome.runtime
                .sendMessage({ type: 'settingsUpdated', sender: 'pega-extension' })
                .catch(() => {})
        )
        .catch((err) => console.warn('settings write failed', err))
}

//sync between browser should trigger settings refresh. not tested at all
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        chrome.storage.sync
            .get('settings')
            .then((result) => {
                extensionSettingsCached = result.settings
                markAllTabs()
                refreshAllTabIcons()
            })
            .catch(() => {})
    }
})