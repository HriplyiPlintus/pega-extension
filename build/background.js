let processedTabs = []

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    //console.log('tabId', tabId)
    //console.log('changeInfo', changeInfo)
    console.log('tab', tab)
    console.log('processed tabs', processedTabs)
    console.log(
        `processing tab: ${tabId} title: ${tab.title} status: ${changeInfo.status}`
    )

    if (processedTabs.includes(tabId)) {
        return
    } else if (tab.title.includes('Properties on Page TraceEvent')) {
        function sendIconsURL() {
            chrome.tabs.sendMessage(
                tabId,
                {
                    copyImgUrl: chrome.runtime.getURL('./assets/img/copy.png'),
                    doneImgUrl: chrome.runtime.getURL('./assets/img/done.png'),
                },
                function (response) {
                    console.log(response)
                }
            )
        }

        injectJavascript(
            tabId,
            [
                './build/lib/sqlformatter.min.js',
                './build/content_scripts/tracer-sql-with-inserts.js',
            ],
            sendIconsURL
        )

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
    console.log('trying to inject', jsFilesArr)
    chrome.scripting
        .executeScript({
            target: { tabId: tabId },
            files: [...jsFilesArr],
        })
        .then(() => {
            console.log(`INJECTED THE FOREGROUND SCRIPT ${jsFilesArr}`)

            if (callback) {
                callback()
            }
        })
        .catch((err) => console.log(err))
}

function injectCSS(tabId) {
    chrome.scripting
        .insertCSS({
            target: { tabId: tabId },
            files: ['./build/styles.css'],
        })
        .then(() => {
            console.log('INJECTED THE FOREGROUND CSS')
        })
        .catch((err) => console.log(err))
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message)
    console.log('sender', sender)
    const tabId = sender.tab.id

    console.log('sendResponse', sendResponse)
    if (message.script) {
        injectJavascript(tabId, [`./build/content_scripts/${message.script}`])
    }

    if (message.styles) {
        injectCSS(tabId)
    }
})

//extension activeness indicator: switching extension icon depending on tab url
chrome.tabs.onActivated.addListener(function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const activeTab = tabs[0]

        chrome.storage.sync.get(['settings']).then((result) => {
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
})
