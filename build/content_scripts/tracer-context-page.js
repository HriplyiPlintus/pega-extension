//trace context page viewer popup
if (document.readyState !== 'loading') {
    contextPageToJSON()
} else {
    document.addEventListener('DOMContentLoaded', () => {
        contextPageToJSON()
    })
}

//TODO: create flat representation of clipboard. this will allow to search fro keys or/and values

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

//creates nested JSON from clipboard page
function contextPageToJSON() {
    const table = document.querySelector('table tr div.dialogDataContainer')

    if (!table) return

    /* returns [{key, value}] for each row in context page viewer
    where 'key' is a name of a property and 'value' is this property value.
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
                        result.push({ key: listName, value: [] })
                    }

                    pushToResults = result[result.length - 1].value //change results context
                }
                pushToResults.push({
                    key: key.toString().trim(),
                    value: value,
                })

                //add page class if found
                if (pageClass) {
                    pushToResults[pushToResults.length - 1].class = pageClass
                }
            }
        } while (attr)

        return result
    }

    let result = collectPageAttributes(table)

    console.log('final result', result)
}
