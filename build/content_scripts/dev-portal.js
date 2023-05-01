console.log('hi there!')

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
*/

if (typeof Tabs !== 'function') {
    window.Tabs = class {
        constructor() {
            this._tabsInfo = {}
            this.TAB_CONTENT_SCAN_TIMOUT = 200
            this.TAB_CONTENT_LOADING_TIMEOUT = 120000
            this.tabsRef = document.querySelector(
                '#workarea div.tStrCntr ul[role="tablist"]'
            )

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

        //инициализирует список таб для переключения (список visited)
        //TODO: перенести в эту функцию часть из конструктора
        initVisitedTabs() {
            /* иногда в списке посещенных бывает только текущая таба например, после того,
            как браузурная таба открывается заново без релогина или просто рефреш браузерной табы */
            //список старых таб из хранилища, дедублицированные и отсортированные
            const visitedRaw = this.visited.getAll() //список посещенных таб до рефреша в оригинальном виде
            const visitedTabsArr = [...new Set(visitedRaw)].sort() //дедублицированный список таб, посещенных до рефреша

            //список всех открытых таб
            const newTabsRaw = [
                ...this.tabsRef.querySelectorAll('li[role="tab"]'),
            ].map((t) => t.id)

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

                return JSON.parse(visitedString) || []
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
            console.log('setCurrent', tab)

            tab?.setAttribute('draggable', true) //делает табу draggable

            //добавить, если последняя открытая таба отличается от той, которую хотят добавить или пока таб не было
            if (
                this.visited.getAll()[this.visited.length() - 1] !== tab.id ||
                this.visited.length() === 0
            ) {
                this.visited.push(tab.id) //добавляет в стек посещенных таб
            }

            //если в пока нет информации о табе
            if (!this._tabsInfo[tab.id]) {
                //добавлем настройку таймаута
                this._tabsInfo[tab.id] = {
                    loadingTimeout: this.TAB_CONTENT_LOADING_TIMEOUT,
                }

                //раз в секунду будет пытаться достать данные из табы
                const intervalId = setInterval(
                    this._iframeLoaded(tab.id),
                    this.TAB_CONTENT_SCAN_TIMOUT
                )
                this._tabsInfo[tab.id].intervalId = intervalId //таймаут на загрузку. после этого попыток загрузиться больше не будет
            } else {
                //иногда ивент для лисенер для keydown слетает и переключение таб не работает
                const iframe = document.querySelector(
                    `div.tabContent .iframe-wrapper[aria-labelledby="${tab.id}"] iframe`
                ) //TODO: этот кусок повторяется, просто поищи. прям 3 строки. их нужно вынести в отдельную функцию

                if (iframe) {
                    const iframeDoc =
                        iframe.contentDocument || iframe.contentWindow.document

                    iframeDoc.body.addEventListener('keydown', this.onTabSwitch)
                }
            }

            /*
            if (
                this.visited.length() === 0 ||
                this.visited.getAll()[this.visited.length() - 1] !== tab.id
            ) {
            } else {
                console.log('skipped a lot')
            }
            */
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
                    clearInterval(this._tabsInfo[tabId].intervalId)
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

                const ruleLabel = (
                    innerHeader.querySelector(
                        'span .workarea_header_highlight'
                    ) ||
                    //это для бранча
                    innerHeader.querySelector(
                        'div.item-2 span.workarea_header_titles'
                    )
                )?.innerText.trim()

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

                classLabelElement?.classList.add('pega-extension__copy-value')
                if (classLabelElement) {
                    classLabelElement.classList.add(
                        'pega-extension__copy-value'
                    )

                    //функция копирования класса рула в клипборд
                    classLabelElement.addEventListener('click', () => {
                        navigator.clipboard.writeText(className)
                    })
                }

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

                let rulesetData =
                    innerHeader
                        .querySelector(
                            'div.content-item[data-ui-meta*="pzRuleFormRuleset"] div[data-node-id="pzRuleFormRuleset"] a'
                        )
                        ?.innerText.trim()
                        .replace(/[\[\]]/g, '')
                        .split(' ') || []

                const branchName = rulesetData[2] ?? undefined
                const rulesetName = rulesetData[0]?.split(':')[0]

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

                //добавление лейбла SIG
                if (
                    !innerHeader.querySelector('#pega-extension__rule-info-sig')
                ) {
                    const sigDiv = document.createElement('div')
                    const sigLabel = document.createElement('label')
                    sigLabel.classList.add('pega-extension__copy-value')
                    sigLabel.classList.add('rule_keys_dataLabelForWrite')
                    sigLabel.textContent = 'SIG'

                    sigDiv.appendChild(sigLabel)
                    sigDiv.classList.add('flex')
                    sigDiv.classList.add('content-item')
                    sigDiv.classList.add('pega-extension__rule-info-lable')
                    sigDiv.setAttribute('id', 'pega-extension__rule-info-sig')

                    sigLabel.addEventListener('click', () => {
                        const signature = [
                            { type: 'attr', attr: 'ruleType' },
                            { type: 'text', value: ' ' },
                        ]
                        navigator.clipboard.writeText(
                            `${tabInfo.ruleType} ${tabInfo.className}.${tabInfo.ruleName}`
                        )
                    })

                    classElements
                        ?.closest('div.rule-details')
                        ?.insertBefore(
                            sigDiv,
                            classElements.closest('div.rule-details').firstChild
                        )
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

                clearInterval(this._tabsInfo[tabId].intervalId) //TODO: this should be refactored. вызывается из 2 веток
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
                            existingTimers.push(
                                Number(this._tabsInfo[ti].intervalId)
                            )
                        }
                    }

                    const maxTimerId = existingTimers.sort(function (a, b) {
                        return a - b
                    })[existingTimers.length - 1]

                    for (let i = 1; i < maxTimerId * 10; i++) {
                        //проверка, что id нет в списке с табами
                        if (!existingTimers.includes(i)) {
                            window.clearInterval(i)
                        }
                    }

                    return //cancel all orphan timers and exit
                }

                this._tabsInfo[tabId].loadingTimeout -=
                    this.TAB_CONTENT_SCAN_TIMOUT

                //очищаем интервал
                if (this._tabsInfo[tabId].loadingTimeout < 0) {
                    clearInterval(this._tabsInfo[tabId].intervalId)
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

        switchTabs() {}

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
        _tabsObserver = {
            config: { childList: true },
            callback: function (mutationList, observer) {
                //пытаюсь найти закрытие табы
                for (const mr of mutationList) {
                    if (mr.type === 'childList') {
                        for (const node of mr.removedNodes) {
                            if (node.getAttribute('role') === 'tab') {
                                window.tabs.remove(node.getAttribute('id'))
                            }
                        }

                        for (const node of mr.addedNodes) {
                            if (node.getAttribute('role') === 'tab') {
                                window.tabs.setCurrent(node)
                            }
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
            const logSource = {
                ENV_LOGS__EXT: {
                    'data-click':
                        '[["openUrlInWindow", ["#~pxRequestor.pxExternalLogURL~#", "Log Files", "height=700,width=1200,location=1,menubar=1,toolbar=1,status=1,resizable=1,location=1,scrollbars=1", "false",":event","true", "false"]]]',
                    name: 'pzStudioFooter_pyDisplayHarness_4',
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
                logFileAClick.dataset.click = logSourceSettings['data-click']
                logFileAClick.setAttribute('name', logSourceSettings['name'])
                logFileAClick.setAttribute('href', '#')
                logFileAClick.setAttribute('onclick', 'pd(event);')
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
                        console.log('click')
                        logFileAClick.click()
                    }, 200)
                }
            })

            logFileA.addEventListener('dblclick', () => {
                clearTimeout(timer)
                console.log('dblclick')
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
