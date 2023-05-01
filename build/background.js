let processedTabs = []

//меняет иконку расширения
function setExtensionStatusIcon() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0]

        chrome.storage.sync.get('settings').then((result) => {
            const urls = result.settings.map((s) => s.url)

            for (const url of urls) {
                if (activeTab.url.includes(url)) {
                    chrome.action.setIcon({ path: '/assets/img/icon-38.png' })
                } else {
                    chrome.action.setIcon({
                        path: '/assets/img/icon_grey-38.png',
                    })
                }
            }
        })
    })
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    setExtensionStatusIcon()

    if (processedTabs.includes(tabId)) {
        return
    } else if (tab.title.includes('Properties on Page TraceEvent')) {
        injectJavascript(tabId, [
            './build/lib/sqlformatter.min.js',
            './build/content_scripts/tracer-sql-with-inserts.js',
        ])

        processedTabs.push(tabId)
    } else if (
        tab.title.includes('Tracer Settings') &&
        changeInfo.status &&
        changeInfo.status === 'complete'
    ) {
        injectJavascript(tabId, ['./build/content_scripts/tracer-settings.js'])
        processedTabs.push(tabId)
        injectCSS(tabId)
    } else if (changeInfo.status && changeInfo.status === 'complete') {
        injectJavascript(tabId, ['./build/content-checker.js'])
    }

    /*
    chrome.tabs.sendMessage(tabId, {
        type: "trace_details"
    })
    */
})

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
        .catch((err) => console.error(err))
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

    if (message.script) {
        injectJavascript(tabId, [`./build/content_scripts/${message.script}`])
    }

    if (message.styles) {
        injectCSS(tabId)
    }
})

//extension activeness indicator: switching extension icon depending on tab url
chrome.tabs.onActivated.addListener(setExtensionStatusIcon)
