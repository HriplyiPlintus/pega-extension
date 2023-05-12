console.log('hi there!')

/*
TODO: посмотреть existingTimers и как чистить интервалы в добавлении sig 
и с какой частотой запускается добавление sig
*/

/*
_tabIframeLoadedCallback - парсит пега табу
getCurrentOpenTabElement - достает нод элемент открытой табы

//это для тестов только. прокидываение скрипта в страницу
let s = document.createElement('script')
s.src = chrome.runtime.getURL('assets/war/dev-portal.js')
s.onload = function () {
    //this.remove()
    console.log(s.src)
}
;(document.head || document.documentElement).appendChild(s)
*/

/*
    visited - интерфейс взаимодействия с посещенными табами 
    массив айдишников таб. причем, если пользователь закрывает табу, 
    то она удаляется из массива, чтобы нельзя было больше перейти на нее по истории

    тип объявлен в глобальном объекте window, потому что при рефреше пега табы, 
    скрипт пытается отработать заново. будто это какой-то хитрый рефреш стейта

    clearInterval(tabId) - очищает интервал и удаляет id интервала из объекта _tabsInfo
    intervalId из _tabsInfo используется в setCurrentTab, чтобы не запускать механизм повторно
*/

if (typeof Tabs !== 'function') {
    window.Tabs = class {
        constructor() {
            //пока реализовано только для dev студии
            if (!document.querySelector('div.dev-studio')) {
                console.log('!!!!!!!!! не дев студия')
                return
            }

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

            //клики по табам
            this.tabsListClickHandler = this.tabsListClickHandler.bind(this)
            this.tabsRef.addEventListener('click', this.tabsListClickHandler)

            //обработка клика по табе средней клавишей мыши
            this.tabsListMiddleClickHandler =
                this.tabsListMiddleClickHandler.bind(this)
            this.tabsRef.addEventListener(
                'auxclick',
                this.tabsListMiddleClickHandler
            )

            //делаю все открытые табы сразу draggable
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

        //копирует в клипборд, добавляет класс
        makeElementTextCopiable(element, textToCopy, tooltip = 'Copy value') {
            if (element) {
                element.classList.add('pega-extension__copy-value')
                element.dataset.tooltip = tooltip

                //функция копирования класса рула в клипборд
                element.addEventListener('click', () => {
                    navigator.clipboard.writeText(textToCopy)

                    const copyDonePopup = document.createElement('div')
                    copyDonePopup.classList.add(
                        'pega-extension__copied_to_clipboard'
                    )
                    copyDonePopup.innerText = 'Copied to clipboard'

                    document.querySelector('body').appendChild(copyDonePopup)

                    setTimeout(() => {
                        copyDonePopup.remove()
                    }, 1500)
                })
            }
        }

        //инициализирует список таб для переключения (список visited)
        //TODO: перенести в эту функцию часть из конструктора
        initVisitedTabs() {
            /* иногда в списке посещенных бывает только текущая таба например, после того,
            как браузурная таба открывается заново без релогина или просто рефреш браузерной табы */
            //список старых таб из хранилища, дедублицированные и отсортированные
            const visitedRaw = this.visited.getAll() //список посещенных таб до рефреша в оригинальном виде
            const visitedTabsArr = [...new Set(visitedRaw)].sort() //дедублицированный список таб, посещенных до рефреша

            //список всех открытых таб
            const newTabsRaw = this.getCurrentTabIdsArr()

            let newTabsArr = [...new Set(newTabsRaw.map((obj) => obj))].sort() //список таб дедублицированный

            if (
                newTabsArr.length !== visitedTabsArr.length ||
                JSON.stringify(newTabsArr) !== JSON.stringify(visitedTabsArr)
            ) {
                //если списки посещенных и тукущих не совпадают
                this.visited.setAll(newTabsRaw) //если же старый список не относится к текущим табам, применяем список текущих таб
            } else {
                this.visited.setAll(visitedRaw) //перекладываем старый список в новый
            }

            this.setCurrent(this.getCurrentOpenTabElement()) //инициализируем открытую табу
        }

        //интерфейс взаимодействия с visited; TODO: для getAll и length нужно хранить в памяти, чтобы не обрщтаься в local storage всегда
        /* данные хранятся в visited в sessionStorage, взаимодействие происходит через интерфейсные функции */
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
                //возвращает массив + обрабатывается ситуация с невалидным json.
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

        //интерфейс взаимодействия с _tabsInfo
        //получить инфу по табе
        getTabInfo(tabId) {}
        //флашнуть всю инфу по табе
        flushTabInfo(tabId) {}

        onTabSwitch(e) {
            //свитчит табы в дев студии
            if (e.metaKey && e.key === 'e') {
                e.preventDefault()

                const prevTabIndex = this.visited.length() - 2

                if (prevTabIndex >= 0) {
                    const prevTab = this.visited.getAll()[prevTabIndex]

                    this.tabsRef.querySelector(`li#${prevTab}`)?.click()
                }
            }
        }

        setCurrent(tab) {
            tab?.setAttribute('draggable', true) //делает табу draggable

            //actualize list of visited tabs on each attempt of setting current
            const currentTabIdsArr = this.getCurrentTabIdsArr()

            for (const vt of this.visited.getAll()) {
                if (!currentTabIdsArr.includes(vt)) {
                    this.remove(vt)
                }
            }

            //добавить, если последняя открытая таба отличается от той, которую хотят добавить или пока таб не было
            if (
                this.visited.currentTab !== tab.id ||
                this.visited.length() === 0
            ) {
                this.visited.push(tab.id) //добавляет в стек посещенных таб
                this.visited.currentTab = tab.id //TODO
            }

            console.log(
                'will setCurrent check iframe?',
                !this._tabsInfo[tab.id]
            )

            //проверяем, есть ли найстройки для табы
            if (this._tabsInfo[tab.id]?.intervalId) return

            //иначе удаляем старый таймер и выставляем новый, чтобы получить актуальные данные
            //this.clearInterval(tab.id)

            //добавлем настройку таймаута
            this._tabsInfo[tab.id] = {
                loadingTimeout: this.TAB_CONTENT_LOADING_TIMEOUT,
            }

            //раз в TAB_CONTENT_SCAN_TIMOUT будет пытаться достать данные из табы
            const intervalId = setInterval(
                this._iframeLoaded(tab.id),
                this.TAB_CONTENT_SCAN_TIMOUT
            )

            this._tabsInfo[tab.id].intervalId = intervalId //таймаут на загрузку. после этого попыток загрузиться больше не будет
        }

        //достает всю инфу из табы пеги == парсит табу
        _tabIframeLoadedCallback(iframeDoc, tabId, tabContentElement) {
            if (iframeDoc) {
                //TODO: пробую ловить свитч табы из iframe
                iframeDoc.body.addEventListener('keydown', this.onTabSwitch)

                let innerHeader =
                    iframeDoc.querySelector(
                        '.layout-noheader-ruleform_header'
                    ) ||
                    iframeDoc.querySelector('.layout-noheader-workarea_header') //это для бранча

                if (!innerHeader) {
                    console.debug('not a regular tab, check manually', tabId)
                    return
                } else {
                    //если наконец нашли шапку табы, прекращаем опрашивать табу
                    this.clearInterval(tabId)
                    //clearInterval(this._tabsInfo[tabId].intervalId)
                }

                //все ниже относится пока только к обычным рулам типа активити
                const ruleTypeName = (
                    innerHeader.querySelector(
                        '[data-ui-meta*="pyObjClassLabel"] .workarea_header_titles'
                    ) ||
                    //это для бранча
                    innerHeader.querySelector(
                        'div.item-1 span.workarea_header_titles'
                    )
                )?.innerText.replace(/:\s*$/, '')

                //вообще, для ruleTypeName == Application
                const branchesCount = innerHeader.querySelectorAll(
                    'table[pl_prop=".pyBranchList"] tr[oaargs]'
                ).length

                //это только для бранча
                const rulesCount = iframeDoc.querySelectorAll(
                    'table[pl_prop*="D_pzBranchContent"]>tbody>tr.oddRow, tr.evenRow'
                ).length

                const ruleLabelElement =
                    innerHeader.querySelector(
                        'span .workarea_header_highlight'
                    ) ||
                    //это для бранча
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

                //добавление функции копирования класс рула в клипборд TODO: убрать в отельную функцию?
                const classLabelElement = classElements?.querySelector('label')

                //добавление стилей в iframe
                let cssLink = document.createElement('link')
                cssLink.href = chrome.runtime.getURL('build/styles.css')
                cssLink.rel = 'stylesheet'
                cssLink.type = 'text/css'
                iframeDoc.head.appendChild(cssLink)

                this.makeElementTextCopiable(
                    classLabelElement,
                    className,
                    'Copy class name'
                )

                //Purpose для decision table
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

                //для некоторых рулов имя формируется из нескольких составляющих через разделитель
                const nameSpanElements =
                    ruleNameElement?.parentElement.querySelectorAll('span')

                let ruleName = ''

                if (nameSpanElements) {
                    for (const se of nameSpanElements) {
                        ruleName += se.innerText.trim() + ' '
                    }

                    ruleName = ruleName.trim()
                }

                //добавление копируемости по клику
                const ruleNameLabelElement = ruleNameElement
                    ?.closest('div.content-item')
                    .querySelector('label.field-caption')

                this.makeElementTextCopiable(
                    ruleNameLabelElement,
                    ruleName,
                    'Copy rule name'
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

                //добавление кликабельности для рулсета (сделано с версией, TODO: добавить конфигурируемость через настройки)
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

                //learInterval(this._tabsInfo[tabId].intervalId) //TODO: too much invokation

                //подготовка к добавлению кастомных иконок
                const ruleLabelAndType =
                    ruleLabelElement?.closest('div.content-item')?.parentElement

                if (ruleLabelAndType) {
                    //функция для добавления иконки с копируемым текстом
                    const addCustomAcitonIcon = (
                        infoValue,
                        tooltipText,
                        elementId,
                        iconPath
                    ) => {
                        const wrapperDiv = document.createElement('div')
                        wrapperDiv.classList.add('content-item')

                        const icon = document.createElement('img')
                        icon.setAttribute('id', elementId)
                        icon.classList.add('pega-extension__copy-value')
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
                    //добавление pzInsKey
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

                        const pzInsKey = tempElement
                            .querySelector('pzDocumentKey')
                            ?.innerText.trim()

                        if (pzInsKey) {
                            addCustomAcitonIcon(
                                pzInsKey,
                                'Copy rule pzInsKey',
                                'pega-extension__rule-info-pzinskey',
                                './assets/img/key.png'
                            )
                        }
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
                    }
                }

                //добавление лейбла SIG
            } else if (tabContentElement) {
                //for home page - она не в iframe
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
                    //контент грузится асинхронно, нужно попытаться попозже
                    return
                }

                this.clearInterval(tabId)
                //clearInterval(this._tabsInfo[tabId].intervalId) //TODO: this should be refactored. вызывается из 2 веток
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

        //ждет загрузки iframe и вызывает коллбек
        _iframeLoaded(tabId) {
            return function () {
                //уменьшаем количество попыток
                if (
                    //после рефреша табы все объекты обнуляются, а некоторые таймеры оказываются в промежуточном состоянии
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
                        //проверка, что id нет в списке с табами
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

                //очищаем интервал
                if (this._tabsInfo[tabId].loadingTimeout < 0) {
                    //clearInterval(this._tabsInfo[tabId].intervalId)
                    this.clearInterval(tabId)
                }

                //тут пытаемся вытащить iframe, потому что для всех, кроме home информация лежит в iframe
                if (tabId) {
                    const iframe = document.querySelector(
                        `div.tabContent .iframe-wrapper[aria-labelledby="${tabId}"] iframe`
                    ) //TODO есть такой же кусок, нужно бы поместить в отдельную функцию

                    //home page
                    const tabContentElement = document.querySelector(
                        'div [data-node-id="pzStudioHomeWrapper"]'
                    )

                    if (iframe) {
                        const iframeDoc =
                            iframe.contentDocument ||
                            iframe.contentWindow.document

                        /* тут может возникнуть ситуация, когда есть айфрейм, 
                        но внутри табы контент еще не подгрузился, тогда чистить 
                        интервал не нужно, путь опршивает табу, пока не закончатся попытки */
                        if (iframeDoc.readyState === 'complete') {
                            this._tabIframeLoadedCallback(iframeDoc, tabId)
                            return
                        }
                    } else if (tabContentElement) {
                        //home page - она не в iframe
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
                //удаляем закрытую табу из стории и заодно удаляет дубликаты, которые могли образоваться после удаления
                if (visited[i] !== tabId) {
                    if (visited[i] !== duplTab || i === 0) {
                        deduplicatedArr.push(visited[i])
                        duplTab = visited[i]
                    }
                }
            }

            this.visited.setAll(deduplicatedArr)

            delete this._tabsInfo[tabId] //удаление информации о табе
        }

        getCurrent() {
            //возвращает id последней открытой табы
            if (this.visited.length() > 0) {
                return this.visited[this.visited.length() - 1]
            }
        }

        getInfo(tabId) {
            return this._tabsInfo[tabId]
        }

        getPrevious() {
            //возвращает id предпоследней открытой табы
            if (this.visited.length() > 1) {
                return this.visited[this.visited.length - 2]
            }
        }

        //хендлер выбора табы - вызывает setCurrent
        //вероятно, будут проблемы, если пользоатель двигается по табам не кликами. не знаю, возможно ли это
        tabsListClickHandler(e) {
            let existingTabs = []
            for (let tab of this.tabsRef.querySelectorAll('li[role="tab"]')) {
                existingTabs.push(tab.id)
            }

            const selectedTab = e.target.closest('li[role="tab"]')

            //доп защита, чтобы добавлять только те табы, которые реально есть в списке
            if (selectedTab && existingTabs.includes(selectedTab.id)) {
                this.setCurrent(selectedTab) //добавление кликнутой табы в список посещенных таб
            }
        }

        //закрытие табы по клику по колесику мыши
        tabsListMiddleClickHandler(e) {
            let selectedTab = e.target.closest('li[role="tab"]')
            if (selectedTab && e.button === 1) {
                selectedTab.querySelector('.iconCloseSmall')?.click()
            }
        }

        //создает поповер для выбранной табы
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

        //config для mutation observer
        /*
        known issue fixed: tab switch and current tab setting does not work if tab open
        occures for one of the existing tab from references component
        */
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
            по double click будет открываться общее окно логов пеги
            по клику будут открываться либо PEGA логи, либо external логи
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

            //будет открывать по клику
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

            //по двойному клику открывать общее окно логов
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
    //произошел рефреш рула через actions > refresh
    window.tabs.setCurrent(window.tabs.getCurrentOpenTabElement())
}
