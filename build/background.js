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

//decides what script to inject and when
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    setExtensionStatusIcon()

    if (processedTabs.includes(tabId)) {
        return
    } else if (tab.title.includes('Properties on Page TraceEvent')) {
        injectJavascript(tabId, [
            './build/lib/sqlformatter.min.js',
            './build/content_scripts/tracer-sql-with-inserts.js',
        ])
        injectCSS(tabId)
        processedTabs.push(tabId)
    } else if (
        tab.title.includes('Tracer - PegaRULES') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/tracer.js'])
        processedTabs.push(tabId)
    } else if (
        tab.title.includes('Tracer Settings') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/tracer-settings.js'])
        processedTabs.push(tabId)
        injectCSS(tabId)
    } else if (
        tab.title.includes('Clipboard Viewer') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/clipboard.js'])
        processedTabs.push(tabId)
    } else if (changeInfo.status && changeInfo.status === 'complete') {
        injectJavascript(tabId, ['./build/content-checker.js'])
    }

    /*
    chrome.tabs.sendMessage(tabId, {
        type: "trace_details"
    })
    */
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
    const tabId = sender.tab.id

    //request for extension settings from content script
    if (message.message === 'getSettings') {
        let payload = getExtensionSettings()

        if (sendResponse) {
            sendResponse({
                payload: payload,
            })
        }
    }

    if (message.script) {
        injectJavascript(tabId, [`./build/content_scripts/${message.script}`])
    }

    if (message.styles) {
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
