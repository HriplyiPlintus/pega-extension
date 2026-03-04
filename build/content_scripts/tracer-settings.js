//trace event's popup
if (document.readyState !== 'loading') {
    extendRulesetsSets()
} else {
    document.addEventListener('DOMContentLoaded', () => {
        extendRulesetsSets()
    })
}

//just global variable of the rulesets available to chose
const rulesetsArr = [
    ...document.querySelectorAll('#RuleSetDisplay>table td.dataLabelStyle'),
]

const eventTypes = [
    ...document.querySelectorAll(
        '#EventTypesDisplay table td.dataLabelStyle>input[type="CHECKBOX"]'
    ),
]

//generates standard button, only title is necessary
function generateSettingsButton(title) {
    const td = templateEngine({
        tag: 'td',
        cls: 'dataLabelStyle',
        content: [
            {
                tag: 'button',
                attrs: {
                    type: 'button',
                    title: title,
                },
                content: [
                    { tag: 'span', cls: 'buttonLeft' },
                    {
                        tag: 'span',
                        cls: 'buttonMiddle',
                        content: [
                            {
                                tag: 'span',
                                cls: 'buttonText',
                                content: title,
                            },
                        ],
                    },
                    {
                        tag: 'span',
                        cls: 'buttonRight',
                    },
                ],
            },
        ],
    })
    const span = td.querySelector('.buttonText')
    span.addEventListener('mouseover', () => (span.className = 'buttonTextHover'))
    span.addEventListener('mouseout', () => (span.className = 'buttonText'))
    return td
}

function appendDeselectOOTBRSBtn() {
    const rulesetsSection = document.querySelector('#rulesetDisplay')
    const setsBtn = rulesetsSection.querySelector('.dataLabelStyle')

    const setsBtnClone = setsBtn.parentElement.appendChild(
        generateSettingsButton('Deselect OOTB')
    )

    setsBtnClone.addEventListener('click', (e) => {
        e.stopImmediatePropagation()

        //if enable all is checked, uncheck it
        const enableAll = rulesetsArr.find((rs) =>
            rs.innerText.includes('Enable All Rulesets')
        )

        if (enableAll) {
            const checkbox = enableAll.querySelector('input')
            if (checkbox && checkbox.checked) {
                checkbox.click()
            }
        }

        const OOTBRulesets = rulesetsArr.filter(
            (rs) =>
                /Pega[-]?.*/.test(rs.innerText.trim()) ||
                rs.innerText.trim().includes('Theme-Cosmos')
        )

        if (OOTBRulesets.length > 0) {
            OOTBRulesets.forEach((rs) => {
                const checkbox = rs.closest('tr')?.querySelector('input')
                if (checkbox && checkbox.checked) {
                    checkbox.click()
                }
            })
        }
    })
}

function appendSelectAllEventTypes() {
    const setsBtn = document.querySelector(
        '#EventTypesDisplay td.tdLeftStyle > table > tbody > tr'
    )

    const selectAllBtn = setsBtn.appendChild(
        generateSettingsButton('Select All')
    )

    selectAllBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation()

        eventTypes.forEach((et) => {
            if (!et.checked) {
                et.click()
            }
        })
    })
}

function appendDeselectAllEventTypes() {
    const setsBtn = document.querySelector(
        '#EventTypesDisplay td.tdLeftStyle > table > tbody > tr'
    )

    const deselectAllBtn = setsBtn.appendChild(
        generateSettingsButton('Deselect All')
    )

    deselectAllBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation()

        eventTypes.forEach((et) => {
            if (et.checked) {
                et.click()
            }
        })
    })
}

//main function to add new buttons
function extendRulesetsSets() {
    appendDeselectOOTBRSBtn()

    appendSelectAllEventTypes()
    appendDeselectAllEventTypes()
}

//template engine
function templateEngine(e) {
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
