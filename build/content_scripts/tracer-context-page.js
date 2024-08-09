//trace context page viewer popup
let clipboardJSON = null

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
    originalBody.classList.add(
        'pega-extension__tracer-context-page_body-original'
    )

    originalBody.style.display = 'none' //TODO: test

    originalBody.parentElement.appendChild(
        templateEngine({
            tag: 'body',
            cls: 'pega-extension__tcp_body',
            content: [
                {
                    tag: 'header',
                    content: [
                        {
                            tag: 'div',
                            content: `Properties on Page Trace Event [${contextPageJSON['page-title']}]`,
                            cls: ['pega-extension__tcp_header'],
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
                            cls: 'pega-extension__tcp_resizable-handle',
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
}

//TODO: test
function renderClipboardJSONMarkup(clipboardObj) {
    const markup = []

    for (const p of clipboardObj.properties) {
        if (p.type === 'page') {
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
        }
    }

    return { tag: 'ul', content: markup }
}

function buildTree(clipboardData){
    let resultTree = null

    const renderLayer = (layerData)=> {
for(const p of layerData.properties){
    
}
    }

    for(const p of clipboardData.properties){
        if (p.type === 'page'){
            for(const ip of p.properties){

            }
        }
    }

    return resultTree
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
        properties: collectPageAttributes(table),
    }

    console.log('final result', result)
    return result
}
