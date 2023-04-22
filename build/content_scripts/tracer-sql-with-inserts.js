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
        let eventTypeValue = r
            .querySelector('.eventElementData')
            ?.innerText.trim()

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
            .querySelector('.eventElementDataBold')
            .innerText.trim()
        const eventTypeValue = r
            .querySelector('.eventElementData')
            .innerText.trim()

        if (eventType === 'Event Type' && eventTypeValue === 'DB Query') {
            const { query, insertsRow } = enrichSqlWithInserts(rows)

            if (query && insertsRow) {
                const copyIcon = document.createElement('img')
                copyIcon.setAttribute('src', 'webwb/pzCopyPaste.png')
                copyIcon.setAttribute('sql-copied', false)
                copyIcon.style.top = '5px'
                copyIcon.style.right = '5px'
                copyIcon.style.position = 'absolute'
                copyIcon.style.height = '2em'
                copyIcon.style.display = 'none'
                copyIcon.classList.add('sql-with-inserts-copy')

                const copiedIcon = document.createElement('img')
                copiedIcon.setAttribute(
                    'src',
                    'webwb/pyWorkConfirmCheckmark.png'
                )
                copiedIcon.classList.add('sql-with-inserts-copied')
                copiedIcon.style.top = '5px'
                copiedIcon.style.right = '5px'
                copiedIcon.style.position = 'absolute'
                copiedIcon.style.height = '2em'
                copiedIcon.style.display = 'none'

                const enrichedSqlRowName = document.createElement('td')
                enrichedSqlRowName.classList.add('eventElementDataBold')
                enrichedSqlRowName.setAttribute('VALIGN', 'TOP')
                enrichedSqlRowName.style.position = 'relative'
                enrichedSqlRowName.innerHTML = `&nbsp;SQL ✨`
                enrichedSqlRowName.appendChild(copyIcon)
                enrichedSqlRowName.appendChild(copiedIcon)

                //<TD CLASS='eventElementData'>"
                const enrichedSqlRowData = document.createElement('td')
                enrichedSqlRowData.classList.add('eventElementData')
                enrichedSqlRowData.innerText = query

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

                //event handlers
                enrichedSqlRowName.addEventListener('click', () => {
                    try {
                        navigator.clipboard.writeText(
                            sqlFormatterGlobalObj.sqlFormatter.format(
                                enrichedSqlRowData.innerText
                            )
                        )
                    } catch (error) {
                        navigator.clipboard.writeText(
                            enrichedSqlRowData.innerText
                        )
                    }

                    copyIcon.setAttribute('sql-copied', 'true')
                    copyIcon.style.display = 'none'

                    copiedIcon.style.display = ''

                    setTimeout(() => {
                        copiedIcon.style.display = 'none'
                        copyIcon.setAttribute('sql-copied', 'false')
                    }, 800)
                })

                enrichedSqlRowName.addEventListener('mouseover', () => {
                    enrichedSqlRowName.style.cursor = 'pointer'

                    if (copyIcon.getAttribute('sql-copied') == 'false') {
                        copyIcon.style.display = ''
                    }
                })

                enrichedSqlRowName.addEventListener('mouseout', () => {
                    enrichedSqlRowName.style.cursor = 'auto'
                    copyIcon.style.display = 'none'
                })
            }

            break
        } else {
            continue
        }
    }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.copyImgUrl) {
        document.querySelector('.sql-with-inserts-copy').src =
            request.copyImgUrl
    }
    if (request.doneImgUrl) {
        document.querySelector('.sql-with-inserts-copied').src =
            request.doneImgUrl
    }

    sendResponse({ success: true })
    return true
})
