//trace context page viewer popup
let clipboardJSON = null

//TODO: test
const testvalue = true
//if (testvalue) return

if (document.readyState !== 'loading') {
    clipboardJSON = contextPageToJSON()
} else {
    document.addEventListener('DOMContentLoaded', () => {
        clipboardJSON = contextPageToJSON()
    })
}

//TODO: impmlement. applies default settings
function applyDefaultSettings() {}

renderMakrupFromJSON(clipboardJSON)

//TODO: test
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

    //TODO: this decision should be made from config
    tidyViewImg.classList.add('pe__display-none')

    btnWrapper.appendChild(tidyViewImg)

    //append change view button to the visible body
    document
        .querySelector('body:not(.pe__display-none)')
        ?.appendChild(btnWrapper)

    //switch view
    btnWrapper.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()

        const tidyViewBody = document.querySelector('body.pe__tcp_body-tidy')
        const messyViewBody = document.querySelector('body.pe__tcp_body-messy')

        const switchVisibility = (el, hideBool) => {
            if (hideBool) {
                el?.classList.add('pe__display-none')
            } else {
                el?.classList.remove('pe__display-none')
            }
        }

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
        } else {
            switchVisibility(e.target, true)
            switchVisibility(
                e.target.parentElement.querySelector('.pe__tcp-view-messy'),
                false
            )

            switchVisibility(messyViewBody, true)
            switchVisibility(tidyViewBody, false)

            tidyViewBody.appendChild(btnWrapper)
        }
    })
}

appendChangeViewButton()

//resize event hadling
window.addEventListener('resize', (e) => {
    const t = e.target
    console.log(`widht: ${t.innerWidth} height: ${t.innerHeight}`)
})

//prepares markup similar to clipboard viewer
function renderMakrupFromJSON(contextPageJSON) {
    //if context page was not parsed
    if (!contextPageJSON) {
        console.warn('Pega Extension: could not parse context page')
        setTimeout(() => {
            renderMakrupFromJSON(clipboardJSON)
        }, 100)
        return
    }
    window._clipboardJSON = contextPageJSON //TODO: remove. it's for tests only

    const clipboardJSONMarkup = renderClipboardJSONMarkup(contextPageJSON)
    console.log('clipboardJSONMarkup', clipboardJSONMarkup)

    //add custom class to control visibility later
    const originalBody = document.querySelector('body')
    originalBody.classList.add('pe__tcp_body-messy')

    originalBody.classList.add('pe__display-none') //TODO: test

    originalBody.parentElement.appendChild(
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
                                    content: `Properties on Page Trace Event [${contextPageJSON['page-title']}]`,
                                    cls: 'pe__tcp_header-title',
                                },
                            ],
                            cls: ['pe__tcp_header'],
                        },
                    ],
                },
                {
                    tag: 'aside',
                    content: [
                        {
                            tag: 'input',
                            cls: 'pega-extension__tcp_search_input',
                            attrs: {
                                placeholder: 'Search within this context',
                            },
                        },
                        {
                            tag: 'div',
                            cls: 'pe__tcp_resizable-handle',
                        },
                        { tag: 'div', content: clipboardJSONMarkup }, //draw hierarchical table here in format of <ul><li></li></ul>
                    ],
                },
                {
                    tag: 'main',
                },
            ],
        })
    )

    resizableBarHandler() //initialize resizable bar
}

//TODO: test
function renderClipboardJSONMarkup(clipboardObj) {
    const markup = []

    console.log('received', clipboardObj)

    for (const p of clipboardObj.value) {
        if (p.type === 'page') {
            //TODO: test recursion. loop through all values and to the tree if it's a page

            console.log('sending ', p)
            const nestedPages = renderClipboardJSONMarkup(p)
            console.log(`result for ${p.key}`, nestedPages)

            markup.push({
                tag: 'li',
                content: [
                    {
                        tag: 'div',
                        content: [
                            {
                                tag: 'span',
                                content: p.key,
                                attrs: {
                                    //TODO: add all property values here
                                },
                            },
                        ],
                    },
                ],
            })

            if (nestedPages.content?.length !== 0) {
                markup[markup.length - 1].content.push(nestedPages)
            }
        }
    }

    return { tag: 'ul', content: markup }
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
    page-title: "",
    properties: {[]}
} */
function contextPageToJSON() {
    const table = document.querySelector('table tr div.dialogDataContainer')

    if (!table) return

    /* returns [{key, value, type, class}] for each row in context page viewer
    where 'key' is a name of a property and 'value' is this property value.
    class is the page class, type is either page of property - for the ease of rendring
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
                    //no list structure created before
                    if (
                        result.length === 0 ||
                        (result.length > 0 &&
                            result[result.length - 1].key !== listName)
                    ) {
                        result.push({
                            key: listName,
                            value: [],
                            type: 'page',
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
        'page-title': table.querySelector(
            '.dialogSubHeaderBackground .dialogSubHeader'
        )?.innerText,
        value: collectPageAttributes(table),
    }

    console.log('final result', result)

    return result
}

//handles resizable bar click and move
function resizableBarHandler() {
    let offsetX = 0 //required for resize bar move
    let isClicked = false
    const variables = getComputedStyle(
        document.querySelector('.pe__tcp_body-tidy')
    )

    /* it would be much straightforward to get these data from the markup but 
    the markup not always exist at required time */
    const asideWidth = (
        variables.getPropertyValue('--aside-width') ?? '250px'
    ).replace(/\D/g, '')

    const barHandlerWidth = (
        variables.getPropertyValue('--bar-width') ?? '7px'
    ).replace(/\D/g, '')

    const aside = document.querySelector('aside')

    const handle = document.querySelector('.pe__tcp_resizable-handle')

    handle.addEventListener('mousedown', (e) => {
        isClicked = true
        offsetX = handle.offsetLeft - e.clientX

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

        if (x <= asideWidth) {
            handle.style.left = `${asideWidth}px`
            aside.style.width = `${asideWidth}px`

            return
        } else if ((x / window.outerWidth) * 100 >= 90) {
            handle.style.left = `calc(90% - 2 * ${barHandlerWidth}px)`
            aside.style.width = `calc(90% - ${barHandlerWidth}px)`

            return
        }

        let handleLeft = x + offsetX - 2 * barHandlerWidth
        handleLeft = handleLeft <= asideWidth ? asideWidth : handleLeft //prevent shaking on edges

        handle.style.left = `${handleLeft}px`
        aside.style.width = `${
            parseInt(handleLeft) + parseInt(barHandlerWidth)
        }px`
    })
}
