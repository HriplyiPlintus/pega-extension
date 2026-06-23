/* each "?" in the SQL is substituted with a unique sentinel token (kept as a SQL
string literal, so the formatter preserves it verbatim and in order). that lets us
map every inserted value to its EXACT spot in the beautified SQL - even when the
same value is inserted more than once - instead of bolding every textual match.
declared above the run trigger so the immediate-run path doesn't hit their TDZ. */
const PE_SQL_TOKEN_RE = /'PEZZ_INSERT_(\d+)_ZZEP'/g
const peSqlToken = (i) => `'PEZZ_INSERT_${i}_ZZEP'`
const peEscapeHtml = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
    let insertsValueEl = undefined

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
            insertsValueEl = eventTypeValueElement
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

        //substitute each "?" with a sentinel token (not the value itself) so we can
        //later find each insert's exact location in the formatted output
        let markedQuery = sqlQuery
        let insertsIndex = 0
        while (
            markedQuery.includes('?') &&
            insertsIndex < insertsArr.length
        ) {
            markedQuery = markedQuery.replace('?', peSqlToken(insertsIndex))
            insertsIndex++
        }

        return { markedQuery, insertsArr, insertsRow, insertsValueEl }
    }

    return {}
}

/* rebuild the "SQL Inserts" cell so each value is its own hoverable element, and
wire it to bold the matching value in the beautified SQL. the match is by token
INDEX, so hovering one of two identical values highlights only its own occurrence. */
function wireInsertsHighlight(insertsValueEl, insertsArr, sqlEl) {
    if (!insertsValueEl) {
        return
    }

    const container = document.createElement('span')
    container.classList.add('pe__sql-inserts-src')

    insertsArr.forEach((value, i) => {
        if (i > 0) {
            container.appendChild(document.createTextNode(' '))
        }

        const srcSpan = document.createElement('span')
        srcSpan.classList.add('pe__sql-insert-src')
        srcSpan.dataset.peInsert = String(i)
        srcSpan.textContent = `<${value}>` //textContent escapes the angle brackets

        //the exact (single) occurrence this insert produced in the beautified SQL
        const targets = sqlEl.querySelectorAll(
            `.pe__sql-insert[data-pe-insert="${i}"]`
        )
        srcSpan.addEventListener('mouseenter', () => {
            targets.forEach((t) => t.classList.add('pe__sql-insert--hl'))
        })
        srcSpan.addEventListener('mouseleave', () => {
            targets.forEach((t) => t.classList.remove('pe__sql-insert--hl'))
        })

        container.appendChild(srcSpan)
    })

    const xmp = insertsValueEl.querySelector('xmp')
    if (xmp) {
        xmp.replaceWith(container)
    } else {
        insertsValueEl.replaceChildren(container)
    }
}

function addSqlWithInserts() {
    const rows = document.querySelectorAll('form table>tbody>tr.eventTable')

    for (const r of rows) {
        const eventType = r
            ?.querySelector('.eventElementDataBold')
            ?.innerText.trim()
        const eventTypeValue = r
            ?.querySelector('.eventElementData')
            ?.innerText.trim()

        if (eventType === 'Event Type' && eventTypeValue === 'DB Query') {
            const { markedQuery, insertsArr, insertsRow, insertsValueEl } =
                enrichSqlWithInserts(rows)

            if (markedQuery && insertsRow) {
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
                    'pe__tracer-event-sql-inserts-icon-copied'
                )
                copiedIcon.classList.add('pe__display-none') //not visible by default

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
                        let textToCopy = ''
                        try {
                            textToCopy =
                                sqlFormatterGlobalObj.sqlFormatter.format(
                                    enrichedSqlRowData.dataset.query
                                )
                        } catch (error) {
                            textToCopy = enrichedSqlRowData.dataset.query
                        }

                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(textToCopy)
                        } else {
                            //workaround for not secured context where clipboard api doesn't work
                            const currentActiveElement = document.activeElement

                            const copyTextArea =
                                document.createElement('textarea')
                            copyTextArea.value = textToCopy
                            document.body.appendChild(copyTextArea)
                            copyTextArea.focus({ preventScroll: true })
                            copyTextArea.select()
                            try {
                                document.execCommand('copy')
                            } catch (err) {
                                console.error(
                                    'Unable to copy to clipboard',
                                    err
                                )
                            }
                            document.body.removeChild(copyTextArea)
                            currentActiveElement.focus({ preventScroll: true })
                        }

                        const toggleIconCopyVisibility = () => {
                            for (const ci of e.target
                                .closest(
                                    '.pega-extension__tracer-event-sql-icons-wrapper'
                                )
                                ?.querySelectorAll(
                                    '.pega-extension__tracer-event-sql-inserts-icon-copy, .pe__tracer-event-sql-inserts-icon-copied'
                                )) {
                                ci.classList.toggle('pe__display-none')
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

                //format the TOKEN-marked query once, then derive both the real
                //(de-tokenized) SQL for copy and the highlightable HTML for display
                let formattedMarked
                try {
                    formattedMarked = sqlFormatterGlobalObj.sqlFormatter.format(
                        markedQuery
                    )
                } catch (error) {
                    formattedMarked = markedQuery
                }

                const realFormatted = formattedMarked.replace(
                    PE_SQL_TOKEN_RE,
                    (m, idx) => `'${insertsArr[Number(idx)]}'`
                )

                //escape + preserve spacing first (tokens carry no spaces/markup, so
                //they survive intact), THEN swap each token for a highlightable span
                let displayHtml = peEscapeHtml(formattedMarked).replaceAll(
                    ' ',
                    '&nbsp;'
                )
                displayHtml = displayHtml.replace(PE_SQL_TOKEN_RE, (m, idx) => {
                    const i = Number(idx)
                    const valueHtml = peEscapeHtml(
                        `'${insertsArr[i]}'`
                    ).replaceAll(' ', '&nbsp;')
                    return `<span class="pe__sql-insert" data-pe-insert="${i}">${valueHtml}</span>`
                })

                enrichedSqlRowData.innerHTML = displayHtml
                enrichedSqlRowData.appendChild(actionIconsWrapper) //added action icons
                enrichedSqlRowData.dataset.query = realFormatted

                enrichedSqlRowData.classList.add(
                    'pega-extension__tracer-event-sql-formatted'
                )
                enrichedSqlRowData.style.height = '5em'

                //make each SQL Insert value hoverable -> bolds its exact match above
                wireInsertsHighlight(insertsValueEl, insertsArr, enrichedSqlRowData)

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
