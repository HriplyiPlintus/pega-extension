//trace context page viewer popup
let clipboardJSON = null

/* window size change sends messages and updates sync storage
trottling helps to reduce such chatting
let trottleSizeSetting = false
*/

//TODO: test
const testvalue = true
//if (testvalue) return

//TODO: impmlement. applies default settings
function applyDefaultSettings() {}

//retrieves extension settings and proceeds with the whole functionality initialization
const getExtensionSettings = () => {
    chrome.runtime.sendMessage({ message: 'getSettings' }, (response) => {
        console.log('settings', response)
        if (response?.payload) {
            const payload = response.payload

            const isTCPEnabled = payload['tcp-enabled'] ?? null

            if (isTCPEnabled) {
                handleResizeEvent()

                if (payload['tcp-windowSize']) {
                    const windowSize = JSON.parse(payload['tcp-windowSize'])

                    if (windowSize['width'] && windowSize['height']) {
                        self.resizeTo(windowSize['width'], windowSize['height'])
                    }
                }

                //responsible for what view will be displayed. default is OOTB view
                const selectedView = payload['tcp-viewMode'] ?? 'default'

                initTracerContextPegaView(selectedView)
            }
        }
    })
}

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
resizableBarHandler //initialize resizable bar
applyDefaultSettings //applies default settings */
function initTracerContextPegaView(initWithView) {
    if (document.readyState !== 'loading') {
        clipboardJSON = contextPageToJSON()
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            clipboardJSON = contextPageToJSON()
        })
    }

    renderMakrupFromJSON(clipboardJSON, [
        appendChangeViewButton,
        resizableBarHandler,
        () => {
            //shows proper view and button
            let changeViewBtn,
                bodyToHide,
                visibleBody = null

            console.log('default view', initWithView)

            if (initWithView === 'default') {
                changeViewBtn = document.querySelector('.pe__tcp-view-messy')

                bodyToHide = document.querySelector('.pe__tcp_body-tidy')

                visibleBody = document.querySelector('.pe__tcp_body-messy')
                //pe__tcp_change-view
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

//initTracerContextPegaView() //entry point

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

    //add custom class to control visibility later
    const originalBody = document.querySelector('body')
    originalBody.classList.add('pe__tcp_body-messy')

    //originalBody.classList.add('pe__display-none') //TODO: test

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
                                    tag: 'input',
                                    cls: 'pe__tcp_search_input',
                                    attrs: {
                                        placeholder:
                                            'Search within this context',
                                    },
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
                            tag: 'main',
                            content: [
                                { tag: 'div', cls: 'pe__tcp_body-tidy-header' },
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
                    ],
                },
            ],
        })
    )

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

    console.log('show page', pageToShow)

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
        //attempt to make clean page reference //TODO:fix
        let contentsTtitle = clearPageTitle
        /* document
            .querySelector('.pe__tcp_tree-node-clicked')
            ?.dataset.uri?.replace(
                /(?<=\b)root((?=\..*)|(\b))/,
                clipboardJSON['key']
            )
                */

        contentsTitleElement.innerText = `Clipboard page: ${contentsTtitle}`

        console.log(contentsTtitle)
    }
}

//TODO: test
function renderClipboardJSONMarkup(cObj, sURI) {
    function buildNodeJSONMarkup(clipboardObj, sumURI) {
        const markup = []

        for (const p of clipboardObj.value) {
            if (p.type === 'page' || p.type === 'list') {
                const thisURI = sumURI
                    ? sumURI + '.' + p.key
                    : 'root' /* clipboardJSON['key'] */ + '.' + p.key

                const nestedPages = buildNodeJSONMarkup(p, thisURI)

                let showExpandBtn = true

                if (
                    Array.isArray(p.value) &&
                    p.value.find((o) => o.type !== 'property') === undefined
                ) {
                    showExpandBtn = false
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
            }
        }

        //all contents wrapped in Context page
        return { tag: 'ul', content: markup }
    }

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

    console.log('final result', result)

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

    const main = document.querySelector('.pe__tcp_body-tidy main')

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
            main.style.width = '100%' // `calc(${window.outerWidth} - var(--aside-min-width))`
        } else if ((x / window.outerWidth) * 100 >= 90) {
            //the handle bar can't move to the left more than 90% of the screen width
            handle.style.left = '90%'
            aside.style.width = '90%'
            main.style.width = '10%'
        } else {
            handle.style.left = `${x}px`
            aside.style.width = `${x}px`
            main.style.width = `calc(100% - ${x}px - var(--bar-width))`
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

//resize event hadling
function handleResizeEvent() {
    window.addEventListener('resize', (e) => {
        const t = e.target
        console.log(`widht: ${t.innerWidth} height: ${t.outerHeight}`)

        //set extension settings
        setExtSettings(
            'tcp-windowSize',
            JSON.stringify({
                width: t.innerWidth,
                height: t.outerHeight,
            })
        )
    })
}
