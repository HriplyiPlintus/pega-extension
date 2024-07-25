let processedTabs = []
let extensionSettingsCached = {}

getExtensionSettings()

//changes extension icon from active to not active and vice versa
function setExtensionStatusIcon() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0]

        chrome.storage.sync.get('settings').then((result) => {
            const settings = Array.isArray(result.settings)
                ? result.settings
                : []

            const urls = settings.map((s) => s.url)

            if (urls.length === 0) {
                chrome.action.setIcon({
                    path: '/assets/img/icon_grey-38.png',
                })
            } else {
                for (const url of urls) {
                    if (activeTab.url.includes(url)) {
                        chrome.action.setIcon({
                            path: '/assets/img/icon-38.png',
                        })
                    } else {
                        chrome.action.setIcon({
                            path: '/assets/img/icon_grey-38.png',
                        })
                    }
                }
            }
        })
    })
}

//tab loading event: fresh load/refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    setExtensionStatusIcon()

    //exit if tab already processed
    if (processedTabs.includes(tabId)) return

    processedTabs.push(tabId)

    if (tab.title.includes('Properties on Page TraceEvent')) {
        injectJavascript(tabId, [
            './build/lib/sqlformatter.min.js',
            './build/content_scripts/tracer-sql-with-inserts.js',
        ])
        injectCSS(tabId)
    } else if (tab.title.includes('Properties on Page ')) {
        //context page data representation
        injectJavascript(tabId, [
            './build/content_scripts/tracer-context-page.js',
        ])

        injectCSS(tabId)
    } else if (
        tab.title.includes('Tracer - PegaRULES') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/tracer.js'])
    } else if (
        tab.title.includes('Tracer Settings') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/tracer-settings.js'])

        injectCSS(tabId)
    } else if (
        tab.title.includes('Clipboard Viewer') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/clipboard.js'])
    } else if (changeInfo.status && changeInfo.status === 'complete') {
        injectJavascript(tabId, ['./build/content-checker.js'])
    } else {
        processedTabs.pop(tabId) //tab might not be ready yet and should be processed later
    }

    console.log('tab loading event. tabId', {
        tabid: tabId,
        status: changeInfo.status,
    })
})

//remove tabs from the array of processed tabs when tab's closed
chrome.tabs.onRemoved.addListener((tabId, info) => {
    const index = processedTabs.indexOf(tabId)

    processedTabs.splice(index, 1)

    console.log('removed processedTabs', processedTabs)
})

//injects js into content page. used in content-checker.js
function injectJavascript(tabId, jsFilesArr, callback) {
    console.log('injecting', jsFilesArr)
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
            /*
            if (
                !err
                    .toString()
                    .contains('Cannot access chrome:// and edge:// URLs')
            )
                console.error(err)
                */
        })
}

function injectCSS(tabId) {
    chrome.scripting
        .insertCSS({
            target: { tabId: tabId },
            files: ['./build/styles.css'],
        })
        .then(() => {
            console.debug('INJECTED THE FOREGROUND CSS')
        })
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
        //loop through all processed tabs and send a message to update settings
        for (const t of processedTabs) {
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
    }

    if (tabId && message.script) {
        injectJavascript(tabId, [`./build/content_scripts/${message.script}`])
    }

    if (tabId && message.styles) {
        injectCSS(tabId)
    }
})

//extension activeness indicator: switching extension icon depending on tab url
chrome.tabs.onActivated.addListener(setExtensionStatusIcon)

/* get cached settings and update cache with new settings from synced storage
browser closes connection for sending message before gettings new data from 
async storage hance returning previously cached data and update it in async way */
function getExtensionSettings() {
    //update settings cache
    chrome.storage.sync
        .get('settings')
        .then((result) => {
            extensionSettingsCached = result.settings
        })
        .catch((err) => console.error('Filed to get extension settings', err))

    return extensionSettingsCached
}

//sync between browser should trigger settings refresh. not tested at all
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        getExtensionSettings()
    }
})
