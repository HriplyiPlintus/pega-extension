//trace context page viewer popup
let clipboardJSON = null
const clipboardFlatArr = []

/*local copy of settings. the idea here is to minimize updates 
while keeping continuously requesting dimensions */
let windowSizeSetting = {}

//retrieves extension settings and proceeds with the whole functionality initialization
const getExtensionSettings = () => {
    chrome.runtime.sendMessage({ message: 'getSettings' }, (response) => {
        console.log('settings', response)
        if (response?.payload) {
            const payload = response.payload

            const isTCPEnabled = payload['tcp-enabled'] ?? null

            if (isTCPEnabled) {
                if (payload['tcp-windowSize']) {
                    const windowSize = JSON.parse(payload['tcp-windowSize'])

                    //update local copy with values from settings
                    windowSizeSetting = {
                        width: windowSize['width'],
                        height: windowSize['height'],
                    }

                    console.log('window_size settings', {
                        settings: windowSize,
                        current: {
                            width: self.innerWidth,
                            height: self.outerHeight,
                        },
                    })

                    if (windowSize['width'] && windowSize['height']) {
                        self.resizeTo(windowSize['width'], windowSize['height'])
                    }
                }

                handleResizeEvent()

                //responsible for what view will be displayed. default is OOTB view
                const selectedView = payload['tcp-viewMode'] ?? 'default'

                initTracerContextPegaView(selectedView)
            }
        }
    })
}

//entry point
getExtensionSettings()

/* adds a button to change view mode between tidy and messy
selects a page to show context by default */
const appendChangeViewButton = () => {
    const btnWrapper = document.createElement('div')
    btnWrapper.classList.add('pe__tcp_change-view')

    const createImgElement = (imgURL, imgClass, imgTitle) => {
        const img = document.createElement('img')
        img.setAttribute('src', chrome.runtime.getURL(imgURL))
        img.setAttribute('title', imgTitle ?? '')
        img.classList.add(imgClass)

        return img
    }

    btnWrapper.appendChild(
        createImgElement(
            './assets/img/messy.png',
            'pe__tcp-view-messy',
            'Messy view'
        )
    )

    const tidyViewImg = createImgElement(
        './assets/img/tidy.png',
        'pe__tcp-view-tidy',
        'Tidy and shiny view'
    )

    btnWrapper.appendChild(tidyViewImg)

    //append change view button to the visible body
    document
        .querySelector('body:not(.pe__display-none)')
        ?.appendChild(btnWrapper)

    const tidyViewBody = document.querySelector('body.pe__tcp_body-tidy')

    //switch view
    btnWrapper.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()

        const messyViewBody = document.querySelector('body.pe__tcp_body-messy')

        const switchVisibility = (el, hideBool) => {
            if (hideBool) {
                el?.classList.add('pe__display-none')
            } else {
                el?.classList.remove('pe__display-none')
            }
        }

        let viewMode = '' //default or tidy. this value will be saved in settings

        if (e.target.classList?.contains('pe__tcp-view-messy')) {
            switchVisibility(e.target, true)

            switchVisibility(
                e.target.parentElement.querySelector('.pe__tcp-view-tidy'),
                false
            )

            //make visible tidy view body
            switchVisibility(tidyViewBody, true)
            switchVisibility(messyViewBody, false)

            messyViewBody.appendChild(btnWrapper)

            viewMode = 'default'
        } else {
            switchVisibility(e.target, true)
            switchVisibility(
                e.target.parentElement.querySelector('.pe__tcp-view-messy'),
                false
            )

            switchVisibility(messyViewBody, true)
            switchVisibility(tidyViewBody, false)

            tidyViewBody.appendChild(btnWrapper)

            viewMode = 'tidy'
        }

        //save viewMode to extension settings
        setExtSettings('tcp-viewMode', viewMode)
    })

    //select root page if nothing selected
    if (
        tidyViewBody.querySelectorAll('.pe__tcp_tree-node-clicked').length === 0
    ) {
        tidyViewBody
            .querySelector('.pe__tcp_tree-node-wrapper[data-uri="root"')
            ?.click()
    }
}

/* this functions initializes context page view and 
calls initializer functions in proper order
initWithView - the view to display on load
renderMakrupFromJSON //renders markup
appendChangeViewButton //add change view button
resizableBarHandler //initialize resizable bar */
function initTracerContextPegaView(initWithView) {
    if (document.readyState !== 'loading') {
        clipboardJSON = contextPageToJSON()
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            clipboardJSON = contextPageToJSON()
        })
    }

    console.log('final result', clipboardJSON)

    renderMakrupFromJSON(clipboardJSON, [
        appendChangeViewButton,
        resizableBarHandler,
        () => {
            //shows proper view and button
            let changeViewBtn,
                bodyToHide,
                visibleBody = null

            if (initWithView === 'default') {
                changeViewBtn = document.querySelector('.pe__tcp-view-messy')

                bodyToHide = document.querySelector('.pe__tcp_body-tidy')

                visibleBody = document.querySelector('.pe__tcp_body-messy')
            } else {
                changeViewBtn = document.querySelector('.pe__tcp-view-tidy')

                bodyToHide = document.querySelector('.pe__tcp_body-messy')

                visibleBody = document.querySelector('.pe__tcp_body-tidy')
            }

            changeViewBtn.classList.add('pe__display-none')
            bodyToHide.classList.add('pe__display-none')
            visibleBody.appendChild(
                changeViewBtn.closest('div.pe__tcp_change-view')
            )
        },
    ])
}

/* prepares markup similar to clipboard viewer
thenFuArr param makes possible to call next function in synchronous manner */
function renderMakrupFromJSON(contextPageJSON, thenFuArr) {
    //if context page was not parsed
    if (!contextPageJSON) {
        console.warn('Pega Extension: could not parse context page')
        setTimeout(() => {
            renderMakrupFromJSON(clipboardJSON, thenFuArr)
        }, 20)
        return
    }

    const clipboardJSONMarkup = renderClipboardJSONMarkup(contextPageJSON)

    console.log('flat representation', clipboardFlatArr)

    //add custom class to control visibility later
    const originalBody = document.querySelector('body')
    originalBody.classList.add('pe__tcp_body-messy')

    const tidyViewBody = originalBody.parentElement.appendChild(
        templateEngine({
            tag: 'body',
            cls: 'pe__tcp_body-tidy',
            content: [
                {
                    tag: 'header',
                    content: [
                        {
                            tag: 'div',
                            content: [
                                {
                                    tag: 'div',
                                    content: `Properties on Page TraceEvent [${contextPageJSON['key']}]`,
                                    cls: 'pe__tcp_header-title',
                                },
                            ],
                            cls: ['pe__tcp_header'],
                        },
                    ],
                },
                {
                    tag: 'div',
                    cls: 'pe__tcp_body',
                    content: [
                        {
                            tag: 'aside',
                            content: [
                                {
                                    tag: 'span',
                                    cls: 'pe__tcp_search_input',
                                    content: [
                                        {
                                            tag: 'input',
                                            attrs: {
                                                placeholder:
                                                    'Search within this context',
                                            },
                                        },
                                        {
                                            tag: 'div',
                                            cls: 'pe__tcp_search_input-fake',
                                        },
                                        {
                                            tag: 'span',
                                            cls: 'pe__tcp_search_input_options',
                                            content: [
                                                {
                                                    tag: 'span',
                                                    content: 'Aa',
                                                    cls: 'pe__tcp_search_input_case',
                                                    attrs: {
                                                        title: 'Case sensitive search',
                                                    },
                                                },
                                                {
                                                    tag: 'span',
                                                    content: [
                                                        {
                                                            tag: 'span',
                                                            content: '.*',
                                                        },
                                                    ],
                                                    cls: 'pe__tcp_search_input_isregex',
                                                    attrs: {
                                                        title: 'Use regular expression',
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    tag: 'div',
                                    cls: 'pe__tcp_resizable-handle',
                                },
                                {
                                    tag: 'div',
                                    content: clipboardJSONMarkup,
                                    cls: 'pe__tcp_tree',
                                }, //draw hierarchical table here in format of <ul><li></li></ul>
                            ],
                        },
                        {
                            tag: 'div',
                            cls: 'pe__tcp_main_wrapper',
                            content: [
                                {
                                    tag: 'main',
                                    content: [
                                        {
                                            tag: 'div',
                                            cls: 'pe__tcp_body-tidy-header',
                                        },
                                        {
                                            tag: 'table',
                                            cls: 'pe__tcp_body-tidy-table',
                                            content: [
                                                {
                                                    tag: 'thead',
                                                    content: [
                                                        {
                                                            tag: 'tr',
                                                            content: [
                                                                {
                                                                    tag: 'th',
                                                                    cls: 'pe__tcp-body-tidy-table-column-key',
                                                                    content: {
                                                                        tag: 'div',
                                                                        content:
                                                                            'Property',
                                                                    },
                                                                },
                                                                {
                                                                    tag: 'th',
                                                                    cls: 'pe__tcp-body-tidy-table-column-value',
                                                                    content: {
                                                                        tag: 'div',
                                                                        content:
                                                                            'Value',
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    ],
                                                },
                                                { tag: 'tbody' },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    /* this is a stub elements that pushes results table up
                                and allows to minimized search thing to appera correctly */
                                    tag: 'div',
                                    cls: [
                                        'pe__tcp_search_results_stub',
                                        'pe__tcp_hidden',
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    tag: 'div',
                    cls: ['pe__tcp_search_results_wrapper', 'pe__tcp_hidden'],
                    content: [
                        {
                            tag: 'div',
                            cls: 'pe__tcp_search_results_content',
                            content: [
                                {
                                    tag: 'div',
                                    cls: 'pe__tcp_search_results_header',
                                    content: [
                                        {
                                            tag: 'span',
                                            content: 'Search Results',
                                            cls: 'pe__tcp_popover_title',
                                        },
                                        {
                                            tag: 'img',
                                            cls: 'pe__tcp_popover_close',
                                            attrs: {
                                                src: chrome.runtime.getURL(
                                                    './assets/img/close.png'
                                                ),
                                            },
                                        },
                                    ],
                                },
                                {
                                    tag: 'div',
                                    cls: 'pe__tcp_search_results_body_title',
                                    content: [
                                        { tag: 'span', content: 'Property ' },
                                        {
                                            tag: 'span',
                                            content: 'value',
                                            cls: 'pe__tcp_search_results_body_title_option',
                                            attrs: {
                                                'data-option': 'value',
                                                'data-selected': true,
                                            },
                                        },
                                        {
                                            tag: 'span',
                                            content: ' or ',
                                        },
                                        {
                                            tag: 'span',
                                            content: 'name',
                                            cls: 'pe__tcp_search_results_body_title_option',
                                            attrs: {
                                                'data-option': 'key',
                                                'data-selected': true,
                                            },
                                        },
                                        { tag: 'span', content: " contains '" },
                                        {
                                            tag: 'span',
                                            content: '',
                                            cls: 'pe__tcp_search_results_body_title_phrase',
                                        },
                                        {
                                            tag: 'span',
                                            content: "'",
                                        },
                                    ],
                                },
                                {
                                    tag: 'div',
                                    cls: 'pe__tcp_search_results_body',
                                    content: {
                                        tag: 'table',
                                        cls: 'pe__tcp_body-tidy-table',
                                        content: [
                                            {
                                                tag: 'thead',
                                                content: {
                                                    tag: 'tr',
                                                    content: [
                                                        {
                                                            tag: 'th',
                                                            cls: 'pe__tcp-body-tidy-table-column-key',
                                                            content: {
                                                                tag: 'div',
                                                                content:
                                                                    'Property',
                                                            },
                                                        },
                                                        {
                                                            tag: 'th',
                                                            cls: 'pe__tcp-body-tidy-table-column-key',
                                                            content: {
                                                                tag: 'div',
                                                                content:
                                                                    'Property Reference',
                                                            },
                                                        },
                                                        {
                                                            tag: 'th',
                                                            cls: 'pe__tcp-body-tidy-table-column-value',
                                                            content: {
                                                                tag: 'div',
                                                                content:
                                                                    'Value',
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                            { tag: 'tbody' },
                                        ],
                                    },
                                },
                            ],
                        },
                        {
                            tag: 'div',
                            cls: 'pe__tcp_search_results_minimized',
                            content: [
                                {
                                    tag: 'span',
                                },
                                {
                                    tag: 'img',
                                    cls: 'pe__tcp_popover_close',
                                    attrs: {
                                        src: chrome.runtime.getURL(
                                            './assets/img/close.png'
                                        ),
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        })
    )

    //handles search results filtering options
    document
        .querySelector('.pe__tcp_search_results_body_title')
        .addEventListener('click', (e) => {
            const target = e.target

            if (!target.matches('.pe__tcp_search_results_body_title_option'))
                return

            e.stopPropagation()
            e.preventDefault()

            const otherOption = target.parentElement.querySelector(
                `.pe__tcp_search_results_body_title_option[data-option]:not([data-option='${target.dataset.option}'`
            )

            /* both filtering option could not be unselected */
            if (
                target.dataset.selected === 'true' &&
                otherOption.dataset.selected === 'false'
            ) {
                otherOption.dataset.selected = 'true'
                target.dataset.selected = 'true'

                target
                    .closest('.pe__tcp_search_results_content')
                    .querySelector('table')
                    .classList.remove(
                        `pe__tcp_search_results_${target.dataset.option}match_hidden`
                    )

                target
                    .closest('.pe__tcp_search_results_content')
                    .querySelector('table')
                    .classList.remove(
                        `pe__tcp_search_results_${otherOption.dataset.option}match_hidden`
                    )
            } else if (target.dataset.selected === 'true') {
                target.dataset.selected = 'false'

                //hide results that match by deselected option
                target
                    .closest('.pe__tcp_search_results_content')
                    .querySelector('table')
                    .classList.add(
                        `pe__tcp_search_results_${target.dataset.option}match_hidden`
                    )
            } else {
                target.dataset.selected = 'true'

                target
                    .closest('.pe__tcp_search_results_content')
                    .querySelector('table')
                    .classList.remove(
                        `pe__tcp_search_results_${target.dataset.option}match_hidden`
                    )
            }

            //if(target.dataset.option === 'value')
        })

    //handles click on greyed area around poover - minimizes search results popover
    tidyViewBody
        .querySelector('.pe__tcp_search_results_wrapper')
        .addEventListener('click', (e) => {
            if (!e.target.matches('.pe__tcp_search_results_wrapper')) return

            e.stopPropagation()
            e.preventDefault()

            e.target.classList.add('pe__tcp_search_popover_minimize')

            document.querySelector('.pe__tcp_search_input > input').value = ''

            const searchPhrase = document.querySelector(
                '.pe__tcp_search_results_body_title_phrase'
            ).dataset.searchPhrase

            document.querySelector(
                '.pe__tcp_search_results_minimized span'
            ).innerText = `Search for '${searchPhrase}'`

            document
                .querySelector('.pe__tcp_search_results_stub')
                .classList.remove('pe__tcp_hidden')
        })

    //handles minimized search results popver click
    tidyViewBody
        .querySelector('.pe__tcp_search_results_minimized')
        .addEventListener('click', (e) => {
            tidyViewBody
                .querySelector('.pe__tcp_search_results_wrapper')
                .classList.remove('pe__tcp_search_popover_minimize')

            document
                .querySelector('.pe__tcp_search_results_stub')
                .classList.add('pe__tcp_hidden')
        })
    //search options
    const searchOptions = { caseSensitive: false, regex: false }

    //search results popover close button click handler
    tidyViewBody
        .querySelector('.pe__tcp_search_results_wrapper')
        .addEventListener('click', (e) => {
            if (!e.target.matches('.pe__tcp_popover_close')) return

            //return filter options selection to default state
            const filterOptions = document.querySelectorAll(
                '.pe__tcp_search_results_body_title .pe__tcp_search_results_body_title_option'
            )
            for (const o of filterOptions) {
                o.dataset.selected = true
            }

            const searchResultsTable = document.querySelector(
                '.pe__tcp_search_results_wrapper table.pe__tcp_body-tidy-table'
            )
            searchResultsTable.classList.remove(
                'pe__tcp_search_results_valuematch_hidden'
            )
            searchResultsTable.classList.remove(
                'pe__tcp_search_results_keymatch_hidden'
            )

            console.log(searchResultsTable)

            e.target
                .closest('.pe__tcp_search_results_wrapper')
                .classList.add('pe__tcp_hidden')

            document.querySelector('.pe__tcp_search_input input').value = ''
        })

    //search options click handler
    tidyViewBody
        .querySelector('.pe__tcp_search_input_options')
        .addEventListener('click', (e) => {
            let target = e.target

            if (
                target.matches('span:not([class])') &&
                target.parentElement.matches('.pe__tcp_search_input_isregex')
            ) {
                target = target.parentElement
            }

            console.log('clicked option', target)
            //select or deselect searching option
            if (
                target.matches('.pe__tcp_search_input_case') ||
                target.matches('.pe__tcp_search_input_isregex')
            ) {
                if (
                    target.classList.contains(
                        'pe__tcp_search_input_option-selected'
                    )
                ) {
                    target.classList.remove(
                        'pe__tcp_search_input_option-selected'
                    )

                    if (target.matches('.pe__tcp_search_input_case')) {
                        searchOptions['caseSensitive'] = false
                    } else {
                        searchOptions['regex'] = false
                    }
                } else {
                    target.classList.add('pe__tcp_search_input_option-selected')

                    if (target.matches('.pe__tcp_search_input_case')) {
                        searchOptions['caseSensitive'] = true
                    } else {
                        searchOptions['regex'] = true
                    }
                }
            }
        })

    //search functionality
    tidyViewBody
        .querySelector('.pe__tcp_search_input input')
        .addEventListener('keypress', (e) => {
            if (!(e.key === 'Enter' && e.target.value.trim())) return

            e.target.blur() //unfocus

            const target = e.target

            let searchPhrase = target.value

            /* hide minimized search results
            here selector designed to handle only situations when search results are minimized 
            this should be placed after getting search phrase */
            tidyViewBody
                .querySelector(
                    '.pe__tcp_search_popover_minimize .pe__tcp_search_results_minimized .pe__tcp_popover_close'
                )
                ?.click()

            //target.value = searchPhrase

            //checkes if search should be case insensitive and not regex
            const isCaseInsensititveNotRegex =
                !searchOptions.caseSensitive && searchOptions.regex !== true

            if (isCaseInsensititveNotRegex) {
                searchPhrase = searchPhrase.toLowerCase()
            }

            //just in case create regex for every search
            let regex = null
            if (!searchOptions.caseSensitive) {
                regex = new RegExp(searchPhrase, 'i')
            } else {
                regex = new RegExp(searchPhrase)
            }

            let searchResult = []

            for (const cv of clipboardFlatArr) {
                let currVal = cv.value
                let currKey = cv.key

                /* if case sensitive selected and not regex, 
                    convert both strings to lower case
                    such convertation breaks regex and not compatible with it */
                if (isCaseInsensititveNotRegex) {
                    currVal = currVal.toLowerCase()
                    currKey = currKey.toLowerCase()
                }

                //key is true if its matches, value is true is its matches
                let result = { isKeyMatch: false, isValueMatch: false }

                //prepare regex. if search is not case sensitive, add flag
                if (searchOptions.regex === true) {
                    result = {
                        isKeyMatch: regex.test(currKey),
                        isValueMatch: regex.test(currVal),
                    }
                } else {
                    result = {
                        isKeyMatch: currKey.includes(searchPhrase),
                        isValueMatch: currVal.includes(searchPhrase),
                    }
                }

                if (
                    result.isKeyMatch === true ||
                    result.isValueMatch === true
                ) {
                    cv.isKeyMatch = result.isKeyMatch
                    cv.isValueMatch = result.isValueMatch

                    searchResult.push(cv)
                }
            }

            const searchResultsBodyTitleSearchPhrase = document.querySelector(
                '.pe__tcp_search_results_body_title_phrase'
            )

            searchResultsBodyTitleSearchPhrase.innerText = searchPhrase
            searchResultsBodyTitleSearchPhrase.dataset.searchPhrase =
                searchPhrase

            const searchResultsBody = document.querySelector(
                '.pe__tcp_search_results_body tbody'
            )

            const resultsMarkup = displaySearchResults(searchResult) //display search results

            searchResultsBody.innerHTML = ''
            searchResultsBody.appendChild(resultsMarkup)
        })

    //click event handler. responsible for tree nodes behavior
    tidyViewBody
        .querySelector('aside .pe__tcp_tree')
        ?.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()

            const target = e.target
            if (
                target.matches(
                    '.pe__tcp_tree-node-btn-expand, .pe__tcp_tree-node-btn-collapse'
                )
            ) {
                /* this part is responsible for expand/collapse buttons
                click only expands underlaying pages without showing properties */
                if (target.classList.contains('pe__tcp_tree-node-btn-expand')) {
                    target.classList.remove('pe__tcp_tree-node-btn-expand')
                    target.classList.add('pe__tcp_tree-node-btn-collapse')

                    target
                        .closest('li')
                        .querySelector('ul')
                        ?.classList.remove('pe__tcp_hidden')
                } else {
                    target.classList.add('pe__tcp_tree-node-btn-expand')
                    target.classList.remove('pe__tcp_tree-node-btn-collapse')

                    target
                        .closest('li')
                        .querySelector('ul')
                        ?.classList.add('pe__tcp_hidden')
                }
            } else if (
                target.matches('.pe__tcp_tree-node-wrapper') ||
                target.parentElement.matches('.pe__tcp_tree-node-wrapper')
            ) {
                //responsible for showing page contents
                const nodeElement = target.closest('.pe__tcp_tree-node-wrapper')

                if (!nodeElement) return

                const selectedNodes = tidyViewBody.querySelectorAll(
                    'aside .pe__tcp_tree .pe__tcp_tree-node-clicked'
                )

                selectedNodes?.forEach((sn) =>
                    sn.classList.remove('pe__tcp_tree-node-clicked')
                )

                nodeElement.classList.add('pe__tcp_tree-node-clicked')

                //show selected page's properties
                displayPageProperties(nodeElement.dataset?.uri)
            }
        })

    //call callback functions in specified order
    if (Array.isArray(thenFuArr)) {
        for (const fuToCall of thenFuArr) {
            if (typeof fuToCall === 'function') {
                fuToCall()
            }
        }
    }
}

//displays selected page properties
function displayPageProperties(pageName) {
    if (!pageName) return

    const pathToArr = pageName.split('.')

    //this is for clear page path (without redundant parts)
    let clearPageTitle = ''
    let prevPageName = ''

    let pageToShow = [clipboardJSON]

    for (const pn of pathToArr) {
        //context aka root is a special page, it's name could contain dots - separators
        if (pn === 'root') {
            pageToShow = pageToShow[0].value

            clearPageTitle = clipboardJSON['key']
            prevPageName = clipboardJSON['key']
        } else {
            const index = pageToShow.findIndex((e) => e.key === pn)

            if (index !== -1) {
                const thisPageName = pageToShow[index]?.key

                pageToShow = pageToShow[index].value

                if (thisPageName?.replace(/\(.*\)$/, '') === prevPageName) {
                    clearPageTitle =
                        clearPageTitle.substring(
                            0,
                            clearPageTitle.lastIndexOf('.')
                        ) + `.${thisPageName}`
                } else {
                    clearPageTitle = clearPageTitle + `.${thisPageName}`
                    prevPageName = thisPageName
                }
            }
        }
    }

    const propsObjArr = []

    for (const p of pageToShow) {
        if (p.type === 'property') {
            propsObjArr.push({
                tag: 'tr',
                content: [
                    {
                        tag: 'td',
                        content: {
                            tag: 'div',
                            content: p.key,
                        },
                    },
                    {
                        tag: 'td',
                        content: {
                            tag: 'div',
                            content: p.value,
                        },
                    },
                ],
            })
        }
    }

    const contentsTable = document.querySelector('.pe__tcp_body-tidy-table')

    const oldTbody = contentsTable.querySelector('tbody')

    if (pageToShow.find((pts) => pts.type === 'property') === undefined) {
        //hide left panel contents if page doesn't have any property
        contentsTable.classList.add('pe__tcp_hidden')
    } else {
        const newTbody = templateEngine({
            tag: 'tbody',
            content: propsObjArr,
        })

        contentsTable.replaceChild(newTbody, oldTbody)
        contentsTable.classList.remove('pe__tcp_hidden')
    }

    //update contents title
    const contentsTitleElement = document.querySelector(
        'div.pe__tcp_body-tidy-header'
    )

    if (contentsTitleElement) {
        //attempt to make clean page reference
        contentsTitleElement.innerText = `Clipboard page: ${clearPageTitle}`
    }
}

/* builds markup for clipboard tree */
function renderClipboardJSONMarkup(cObj, sURI) {
    //prettifies property path
    function prettifyPropertyPath(rawUri) {
        const rawPathArr = rawUri.includes('.') ? rawUri.split('.') : [rawUri]

        let result = '',
            lastKey = ''

        for (const p of rawPathArr) {
            if (p.replace(/\(.*\)$/, '') !== lastKey) {
                result += result ? '.' + p : p
            } else {
                result = result.substring(0, result.lastIndexOf('.')) + '.' + p
            }
            lastKey = p
        }

        result = /^root/.test(result)
            ? result.replace(/^root/, clipboardJSON.key)
            : result

        return result
    }

    function pushObjectToFlatArr({ uri, key, value }) {
        /* clipboardFlatArr.push({
        uri: uri,
        value: v.value,
        key: v.key,
        prettyUri: prettifyPropertyPath(uri),
    }) */
        clipboardFlatArr.push({
            uri: uri,
            key: key,
            value: value,
            prettyUri: prettifyPropertyPath(uri),
        })
    }

    function buildNodeJSONMarkup(clipboardObj, sumURI) {
        const markup = []

        for (const p of clipboardObj.value) {
            if (p.type === 'page' || p.type === 'list') {
                const thisURI = sumURI
                    ? sumURI + '.' + p.key
                    : 'root' + '.' + p.key

                const nestedPages = buildNodeJSONMarkup(p, thisURI)

                let showExpandBtn = true

                if (
                    Array.isArray(p.value) &&
                    p.value.find((o) => o.type !== 'property') === undefined
                ) {
                    showExpandBtn = false
                }

                //fill in clipboard flat representation
                for (const v of p.value) {
                    if (v.type === 'property') {
                        const uri = thisURI ?? 'root'

                        pushObjectToFlatArr({
                            uri: uri,
                            key: v.key,
                            value: v.value,
                        })
                        /*
                        clipboardFlatArr.push({
                            uri: uri,
                            value: v.value,
                            key: v.key,
                            prettyUri: prettifyPropertyPath(uri),
                        }) */
                    }
                }

                const pagePathLabel = p.class
                    ? `${p.key} (${p.class})`
                    : `${p.key}`

                const liContents = [
                    {
                        tag: 'div',
                        cls: showExpandBtn
                            ? 'pe__tcp_tree-node-btn-expand'
                            : 'pe__tcp_tree-node-btn-stub',
                    },
                    {
                        tag: 'div',
                        cls:
                            p.type === 'list'
                                ? 'pe__tcp_tree-list'
                                : 'pe__tcp_tree-page',
                    },
                    {
                        tag: 'span',
                        content: pagePathLabel,
                        attrs: {
                            title: pagePathLabel,
                        },
                    },
                ]

                markup.push({
                    tag: 'li',
                    content: [
                        {
                            tag: 'div',
                            cls: 'pe__tcp_tree-node-wrapper',
                            content: liContents,
                            attrs: {
                                'data-uri': `${thisURI}`,
                            },
                        },
                    ],
                })

                if (nestedPages.content?.length !== 0) {
                    nestedPages.cls = 'pe__tcp_hidden'
                    markup[markup.length - 1].content.push(nestedPages)
                }
            } else {
                if (p.type === 'property') {
                    const uri = sumURI ?? 'root'
                    //fill in clipboard flat representation

                    pushObjectToFlatArr({
                        uri: uri,
                        key: p.key,
                        value: p.value,
                    })
                    /*
                    clipboardFlatArr.push({
                        uri: uri,
                        value: p.value,
                        key: p.key,
                        prettyUri: prettifyPropertyPath(uri),
                    })*/
                }
            }
        }

        //all contents wrapped in Context page
        return { tag: 'ul', content: markup }
    }

    console.log('root', clipboardJSON.key)

    return {
        tag: 'ul',
        content: [
            {
                tag: 'li',
                content: [
                    {
                        tag: 'div',
                        cls: 'pe__tcp_tree-node-wrapper',
                        attrs: { 'data-uri': 'root' },
                        content: [
                            {
                                tag: 'div',
                                cls: 'pe__tcp_tree-node-btn-collapse',
                            },
                            {
                                tag: 'div',
                                cls: 'pe__tcp_tree-page',
                            },
                            {
                                tag: 'span',
                                content: clipboardJSON.key,
                                attrs: { title: clipboardJSON.key },
                            },
                        ],
                    },
                    buildNodeJSONMarkup(cObj, sURI),
                ],
            },
        ],
    }
}

//TODO: create flat representation of clipboard. this will allow to search for keys or/and values

//template engine
function templateEngine(block) {
    if (block === undefined || block === null || block === false) {
        return document.createTextNode('')
    }
    if (
        typeof block === 'string' ||
        typeof block === 'number' ||
        block === true
    ) {
        return document.createTextNode(block)
    }
    if (Array.isArray(block)) {
        const fragment = document.createDocumentFragment()

        block.forEach((element) => {
            fragment.appendChild(this.templateEngine(element))
        })

        return fragment
    }

    //experiment
    if (block.tag === 'component') {
        return this.buildComponent(block.name, block.params)
    }

    const result = document.createElement(block.tag)

    if (block.cls) {
        const classes = [].concat(block.cls)
        classes.forEach((cls) => {
            result.classList.add(cls)
        })
    }

    if (block.attrs) {
        const keys = Object.keys(block.attrs)

        keys.forEach((key) => {
            result.setAttribute(key, block.attrs[key])
        })
    }

    result.appendChild(this.templateEngine(block.content))

    return result
}

/* creates nested JSON from clipboard page
result structure: {
    key: "",
    properties: {[]}
} */
function contextPageToJSON() {
    const table = document.querySelector('table tr div.dialogDataContainer')

    if (!table) return

    /* returns [{key, value, type, class}] for each row in context page viewer
    where 'key' is a name of a property and 'value' is this property value.
    class is the page class, type is either page or property - for the ease of rendring
    each new page starts from header - tableHeader */
    function collectPageAttributes(tableElement) {
        const tableHeader = tableElement
            .querySelector('.eventElementTitleBarStyle')
            ?.closest('tr')

        let result = []
        let attr = tableHeader

        do {
            //get sibling of the table header element
            attr = attr.nextElementSibling

            if (!attr) break

            const nestedTable = attr.querySelector('table')
            let key = null,
                value = null,
                listName = '',
                pageClass = null

            key = attr.querySelector('td.eventElementDataBold')?.innerText

            //check if page/property name is a list/group
            if (key.match(/^.*\(.*\)/)) {
                listName = key.replace(/\(.*\)/, '').trim() //memorize page list/group name
            }

            if (!nestedTable) {
                //without child elements
                //remove only &nbsp; at start and end
                value = attr
                    .querySelector('td.eventElementData')
                    ?.innerText.replace(/^\s/, '')
                    .replace(/\s$/, '')
            } else {
                //with child elements (nested table)
                value = collectPageAttributes(nestedTable) //get values

                //get page class name
                const classNameObj = value.find((e) => e.key === 'pxObjClass')
                if (classNameObj) {
                    pageClass = classNameObj.value
                }
            }

            if (key && value !== null) {
                let pushToResults = result //new context

                if (listName) {
                    //list structure was not created before
                    if (
                        result.length === 0 ||
                        (result.length > 0 &&
                            result[result.length - 1].key !== listName)
                    ) {
                        result.push({
                            key: listName,
                            value: [],
                            type: 'list',
                        })
                    }

                    pushToResults = result[result.length - 1].value //change results context
                }

                pushToResults.push({
                    key: key.toString().trim(),
                    value: value,
                    type: Array.isArray(value) ? 'page' : 'property',
                })

                //add page class if found
                if (pageClass) {
                    pushToResults[pushToResults.length - 1].class = pageClass
                }
            }
        } while (attr)

        return result
    }

    const result = {
        key: document
            .querySelector('#topBanner .dialogHeaderLabel')
            ?.innerText.match(/(?<=\[).*(?=\])/)[0],
        value: collectPageAttributes(table),
    }

    return result
}

//handles resizable bar click and move
function resizableBarHandler() {
    //let offsetX = 0 //required for resize bar move
    let isClicked = false

    /* it would be much straightforward to get these data from the markup but 
    the markup not always exist at required time */
    const aside = document.querySelector('aside')
    const asideMinWidth = window
        .getComputedStyle(aside)
        ?.getPropertyValue('min-width')
        ?.replace(/[^0-9]./, '')

    const mainWrapper = document.querySelector(
        '.pe__tcp_body-tidy .pe__tcp_main_wrapper'
    )

    const handle = document.querySelector('.pe__tcp_resizable-handle')

    handle.addEventListener('mousedown', (e) => {
        isClicked = true

        e.preventDefault()
        e.stopPropagation()
    })

    document.addEventListener('mouseup', () => {
        isClicked = false
    })

    document.addEventListener('mousemove', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (!isClicked) return

        const x = e.clientX

        if (x <= asideMinWidth) {
            //the handle bar can't move to the right less than minimum width of the aside element
            handle.style.left = 'var(--aside-min-width)'
            aside.style.width = 'var(--aside-min-width)'
            mainWrapper.style.width = '100%' // `calc(${window.outerWidth} - var(--aside-min-width))`
        } else if ((x / window.outerWidth) * 100 >= 90) {
            //the handle bar can't move to the left more than 90% of the screen width
            handle.style.left = '90%'
            aside.style.width = '90%'
            mainWrapper.style.width = '10%'
        } else {
            handle.style.left = `${x}px`
            aside.style.width = `${x}px`
            mainWrapper.style.width = `calc(100% - ${x}px - var(--bar-width))`
        }
    })
}

function setExtSettings(key, value) {
    if (!key) {
        console.log('key cannot be empty')
        return
    }

    //save viewMode to extension settings
    chrome.runtime.sendMessage({
        type: 'settingsSet',
        sender: 'pega-extension',
        payload: {
            key: key,
            value: value,
        },
    })
}

//resize event hadling. mutation observer and resize events did not work
function handleResizeEvent() {
    setInterval(() => {
        let currentSizes = { width: self.outerWidth, height: self.outerHeight }

        if (
            currentSizes.width !== windowSizeSetting['width'] ||
            currentSizes.height !== windowSizeSetting['height']
        ) {
            windowSizeSetting = currentSizes

            setExtSettings('tcp-windowSize', JSON.stringify(currentSizes))

            console.log('window_size sent message', windowSizeSetting)
        }
    }, 500)
}

/* responsible for displaying search results
searchResults is an arr */
function displaySearchResults(searchResults) {
    console.log('search results', searchResults)

    document
        .querySelector('.pe__tcp_search_results_wrapper')
        .classList.remove('pe__tcp_hidden')

    if (!(Array.isArray(searchResults) && searchResults.length > 0)) {
        //show stub
    } else {
        let resultsRows = []

        for (const sr of searchResults) {
            resultsRows.push({
                tag: 'tr',
                attrs: {
                    'data-key-matches': sr.isKeyMatch,
                    'data-value-matches': sr.isValueMatch,
                },
                content: [
                    {
                        tag: 'td',
                        content: { tag: 'div', content: sr.key },
                        attrs: { 'data-key-matches': sr.isKeyMatch },
                    },
                    {
                        tag: 'td',
                        content: { tag: 'div', content: sr.prettyUri },
                        attrs: { 'data-uri': sr.uri },
                    },
                    {
                        tag: 'td',
                        content: { tag: 'div', content: sr.value },
                        attrs: { 'data-value-matches': sr.isValueMatch },
                    },
                ],
            })
        }

        return templateEngine(resultsRows)
    }
}
