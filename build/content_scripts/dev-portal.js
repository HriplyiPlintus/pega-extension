/*
_tabIframeLoadedCallback - parses pega tab
getCurrentOpenTabElement - retrieves node element of opened tab

//only for tests, injects js file
let s = document.createElement('script')
s.src = chrome.runtime.getURL('assets/war/dev-portal.js')
s.onload = function () {
    //this.remove()
    console.log(s.src)
}
;(document.head || document.documentElement).appendChild(s)
*/

/*
    visited - interface to work with visited tabs. contains the list of visited tabs
    if the user closes one of the tabs it will be removed from all the places of this list

    type declared in global object window because on pega tab refresh
    script attempts to run again

    clearInterval(tabId) - clears interval and removes interval id from _tabsInfo
    intervalId from _tabsInfo used in setCurrentTab, to avoid start processing again
*/

if (typeof Tabs !== 'function') {
    window.Tabs = class {
        constructor() {
            //implemented only for dev studio
            if (!document.querySelector('div.dev-studio')) {
                return
            }

            //get os type. try to get value from local storage first
            let osType = navigator.userAgentData.platform
            if (osType.toLowerCase().includes('mac')) {
                osType = 'mac'
            }
            this.OS_TYPE = osType

            this._tabsInfo = {}
            this.TAB_CONTENT_SCAN_TIMOUT = 500
            this.TAB_CONTENT_LOADING_TIMEOUT = 120000
            this.tabsRef = document.querySelector(
                '#workarea div.tStrCntr ul[role="tablist"]'
            )

            if (!this.visited.currentTab) {
                this.visited.currentTab = this.getCurrentOpenTabElement().id
            }

            //feature: IDK if you was pissed off or not by this but now you can't select tab's text
            this.tabsRef.style.userSelect = 'none'

            this.setCurrent = this.setCurrent.bind(this)
            this.remove = this.remove.bind(this)
            this.getCurrent = this.getCurrent.bind(this)
            this.getPrevious = this.getPrevious.bind(this)

            //tabs clicks
            this.tabsListClickHandler = this.tabsListClickHandler.bind(this)
            this.tabsRef.addEventListener('click', this.tabsListClickHandler)

            //handling middle click
            this.tabsListMiddleClickHandler =
                this.tabsListMiddleClickHandler.bind(this)
            this.tabsRef.addEventListener(
                'auxclick',
                this.tabsListMiddleClickHandler
            )

            //makes all opened tabs draggable
            for (const t of this.tabsRef.querySelectorAll('li[role="tab"]')) {
                t?.setAttribute('draggable', true)
            }

            this.initVisitedTabs = this.initVisitedTabs.bind(this)
            this.initVisitedTabs()

            this._tabsObserver.observer = new MutationObserver(
                this._tabsObserver.callback
            )

            this._tabsObserver.observer.observe(
                this.tabsRef,
                this._tabsObserver.config
            )

            this.onTabSwitch = this.onTabSwitch.bind(this)
            window.addEventListener('keydown', this.onTabSwitch)

            //binding
            this.visited.push = this.visited.push.bind(this)
            this.visited.getAll = this.visited.getAll.bind(this)
            this.visited.length = this.visited.length.bind(this)
            this.visited.setAll = this.visited.setAll.bind(this)

            this.addLogsToolbarItem() //add logs icon for tooter toolbar

            this.getExtensionSettings()
        }

        //get extension settings. mainly set from popup and map to current object
        getExtensionSettings() {
            chrome.runtime.sendMessage(
                { message: 'getSettings' },
                (response) => {
                    if (response?.payload) {
                        const settingsResponse =
                            response.payload['tab-switch'] ?? null

                        if (
                            settingsResponse &&
                            settingsResponse[this.OS_TYPE]
                        ) {
                            this.tabSwitchSettings = JSON.parse(
                                settingsResponse[this.OS_TYPE]
                            )
                        }
                    }
                }
            )
        }

        getCurrentOpenTabElement() {
            const currentTab = this.tabsRef.querySelector(
                'li[role="tab"][tabindex="0"]'
            )

            return currentTab
        }

        getCurrentTabIdsArr() {
            return (
                [...this.tabsRef.querySelectorAll('li[role="tab"]')].map(
                    (t) => t.id
                ) || []
            )
        }

        clearInterval(tabId) {
            if (!this._tabsInfo[tabId]) return

            clearInterval(this._tabsInfo[tabId].intervalId)

            this._tabsInfo[tabId].intervalId = undefined
        }

        //copies to clipboard, adds css class
        makeElementTextCopiable(
            element,
            textToCopy,
            tooltip = 'Copy value',
            isLeftmost = false
        ) {
            if (element) {
                if (isLeftmost) {
                    element.classList.add('pega-extension__copy-value-leftmost')
                } else {
                    element.classList.add('pega-extension__copy-value')
                }

                element.dataset.tooltip = tooltip

                element.addEventListener('click', () => {
                    navigator.clipboard.writeText(textToCopy)

                    const copyDonePopup = document.createElement('div')
                    copyDonePopup.classList.add(
                        'pega-extension__copied-to-clipboard'
                    )
                    copyDonePopup.innerText = 'Copied to clipboard'

                    document.querySelector('body').appendChild(copyDonePopup)

                    setTimeout(() => {
                        copyDonePopup.remove()
                    }, 1500)
                })
            }
        }

        //function to add refresh icon to the rule type window
        addRefreshIcon(ruleType, id, clickHandler, headerElement) {
            if (ruleType === 'Branch') {
            }

            const actionBtnsWrapper = headerElement
                .querySelector('button[data-click*="doClose"]')
                ?.closest('div.content')

            const refreshWrapper = document.createElement('div')
            refreshWrapper.id = id

            refreshWrapper.className =
                'content-item flex flex-row hotkey-ruleform-refresh'

            const refreshIconWrapper = document.createElement('div')
            refreshIconWrapper.classList.add('content-inner')
            const refreshIcon = document.createElement('i')
            refreshIcon.className = 'icons pi pi-refresh'
            refreshIcon.setAttribute('onclick', 'pd(event)')
            refreshIcon.dataset.click = clickHandler

            refreshIconWrapper.appendChild(refreshIcon)
            refreshWrapper.appendChild(refreshIconWrapper)
            actionBtnsWrapper.insertBefore(
                refreshWrapper,
                actionBtnsWrapper.firstChild
            )
        }

        //initializes the list of tabs for switching
        //TODO: move to this function part from constructor
        initVisitedTabs() {
            //contains the list of previously opened tabs from storage, deduplicated and sorted
            /* sometimes the list of visited tabs will have only current tab, 
            it happens after browser tab refresh */
            const visitedRaw = this.visited.getAll() //the lsit of visited tabs before refresh
            const visitedTabsArr = [...new Set(visitedRaw)].sort() //deduplicated list of tabs visited before refresh

            //list of all opened tabs
            const newTabsRaw = this.getCurrentTabIdsArr()

            let newTabsArr = [...new Set(newTabsRaw.map((obj) => obj))].sort() //deduplicated list of tabs

            if (
                newTabsArr.length !== visitedTabsArr.length ||
                JSON.stringify(newTabsArr) !== JSON.stringify(visitedTabsArr)
            ) {
                //if the of visisted is not the same as current
                this.visited.setAll(newTabsRaw)
            } else {
                //replace old list with the new one
                this.visited.setAll(visitedRaw)
            }

            this.setCurrent(this.getCurrentOpenTabElement()) //initializes opened tab
        }

        //data stored in visited attribute in sessionStorage, all interactions should be done using this API
        visited = {
            push: (tabId) => {
                const visited = this.visited.getAll()
                visited.push(tabId)

                window.sessionStorage.setItem(
                    'visited',
                    JSON.stringify(visited)
                )
            },
            getAll: () => {
                //returns array of visited tabs
                let visitedString = window.sessionStorage.getItem('visited')
                visitedString =
                    visitedString?.trim() === '' ? null : visitedString

                const visitedArr = JSON.parse(visitedString) || []

                const resultArr = []
                if (visitedArr.length > 0) {
                    resultArr[0] = visitedArr[0]
                }

                for (let i = 0; i < visitedArr.length - 1; i++) {
                    if (visitedArr[i] !== visitedArr[i + 1]) {
                        resultArr.push(visitedArr[i + 1])
                    }
                }

                return resultArr
            },
            length: () => {
                return this.visited.getAll()?.length || 0
            },
            setAll: (newVisited) => {
                window.sessionStorage.setItem(
                    'visited',
                    JSON.stringify(newVisited)
                )
            },
            currentTab: '',
        }

        tabsInfo = {}

        //API to work with tabs with _tabsInfo
        //get all info about tab
        getTabInfo(tabId) {}
        //flush all tab info
        flushTabInfo(tabId) {}

        onTabSwitch(e) {
            //switches tabs in dev studio
            if (!this.tabSwitchSettings) return

            const settings = this.tabSwitchSettings

            console.log('os type', this.OS_TYPE)
            console.log('obj', e)

            console.log(
                'expression',
                this.OS_TYPE === 'mac' &&
                    settings.sysKey === 'Meta' &&
                    e.key === settings.key
            )

            if (
                this.OS_TYPE === 'mac' &&
                ((settings.sysKey === 'Meta' && e.metaKey) ||
                    settings.sysKey === 'Alt' ||
                    settings.sysKey === 'Control') &&
                e.key === settings.key
            ) {
                e.preventDefault()

                const prevTabIndex = this.visited.length() - 2

                //console.log('prev tab index', prevTabIndex)

                if (prevTabIndex >= 0) {
                    const prevTab = this.visited.getAll()[prevTabIndex]

                    //console.log('prevTab', prevTab)

                    this.tabsRef.querySelector(`li#${prevTab}`)?.click()
                }

                //console.log('should be switch')
            }
        }

        setCurrent(tab) {
            tab?.setAttribute('draggable', true) //makes tab draggable

            //actualize list of visited tabs on each attempt of setting current
            const currentTabIdsArr = this.getCurrentTabIdsArr()

            for (const vt of this.visited.getAll()) {
                if (!currentTabIdsArr.includes(vt)) {
                    this.remove(vt)
                }
            }

            //add if the last opened tab is not the same as new one or there are no tabs yes
            if (
                this.visited.currentTab !== tab.id ||
                this.visited.length() === 0
            ) {
                this.visited.push(tab.id)
                this.visited.currentTab = tab.id
            }

            //check if setting for the tab already exists
            if (this._tabsInfo[tab.id]?.intervalId) return

            //add timeout setting
            this._tabsInfo[tab.id] = {
                loadingTimeout: this.TAB_CONTENT_LOADING_TIMEOUT,
            }

            //once in TAB_CONTENT_SCAN_TIMOUT tries to parse pega tab
            const intervalId = setInterval(
                this._iframeLoaded(tab.id),
                this.TAB_CONTENT_SCAN_TIMOUT
            )

            //loading timeout
            this._tabsInfo[tab.id].intervalId = intervalId
        }

        //parses pega tab
        _tabIframeLoadedCallback(iframeDoc, tabId, tabContentElement) {
            if (iframeDoc) {
                //TODO: try to catch tab swtich from iframe
                iframeDoc.body.addEventListener('keydown', this.onTabSwitch)

                let innerHeader =
                    iframeDoc.querySelector(
                        '.layout-noheader-ruleform_header'
                    ) ||
                    iframeDoc.querySelector('.layout-noheader-workarea_header') //for branch

                if (!innerHeader) {
                    console.debug('not a regular tab, check manually', tabId)
                    return
                } else {
                    //stop processing if tab header found
                    this.clearInterval(tabId)
                }

                //all below belongs to common rules like activity
                const ruleTypeName = (
                    innerHeader.querySelector(
                        '[data-ui-meta*="pyObjClassLabel"] .workarea_header_titles'
                    ) ||
                    //for branch
                    innerHeader.querySelector(
                        'div.item-1 span.workarea_header_titles'
                    )
                )?.innerText.replace(/:\s*$/, '')

                //for ruleTypeName == Application
                const branchesCount = innerHeader.querySelectorAll(
                    'table[pl_prop=".pyBranchList"] tr[oaargs]'
                ).length

                //only for branch
                const rulesCount = iframeDoc.querySelectorAll(
                    'table[pl_prop*="D_pzBranchContent"]>tbody>tr.oddRow, tr.evenRow'
                ).length

                const ruleLabelElement =
                    innerHeader.querySelector(
                        'span .workarea_header_highlight'
                    ) ||
                    //for branch
                    innerHeader.querySelector(
                        'div.item-2 span.workarea_header_titles'
                    )

                const ruleLabel = ruleLabelElement?.innerText.trim()

                const ruleAvailability = innerHeader.querySelector(
                    'div [data-node-id="pzRuleFormStatus"] div[data-ui-meta*=".pyRuleAvailable"] span.workarea_header_titles'
                )?.innerText

                //class name elements
                const classElements = innerHeader.querySelector(
                    'div.content-item[data-ui-meta*=".pyClassName"]'
                )

                const className = classElements
                    ?.querySelector('a')
                    ?.innerText.trim()

                //adds functionality to copy class name on click
                const classLabelElement = classElements?.querySelector('label')

                //injecting styles to iframe
                let cssLink = document.createElement('link')
                cssLink.href = chrome.runtime.getURL('build/styles.css')
                cssLink.rel = 'stylesheet'
                cssLink.type = 'text/css'
                iframeDoc.head.appendChild(cssLink)

                this.makeElementTextCopiable(
                    classLabelElement,
                    className,
                    'Copy class name',
                    true
                )

                //Purpose for decision table
                const ruleNameElement =
                    innerHeader.querySelector(
                        'div.content-item div.content-item span[title*="Name"]'
                    ) ||
                    innerHeader.querySelector(
                        'div.content-item div.content-item span[title*="Purpose"]'
                    ) ||
                    innerHeader.querySelector(
                        'div.content-item div.content-item span[title*="Decision"]'
                    )

                //for some of the rules the name generates from multiple parts
                const nameSpanElements =
                    ruleNameElement?.parentElement.querySelectorAll('span')

                let ruleName = ''

                if (nameSpanElements) {
                    for (const se of nameSpanElements) {
                        ruleName += se.innerText.trim() + ' '
                    }

                    ruleName = ruleName.trim()
                }

                //adds functionality to copy text on click
                const ruleNameLabelElement = ruleNameElement
                    ?.closest('div.content-item')
                    .querySelector('label.field-caption')

                //if class name not applicable for the rule then id will be the leftmost
                this.makeElementTextCopiable(
                    ruleNameLabelElement,
                    ruleName,
                    'Copy rule name',
                    className ? false : true
                )

                const rulesetElement = innerHeader.querySelector(
                    'div.content-item[data-ui-meta*="pzRuleFormRuleset"] div[data-node-id="pzRuleFormRuleset"] a'
                )

                const rulesetData =
                    rulesetElement?.innerText
                        .trim()
                        .replace(/[\[\]]/g, '')
                        .split(' ') || []

                const branchName = rulesetData[2] ?? undefined
                const rulesetName = rulesetData[0]?.split(':')[0]

                //adds ruleset name copy option functionality
                if (rulesetName) {
                    const rulesetNameElement = rulesetElement
                        .closest('.content-sub_section')
                        ?.querySelector('label.field-caption')

                    if (rulesetNameElement) {
                        this.makeElementTextCopiable(
                            rulesetNameElement,
                            rulesetData[0],
                            'Copy ruleset name'
                        )
                    }
                }

                const tabInfo = {
                    ruleType: ruleTypeName,
                    ruleLabel: ruleLabel,
                    ruleAvailability: ruleAvailability,
                    className: className,
                    ruleName: ruleName,
                    rulesetName: rulesetName,
                    branchName: branchName,
                    branchesCount: branchesCount,
                    rulesCount: rulesCount,
                }

                this._tabsInfo[tabId].info = tabInfo

                //find parent element where to place custom icons
                const ruleLabelAndType =
                    ruleLabelElement?.closest('div.content-item')?.parentElement

                if (ruleLabelAndType) {
                    //function for adding icon with click action
                    const addCustomAcitonIcon = (
                        infoValue,
                        tooltipText,
                        elementId,
                        iconPath
                    ) => {
                        const wrapperDiv = document.createElement('div')
                        wrapperDiv.classList.add('content-item')
                        wrapperDiv.classList.add(
                            'pega-extension__copy-value-for-icon'
                        )

                        const icon = document.createElement('img')
                        icon.setAttribute('id', elementId)
                        icon.classList.add(
                            'pega-extension__copy-value-for-icon'
                        )
                        icon.style.height = '1.23em' //sometimes there is a lag between css inject and html inject
                        icon.src = chrome.runtime.getURL(iconPath)

                        wrapperDiv.appendChild(icon)

                        this.makeElementTextCopiable(
                            icon.parentElement,
                            infoValue,
                            tooltipText
                        )

                        ruleLabelAndType.appendChild(wrapperDiv)
                    }
                    //adding pzInsKey icon
                    const elementWithKey =
                        iframeDoc.querySelector('textarea#PRXML')

                    //if no such element in dom and pzinskey value available
                    if (
                        !ruleLabelAndType.querySelector(
                            '#pega-extension__rule-info-pzinskey'
                        ) &&
                        elementWithKey
                    ) {
                        const tempElement = document.createElement('div')
                        tempElement.innerHTML = elementWithKey.innerText.trim()

                        /* BUG: sometimes it causes reload till timeout
                        Association rule creation tab opened, trying to switch to the previous tab*/
                        console.log('elementwithkey', tempElement)

                        const pzInsKey = (
                            tempElement.querySelector('pzDocumentKey') ||
                            tempElement.querySelector('pzinskey')
                        )?.innerText.trim()

                        if (pzInsKey) {
                            addCustomAcitonIcon(
                                pzInsKey,
                                'Copy rule pzInsKey',
                                'pega-extension__rule-info-pzinskey',
                                './assets/img/key.png'
                            )
                        }

                        /* for some operations like rule checkout tab content 
                        markup regenerated and it should trigger markup parsing.
                        checking for element with concrete element and want to avoid 
                        cases when observer will be attached to a tab without custom functionality.
                        no custom functionality == I don't want to watch for this tab state at all.
                        */
                        const tabContentMutationObserver = new MutationObserver(
                            () => {
                                if (
                                    !iframeDoc.querySelector(
                                        '#pega-extension__rule-info-pzinskey'
                                    )
                                ) {
                                    const tabToRework =
                                        this.tabsRef?.querySelector(
                                            `li#${tabId}`
                                        )

                                    tabContentMutationObserver.disconnect()

                                    this.setCurrent(tabToRework)
                                }
                            }
                        )

                        tabContentMutationObserver.observe(iframeDoc, {
                            subtree: true,
                            childList: true,
                        })
                    }

                    //add tag icon
                    if (
                        !ruleLabelAndType.querySelector(
                            '#pega-extension__rule-info-sig'
                        )
                    ) {
                        let ruleSignature = ''
                        if (tabInfo.ruleType === 'Branch') {
                            ruleSignature = tabInfo.ruleLabel
                        } else {
                            ruleSignature = `${tabInfo.ruleType} ${
                                tabInfo.className ? tabInfo.className + '.' : ''
                            }${tabInfo.ruleName}`
                        }

                        addCustomAcitonIcon(
                            ruleSignature,
                            'Copy rule signature',
                            'pega-extension__rule-info-sig',
                            './assets/img/tag-white.png'
                        )

                        //add refresh icons
                        if (tabInfo.ruleType === 'Branch') {
                            const id = 'pega-extension__branch-icon-refresh'
                            const clickHandler =
                                '[["refresh", ["currentharness","", "pxLPRefreshActivity", "{\\"sp\\":\\"=\\",\\"dp\\":\\"\\"}", "", "pxLPRefreshTransform,{\\"sp\\":\\"\\",\\"dp\\":\\"\\"}",":event","","pyLanding"]]]'

                            if (!innerHeader.querySelector(`#${id}`)) {
                                this.addRefreshIcon(
                                    tabInfo.ruleType,
                                    id,
                                    clickHandler,
                                    innerHeader
                                )
                            }
                        } else if (tabInfo.ruleType === 'Application') {
                            const id = 'pega-extension__app-icon-refresh'
                            const clickHandler =
                                '[["runScript", ["onBeforeExecuteActionWrapper(\\"REFRESH\\")"]],["refresh", ["currentharness","", "pzRuleFormToolbarRefresh", "{\\"sp\\":\\"=\\",\\"dp\\":\\"\\"}", "", ",{\\"sp\\":\\"\\",\\"dp\\":\\"\\"}",":event","","RH_1"]]]'

                            if (!innerHeader.querySelector(`#${id}`)) {
                                this.addRefreshIcon(
                                    tabInfo.ruleType,
                                    id,
                                    clickHandler,
                                    innerHeader
                                )
                            }
                        }
                    }
                }
            } else if (tabContentElement) {
                //for home page - it's not in iframe
                const ruleLabel = document
                    .querySelector('li[role="tab"] .textIn')
                    .innerText.trim()

                const introducedTitles = tabContentElement.querySelectorAll(
                    'div[data-node-id="pxGuardrailsGadget"] div.guardrail-warnings span a.Article_heading'
                )

                const introducedByMeList = tabContentElement.querySelectorAll(
                    'div[data-node-id="pzWarningsIntroducedChart"] div.guardrail-notice span'
                )

                const introducedByTeamList = tabContentElement.querySelectorAll(
                    'div[data-node-id="pzWarningsIntroducedByTeamContext"] div.guardrail-notice span'
                )

                if (
                    !introducedTitles.length ||
                    !introducedByMeList.length ||
                    !introducedByTeamList.length
                ) {
                    //content loads in async way, need to make a try later
                    return
                }

                this.clearInterval(tabId)
                //clearInterval(this._tabsInfo[tabId].intervalId) //TODO: this should be refactored. executed from 2 places
                /* 
                {
                    sever: {
                        mine: 0,
                        teams: 1,
                    }, 
                    moderate: {
                        mine: 0,
                        teams: 0,
                    },
                    ...
                }
                */
                let introducedWarnings = {}
                for (let i = 0; i < introducedTitles.length; i++) {
                    const id = introducedTitles[i]?.innerText.trim()
                    if (id) {
                        introducedWarnings[id] = {
                            mine: introducedByMeList[i]?.innerText.trim(),
                            teams: introducedByTeamList[i]?.innerText.trim(),
                        }
                    }
                }

                const result = {
                    ruleTypeName:
                        ruleLabel === 'Home' ? 'Home page' : ruleLabel,
                    ruleLabel: ruleLabel,
                    warnings: introducedWarnings,
                }

                this._tabsInfo[tabId].info = {
                    ruleTypeName: result.ruleTypeName,
                    ruleLabel: ruleLabel,
                    warnings: introducedWarnings,
                }
            }
        }

        //waits for iframe load and executes callback
        _iframeLoaded(tabId) {
            return function () {
                //decrement the number of attempts
                if (
                    //after the update, all objects are deleted, but the timers may be in an intermediate state
                    !this._tabsInfo[tabId] ||
                    this._tabsInfo[tabId].loadingTimeout === undefined
                ) {
                    let existingTimers = []
                    for (const ti in this._tabsInfo) {
                        const timerId = this._tabsInfo[ti].intervalId
                        if (!isNaN(timerId)) {
                            existingTimers.push({
                                timerId: Number(this._tabsInfo[ti].intervalId),
                                tabId: ti,
                            })
                        }
                    }

                    //get max timer id for existing timers
                    const maxTimerId = existingTimers.sort(function (a, b) {
                        return a.timerId - b.timerId
                    })[existingTimers.length - 1].timerId

                    for (let i = 1; i < maxTimerId * 10; i++) {
                        //check if id is not in the list of tabs
                        const etIndex = existingTimers.findIndex(
                            (et) => et.timerId === i
                        )

                        if (etIndex !== -1) {
                            //remove existing
                            this.clearInterval(
                                existingTimers[etIndex].intervalId
                            )
                        } else {
                            //remove not captured
                            clearInterval(i)
                        }
                        /*
                        if (!existingTimers.includes(i)) {
                            window.clearInterval(i)
                        }
                        */
                    }

                    return //cancel all orphan timers and exit
                }

                this._tabsInfo[tabId].loadingTimeout -=
                    this.TAB_CONTENT_SCAN_TIMOUT

                //clear interval
                if (this._tabsInfo[tabId].loadingTimeout < 0) {
                    this.clearInterval(tabId)
                }

                //try to get iframe far all tabs but some exceptions exist e.g. home page
                if (tabId) {
                    const iframe = document.querySelector(
                        `div.tabContent .iframe-wrapper[aria-labelledby="${tabId}"] iframe`
                    ) //TODO: repeating part, it's possible to wrap in a function

                    //home page
                    const tabContentElement = document.querySelector(
                        'div [data-node-id="pzStudioHomeWrapper"]'
                    )

                    if (iframe) {
                        const iframeDoc =
                            iframe.contentDocument ||
                            iframe.contentWindow.document

                        /* in case iframe exists but the content not loaded yet there are no need
                        to clear the interval, let it scan till the timeout */
                        if (iframeDoc.readyState === 'complete') {
                            this._tabIframeLoadedCallback(iframeDoc, tabId)
                            return
                        }
                    } else if (tabContentElement) {
                        //home page - id does not use iframe
                        this._tabIframeLoadedCallback(
                            null,
                            tabId,
                            tabContentElement
                        )
                    }
                }
            }.bind(this)
        }

        remove(tabId) {
            let duplTab = ''
            let deduplicatedArr = []

            const visited = this.visited.getAll()

            for (let i = 0; i < visited.length; i++) {
                //remove closed tab from history and remove duplicates, that may be generated after removal
                if (visited[i] !== tabId) {
                    if (visited[i] !== duplTab || i === 0) {
                        deduplicatedArr.push(visited[i])
                        duplTab = visited[i]
                    }
                }
            }

            this.visited.setAll(deduplicatedArr)

            delete this._tabsInfo[tabId] //remove tab info
        }

        //return last time opened tab id
        getCurrent() {
            if (this.visited.length() > 0) {
                return this.visited[this.visited.length() - 1]
            }
        }

        getInfo(tabId) {
            return this._tabsInfo[tabId]
        }

        //returns id for the last time accessed tab
        getPrevious() {
            if (this.visited.length() > 1) {
                return this.visited[this.visited.length - 2]
            }
        }

        //calls setCurrect and starts tab scan etc.
        //possible issue: could not work if user moves between tabs using buttons
        tabsListClickHandler(e) {
            let existingTabs = []
            for (let tab of this.tabsRef.querySelectorAll('li[role="tab"]')) {
                existingTabs.push(tab.id)
            }

            const selectedTab = e.target.closest('li[role="tab"]')

            //additional protection to add only tabs that exist in the list
            if (selectedTab && existingTabs.includes(selectedTab.id)) {
                this.setCurrent(selectedTab) //adds clicked tab to the list of visited tabs
            }
        }

        //close the tab on middle click
        tabsListMiddleClickHandler(e) {
            let selectedTab = e.target.closest('li[role="tab"]')
            if (selectedTab && e.button === 1) {
                selectedTab.querySelector('.iconCloseSmall')?.click()
            }
        }

        //TODO: creates popover for tab on hover
        tabsListHoverHandler(e) {
            const selectedTab = e.target.closest('li[role="tab"]')
            if (selectedTab) {
                this.generateTabInfoPopover(selectedTab.id)
            }
        }

        generateTabInfoPopover(tabId) {
            const selectedTabInfo = this._tabsInfo[tabId]
        }

        //switchTabs() {}

        //template engine
        templateEngine(e) {
            if (null == e || !1 === e) return document.createTextNode('')
            if ('string' == typeof e || 'number' == typeof e || !0 === e)
                return document.createTextNode(e)
            if (Array.isArray(e)) {
                let t = document.createDocumentFragment()
                return (
                    e.forEach((e) => {
                        t.appendChild(templateEngine(e))
                    }),
                    t
                )
            }
            let r = document.createElement(e.tag)
            if (e.cls) {
                let n = [].concat(e.cls)
                n.forEach((e) => {
                    r.classList.add(e)
                })
            }
            if (e.attrs) {
                let a = Object.keys(e.attrs)
                a.forEach((t) => {
                    r.setAttribute(t, e.attrs[t])
                })
            }
            return r.appendChild(templateEngine(e.content)), r
        }

        /* config for mutation observer
        known issue fixed: tab switch and current tab setting does not work if tab open
        occures for one of the existing tab from references component */
        _tabsObserver = {
            config: {
                childList: true,
                subtree: true,
                attributes: true,
                attributeOldValue: true,
            },
            callback: function (mutationList, observer) {
                //work with removed tabs
                for (const mr of mutationList) {
                    let openedTab = ''
                    if (mr.type === 'childList') {
                        for (const node of mr.removedNodes) {
                            if (
                                node.nodeType != Node.TEXT_NODE &&
                                node.getAttribute('role') === 'tab'
                            ) {
                                window.tabs.remove(node.getAttribute('id'))
                            }
                        }
                    } else if (mr.type === 'attributes') {
                        const targetNode = mr.target
                        //some bug here makes it work forever. probably wrong mr.target.getAttribute('aria-selected'). also check changed attribute
                        if (
                            mr.attributeName === 'aria-selected' &&
                            targetNode.getAttribute('aria-selected') ===
                                'true' &&
                            mr.oldValue === 'false' &&
                            targetNode.nodeType != Node.TEXT_NODE &&
                            targetNode.getAttribute('role') === 'tab' &&
                            targetNode.id !== openedTab
                        ) {
                            window.tabs.setCurrent(targetNode)
                            openedTab = targetNode.id
                        }
                    }
                }
            },
        }

        addLogsToolbarItem() {
            //'ENV_LOGS__INT_PEGA', ENV_LOGS__EXT, ENV_LOGS__INT_COMMON
            /* 
            egeneral logs windonw will be opened on double click
            external logs will be opened on single click
            */
            /*
            <div>
                <span>
                    <a><a dblclick/><a click/>
                    <img>Label</a>
                </span>
            </div>
            */

            if (document.querySelector('#pega-extension__log-icon')) {
                return
            }

            const tracerIcon = document.querySelector('.footer-layout .tracer')
            const logFileWrapper = document.createElement('div')
            logFileWrapper.setAttribute('id', 'pega-extension__log-icon')
            ;['content-item', 'flex'].map((c) =>
                logFileWrapper.classList.add(c)
            ) //'content-field','flex-row'

            const logFileSpan = document.createElement('span')
            logFileWrapper.appendChild(logFileSpan)

            const envSettingLogsIcon = 'ENV_LOGS__EXT' //'ENV_LOGS__INT_PEGA', ENV_LOGS__EXT, ENV_LOGS__INT_COMMON
            const envSettingLogsExtURL =
                'https://srvcrp-digops-stg1-logs.pegacloud.net/kibana'
            const logSource = {
                ENV_LOGS__EXT: {
                    href: envSettingLogsExtURL,
                    /*
                    'data-click':
                        '[["openUrlInWindow", ["#~pxRequestor.pxExternalLogURL~#", "Log Files", "height=700,width=1200,location=1,menubar=1,toolbar=1,status=1,resizable=1,location=1,scrollbars=1", "false",":event","true", "false"]]]',
                    name: 'pzStudioFooter_pyDisplayHarness_4',
                    */
                },
                ENV_LOGS__INT_COMMON: {
                    'data-click':
                        '[["openUrlInWindow", ["/prweb/PRAuth/app/PegaRULES_/pbdorj4V2aBoI4ScEONLsEaxdEWiqDby*/!TABTHREAD0?pyActivity=@baseclass.pzProcessURLInWindow&pyPreActivity=showStream&pyTargetStream=LogFileDownload&pyTargetFrame=&pyBasePage=&pyApplyTo=", "Log Files", "height=700,width=1200,location=0,menubar=0,toolbar=0,status=0,resizable=1,location=0,scrollbars=1", "false",":event","false", "false"]]]',
                    name: 'pxLogsTools_LogsLandingPage_7',
                },
                ENV_LOGS__INT_PEGA: {
                    href: '/prweb/PRAuth/app/PegaRULES_/pbdorj4V2aBoI4ScEONLsEaxdEWiqDby*/!TABTHREAD0?pyStream=LogViewer&initDisplay=true&logType=PEGA',
                },
            }

            const logSourceSettings = logSource[envSettingLogsIcon]

            const logFileA = document.createElement('a')
            logFileA.classList.add('pega-extension__log-a')

            //open on single click
            const logFileAClick = document.createElement('a')
            logFileA.appendChild(logFileAClick)
            if (envSettingLogsIcon === 'ENV_LOGS__INT_PEGA') {
                logFileAClick.setAttribute('target', 'popup')
                logFileAClick.addEventListener('click', () => {
                    window.open(
                        logSource.ENV_LOGS__INT_PEGA.href,
                        'Log files',
                        'height=700,width=1200'
                    )
                })
            } else {
                logFileAClick.href = logSourceSettings.href
                logFileAClick.target = '_blank'
            }

            //open general window on double click
            const logFileADBLClick = document.createElement('a')
            logFileA.appendChild(logFileADBLClick)
            const openLogsSettings = logSource.ENV_LOGS__INT_COMMON

            logFileADBLClick.dataset.click = openLogsSettings['data-click']
            logFileADBLClick.setAttribute('name', openLogsSettings['name'])
            logFileADBLClick.setAttribute('href', '#')
            logFileADBLClick.setAttribute('onclick', 'pd(event);')

            let timer
            logFileA.addEventListener('click', (event) => {
                if (event.detail === 1) {
                    timer = setTimeout(() => {
                        logFileAClick.click()
                    }, 200)
                }
            })

            logFileA.addEventListener('dblclick', () => {
                clearTimeout(timer)
                logFileADBLClick.click()
            })

            logFileSpan.appendChild(logFileA)

            const logFileImg = document.createElement('img')
            logFileA.appendChild(logFileImg)
            logFileA.appendChild(document.createTextNode('Logs'))
            logFileA.classList.add('Footer_nav')
            logFileImg.classList.add('pega_extension__log-icon')
            logFileImg.src = chrome.runtime.getURL('./assets/img/log.png')
            logFileImg.addEventListener('click', (e) => {
                e.target.parentElement.click()
            })

            logFileImg.addEventListener('dblclick', (e) => {
                const dblclickEvent = new MouseEvent('dblclick', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                })

                e.target.parentElement.dispatchEvent(dblclickEvent)
            })

            tracerIcon.parentElement.insertBefore(logFileWrapper, tracerIcon)
        }
    }
}

if (!window.tabs) {
    window.tabs = new window.Tabs()
} else {
    //tab content refresh occured from actions > refresh
    window.tabs.setCurrent(window.tabs.getCurrentOpenTabElement())
}
