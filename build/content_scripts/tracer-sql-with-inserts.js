//trace event's popup
if (document.readyState !== 'loading') {
    addSqlWithInserts()
} else {
    document.addEventListener('DOMContentLoaded', () => {
        addSqlWithInserts()
    })
}

function enrichSqlWithInserts(rows) {
    let sqlQuery = ''
    let sqlInserts = ''

    let insertsRow = undefined

    for (const r of rows) {
        //row label
        let eventType = r
            .querySelector('.eventElementDataBold')
            .innerText.trim()

        //row value
        let eventTypeValueElement = r.querySelector('.eventElementData')
        let eventTypeValue = eventTypeValueElement?.innerText.trim()

        if (!eventTypeValue) {
            continue
        }

        //get query
        if (eventType === 'SQL') {
            sqlQuery = eventTypeValue
        }

        //get inserts
        if (eventType === 'SQL Inserts') {
            sqlInserts = eventTypeValue
            const eventTypeXMPElement =
                eventTypeValueElement.querySelector('xmp')
            if (eventTypeXMPElement) {
                eventTypeXMPElement.style.whiteSpace = 'pre-wrap'
            }
        }

        if (sqlQuery && sqlInserts) {
            insertsRow = r //TODO
            break
        }
    }

    if (sqlQuery && sqlInserts) {
        sqlInserts = sqlInserts.substring(1, sqlInserts.length - 1)

        let insertsArr = sqlInserts.split('> <') //pure inserts array

        let startSearchIndex,
            insertsIndex = 0
        while (
            sqlQuery.includes('?', startSearchIndex) &&
            insertsIndex < insertsArr.length
        ) {
            sqlQuery = sqlQuery.replace(/\?/, `'${insertsArr[insertsIndex]}'`)
            insertsIndex++
        }

        return { query: sqlQuery, insertsRow: insertsRow }
    }
}

function addSqlWithInserts() {
    const rows = document.querySelectorAll('form table>tbody>tr.eventTable')

    for (const r of rows) {
        const eventType = r
            ?.querySelector('.eventElementDataBold')
            .innerText.trim()
        const eventTypeValue = r
            ?.querySelector('.eventElementData')
            .innerText.trim()

        if (eventType === 'Event Type' && eventTypeValue === 'DB Query') {
            const { query, insertsRow } = enrichSqlWithInserts(rows)

            if (query && insertsRow) {
                const copyIcon = document.createElement('img')
                copyIcon.setAttribute(
                    'src',
                    chrome.runtime.getURL('./assets/img/copy.png')
                )

                copyIcon.classList.add(
                    'pega-extension__tracer-event-sql-inserts-icon-copy'
                )

                const copiedIcon = document.createElement('img')
                copiedIcon.setAttribute(
                    'src',
                    chrome.runtime.getURL('./assets/img/copy-done.png')
                )

                copiedIcon.classList.add(
                    'pega-extension__tracer-event-sql-inserts-icon-copied'
                )
                copiedIcon.classList.add('pega-extension__display-none') //not visible by default

                const copyIconWrapper = document.createElement('div') //for tooltips support
                copyIconWrapper.appendChild(copyIcon)
                //copyIconWrapper.appendChild(copiedIcon)
                copyIconWrapper.dataset.tooltip = 'Copy formatted SQL'
                copyIconWrapper.classList.add('pega-extension__copy-value')

                const actionIconsWrapper = document.createElement('div')
                actionIconsWrapper.classList.add(
                    'pega-extension__tracer-event-sql-icons-wrapper'
                )
                actionIconsWrapper.appendChild(copyIconWrapper)
                actionIconsWrapper.appendChild(copiedIcon)

                const enrichedSqlRowName = document.createElement('td')
                enrichedSqlRowName.classList.add('eventElementDataBold')
                enrichedSqlRowName.setAttribute('VALIGN', 'TOP')
                enrichedSqlRowName.style.position = 'relative'
                enrichedSqlRowName.innerHTML = `&nbsp;SQL ✨`

                //<TD CLASS='eventElementData'>"
                const enrichedSqlRowData = document.createElement('td')
                enrichedSqlRowData.classList.add('eventElementData')

                copyIconWrapper.addEventListener('click', (e) => {
                    if (
                        e.target.classList.contains(
                            'pega-extension__tracer-event-sql-inserts-icon-copy'
                        )
                    ) {
                        try {
                            navigator.clipboard.writeText(
                                sqlFormatterGlobalObj.sqlFormatter.format(
                                    enrichedSqlRowData.dataset.query
                                )
                            )
                        } catch (error) {
                            navigator.clipboard.writeText(
                                enrichedSqlRowData.dataset.query
                            )
                        }

                        const toggleIconCopyVisibility = () => {
                            for (const ci of e.target
                                .closest(
                                    '.pega-extension__tracer-event-sql-icons-wrapper'
                                )
                                ?.querySelectorAll(
                                    '.pega-extension__tracer-event-sql-inserts-icon-copy, .pega-extension__tracer-event-sql-inserts-icon-copied'
                                )) {
                                ci.classList.toggle(
                                    'pega-extension__display-none'
                                )
                            }
                        }
                        toggleIconCopyVisibility()

                        const copyDonePopup = document.createElement('div')
                        copyDonePopup.classList.add(
                            'pega-extension__copied-to-clipboard'
                        )
                        copyDonePopup.innerText = 'Copied to clipboard'

                        document
                            .querySelector('body')
                            .appendChild(copyDonePopup)

                        setTimeout(() => {
                            toggleIconCopyVisibility()
                            copyDonePopup.remove()
                        }, 1500)
                    }
                })
                /* 
                TODO: add white-space: pre-wrap для SQL inserts и для самой квери. 
                саму кверю нужно будет брать после преобразования
                посмотреть на строке sqlFormatterGlobalObj.sqlFormatter.format
                */
                let modifiedQuery = sqlFormatterGlobalObj.sqlFormatter
                    .format(query)
                    .replaceAll(' ', '&nbsp;')

                enrichedSqlRowData.innerHTML = modifiedQuery //sqlFormatterGlobalObj.sqlFormatter.format(query)
                enrichedSqlRowData.appendChild(actionIconsWrapper) //added action icons
                enrichedSqlRowData.dataset.query = query

                enrichedSqlRowData.classList.add(
                    'pega-extension__tracer-event-sql-formatted'
                )
                enrichedSqlRowData.style.height = '5em'

                //row itself
                const enrichedSqlRow = document.createElement('tr')
                enrichedSqlRow.classList.add('eventTable')

                enrichedSqlRow.appendChild(enrichedSqlRowName)
                enrichedSqlRow.appendChild(enrichedSqlRowData)

                //insert new row after sql inserts
                insertsRow.parentNode.insertBefore(
                    enrichedSqlRow,
                    insertsRow.nextSibling
                )
            }

            break
        } else {
            continue
        }
    }
}
