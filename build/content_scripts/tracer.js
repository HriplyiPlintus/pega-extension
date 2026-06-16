/* Tracer event-log: drag a column header's right edge to resize that column.

This script is injected into the TOP frame of the Tracer window (matched by its
"Tracer - PegaRULES" title). The event table itself lives in a same-origin
subframe named "TraceEvent" that loads/reloads independently, so this top-frame
script REACHES INTO that subframe's document and operates on it directly - no
second injection needed. Because the top-frame script outlives the subframe, it
re-applies itself (and the user's saved widths) every time the subframe reloads
(e.g. the Clear button), via the frame's load event.

Mechanism (TRACK based - the header and body disagree on cell GROUPING):
  - The header table #traceEvent-TABLE is one row of 13 cells, but "Step Page"
    is a single cell with colSpan=3, so the header spans 15 grid TRACKS.
  - Each body row (table #traceEvent-TABLE-<reqId>) has 2 leading display:none
    cells plus 15 VISIBLE colSpan=1 cells - "Step Page" is three real cells
    there (source page / arrow / target page). So body also spans 15 tracks,
    just expressed as 15 separate cells instead of header-style colspans.
So we work in TRACKS, not cells: one CSS custom property per track
(--pe-tracer-col-<trackIndex>) on the subframe's <html>, and an identical
15-<col> colgroup injected into the header table and every body table. A col
reads its track's var, so one setProperty resizes header + all body tables in a
single synchronous write; they can never drift. A header cell that spans N
tracks (Step Page) carries ONE handle that scales its N tracks proportionally.

We only build once a real body row exists, so track widths seed from the body's
own natural layout, and a structural check (header tracks == body visible tracks)
plus a colspan-aware geometry check fail OFF to the native table on any mismatch. */
;(function () {
    'use strict'

    //guard against double init in this (top) frame
    if (window.__peTracerResizeInit) return
    window.__peTracerResizeInit = true

    /* diagnostics: flip to false to silence. logs are tagged so you can filter
    this (top) frame's console by "pega-ext tracer" */
    const DEBUG = true
    const log = (...a) => DEBUG && console.log('[pega-ext tracer]', ...a)

    const MIN_COL = 24 //minimum width of a whole column (sum of its tracks), px
    const MIN_TRACK = 12 //minimum width of a single track, px (e.g. the "<--" cell)
    const MAX_COL = 1000 //maximum column width on drag, px (keeps handles reachable)
    const HANDLE_W = 8 //resize handle hit area, px
    const ALIGN_TOLERANCE = 6 //px drift allowed before the feature fails off
    const PERSIST_DEBOUNCE = 400 //ms - collapse a flurry of drags into one write
    const FRAME_WAIT_MS = 20000 //ms - give up looking for the TraceEvent frame
    const SETTINGS_KEY = 'tracer-colWidths-v2' //v2: per-column arrays of track widths
    const STYLE_ID = 'pe__tracer-resize-style'

    //persists across subframe reloads:
    let widthsByKey = {} //column title -> [px per track] (persisted + live)
    let disabled = false //explicitly off, or after a fail-off teardown

    //reset for each tracer document (the subframe reloads give a fresh document):
    let D = null //the document that holds the tracer table
    let HEADER = null
    let cols = [] //header cells (one per <td>; "Step Page" has span 3)
    let tracks = [] //flat grid tracks (15 of them; the unit we actually size)
    let observer = null
    let validated = false

    let persistTimer = null

    const raf = (cb) => window.requestAnimationFrame(cb)
    const clampWidth = (w) => Math.max(MIN_COL, Math.round(Number(w) || MIN_COL))
    const clampTrack = (w) => Math.max(MIN_TRACK, Math.round(Number(w) || MIN_TRACK))

    log('top-frame script loaded')
    loadSettingsThenBootstrap()

    function loadSettingsThenBootstrap() {
        try {
            chrome.runtime.sendMessage({ message: 'getSettings' }, (resp) => {
                void chrome.runtime.lastError //avoid unchecked-error warning
                try {
                    const payload = resp && resp.payload
                    if (payload && payload['tracer-resize-enabled'] === false) {
                        disabled = true
                        log('disabled via tracer-resize-enabled=false')
                        return
                    }
                    const saved = payload && payload[SETTINGS_KEY]
                    if (saved) widthsByKey = JSON.parse(saved) || {}
                    log('settings loaded; persisted widths=', widthsByKey)
                } catch (e) {
                    /* ignore malformed settings - fall back to live defaults */
                }
                bootstrap()
            })
        } catch (e) {
            bootstrap()
        }
    }

    /* locate the document that holds the tracer table and follow it. normally we
    are in the frameset and the table is in the TraceEvent subframe; we also
    handle being injected straight into the table's document. */
    function bootstrap() {
        if (disabled) return

        if (document.getElementById('traceEvent-TABLE')) {
            log('table is in this document; attaching directly')
            startForDoc(document)
            return
        }

        const frameEl = findTraceEventFrame()
        if (frameEl) {
            attachFrame(frameEl)
            return
        }

        log('TraceEvent frame not present yet; watching the frameset')
        watchForFrame()
    }

    //the <frame>/<iframe> whose document holds the tracer table (named, or by content)
    function findTraceEventFrame() {
        const named = document.querySelector(
            'frame[name="TraceEvent"], iframe[name="TraceEvent"]'
        )
        if (named) return named

        //fallback: any same-origin child frame that already contains the table
        for (const f of document.querySelectorAll('frame, iframe')) {
            const d = safeContentDoc(f)
            if (d && d.getElementById('traceEvent-TABLE')) return f
        }
        return null
    }

    function safeContentDoc(frameEl) {
        try {
            return frameEl.contentDocument //null/throws if not same-origin or not ready
        } catch (e) {
            return null
        }
    }

    //wire up the subframe: process it now and again on every (re)load
    function attachFrame(frameEl) {
        if (!frameEl.__peTracerAttached) {
            frameEl.__peTracerAttached = true
            frameEl.addEventListener('load', () => {
                log('TraceEvent frame (re)loaded')
                startForDoc(safeContentDoc(frameEl))
            })
            log('attached to TraceEvent frame; name=', frameEl.name)
        }
        startForDoc(safeContentDoc(frameEl))
    }

    //the frame element may not exist yet right after the frameset loads
    function watchForFrame() {
        let done = false
        const obs = new MutationObserver(() => {
            if (done) return
            const f = findTraceEventFrame()
            if (f) {
                done = true
                obs.disconnect()
                clearTimeout(timer)
                attachFrame(f)
            }
        })
        obs.observe(document.documentElement, {
            childList: true,
            subtree: true,
        })
        const timer = setTimeout(() => {
            if (!done) {
                obs.disconnect()
                log('gave up finding the TraceEvent frame')
            }
        }, FRAME_WAIT_MS)
    }

    /* (re)bind the feature to a tracer document. a fresh document (first load or
    a reload) resets per-document state; saved widths in widthsByKey carry over. */
    function startForDoc(doc) {
        if (disabled || !doc) return

        if (doc === D && observer) {
            ensure() //same document, just re-check
            return
        }

        if (observer) {
            observer.disconnect()
            observer = null
        }
        D = doc
        HEADER = null
        cols = []
        tracks = []
        validated = false

        log(
            'binding to tracer document; readyState=',
            D.readyState,
            '| table present=',
            !!D.getElementById('traceEvent-TABLE')
        )

        ensure()

        /* keep in sync with the streaming, re-rendering OOTB table: new body
        tables, a late header, or a replaced header all funnel through ensure() */
        let scheduled = false
        observer = new MutationObserver(() => {
            if (scheduled || disabled) return
            scheduled = true
            raf(() => {
                scheduled = false
                ensure()
            })
        })
        const target = D.body || D.documentElement
        if (target) observer.observe(target, { childList: true, subtree: true })
    }

    /* idempotent, self-healing core. we hold off building until a real body row
    exists (so seeds + structure check have something to measure), then build the
    header colgroup + handles and every body colgroup. */
    function ensure() {
        if (disabled || !D) return

        HEADER = D.getElementById('traceEvent-TABLE')
        const row = getHeaderRow()
        if (!row) return

        const built =
            !!HEADER.querySelector(':scope > colgroup[data-pe-cg]') &&
            !!row.querySelector('.pe__tracer-col-handle')

        if (!built) {
            //wait for a body data row: we need it to measure + validate first
            if (!bodyTables().some(firstDataRow)) return
            rebuildAll(row)
        } else {
            //header is fine; just colgroup any newly streamed body tables
            for (const t of bodyTables()) {
                if (!t.dataset.peCg) buildColgroup(t)
            }
        }

        maybeValidate()
    }

    function rebuildAll(row) {
        cols = readHeaderCols(row)
        const resizable = cols.filter((c) => c.resizable).length
        if (!resizable) {
            log('header row found but no resizable columns')
            return
        }

        //structural gate: header track count must equal body visible track count
        if (!structureMatches(row)) {
            log('header/body track structure differs -> staying native (off)')
            teardown()
            return
        }

        removeArtifacts() //safe even when nothing has been built yet
        const natural = measureBodyTrackWidths() //measure body BEFORE we go fixed
        buildTracks(natural)
        seedVars()
        buildColgroup(HEADER) //forces fixed layout AFTER measuring
        bodyTables().forEach(buildColgroup)
        injectStyle() //neutralize max-width caps etc. once widths are locked in
        addHandles(row)
        validated = false
        log(
            'built:',
            resizable,
            'columns,',
            tracks.length,
            'tracks,',
            bodyTables().length,
            'body table(s)'
        )
    }

    /* the geometry check only means something once real rows exist, so it runs
    when the first data row appears - not once on an empty table */
    function maybeValidate() {
        if (validated || disabled) return
        if (!tracks.length) return
        if (!bodyTables().some(firstDataRow)) return

        if (validateAlignment()) {
            validated = true
            log('alignment validated; feature active')
        } else {
            log(
                'header/body columns misaligned -> failing off (native restored)'
            )
            teardown()
        }
    }

    //----- the column / track model -----

    //the header row is the canonical schema; cells map to one-or-more tracks
    function readHeaderCols(row) {
        let ti = 0
        return [...row.cells].map((td, i) => {
            const isData = td.classList.contains('eventTitleBarStyle')
            const span = td.colSpan || 1
            const title = (
                td.getAttribute('title') ||
                td.textContent ||
                ''
            ).trim()
            const c = {
                //key is the human title (persistence key, survives reorder);
                //the leading spacer cell has no class and is not resizable
                key: isData ? title || 'col' + i : 'spacer' + i,
                span,
                resizable: isData,
                px: measureCellPx(td),
                trackStart: ti,
                lastTrack: ti + span - 1,
            }
            ti += span
            return c
        })
    }

    //flatten header cells into grid tracks (one <col> / one CSS var each)
    function buildTracks(natural) {
        tracks = []
        for (const c of cols) {
            const shares = splitShares(c, natural)
            for (let p = 0; p < c.span; p++) {
                const ti = c.trackStart + p
                tracks.push({
                    index: ti,
                    cssVar: '--pe-tracer-col-' + ti,
                    colKey: c.key,
                    resizable: c.resizable,
                    px: shares[p],
                })
            }
        }
    }

    //per-track seed widths for one header cell: prefer the body's natural layout
    function splitShares(c, natural) {
        if (natural && natural.length >= c.trackStart + c.span) {
            const arr = []
            for (let p = 0; p < c.span; p++) arr.push(natural[c.trackStart + p])
            if (arr.every((v) => v > 0)) return arr
        }
        if (c.span === 1) return [Math.max(MIN_TRACK, c.px)]
        const each = Math.max(MIN_TRACK, Math.round(c.px / c.span))
        return Array(c.span).fill(each)
    }

    //measure the body's natural per-track widths (only valid before we go fixed)
    function measureBodyTrackWidths() {
        const totalTracks = cols.reduce((s, c) => s + c.span, 0)
        const table = bodyTables().find(firstDataRow)
        if (!table) return null
        const visible = [...firstDataRow(table).cells].filter(isVisibleCell)
        const count = visible.reduce((s, td) => s + (td.colSpan || 1), 0)
        if (count !== totalTracks) return null
        const widths = []
        for (const td of visible) {
            const span = td.colSpan || 1
            const w = clampTrack(td.getBoundingClientRect().width)
            for (let p = 0; p < span; p++) {
                widths.push(span === 1 ? w : Math.max(MIN_TRACK, Math.round(w / span)))
            }
        }
        return widths
    }

    //resolve a header cell's current width to concrete px (handles %, max-width)
    function measureCellPx(td) {
        const w = td.style.width
        if (w && w.endsWith('px')) {
            const n = parseFloat(w)
            if (n > 0) return Math.round(n)
        }
        return clampWidth(td.getBoundingClientRect().width)
    }

    //apply the seed (or persisted) width to every resizable track's CSS var
    function seedVars() {
        for (const c of cols) {
            if (!c.resizable) continue
            const myTracks = tracks.filter((t) => t.colKey === c.key)
            const saved = widthsByKey[c.key]
            const usable =
                Array.isArray(saved) &&
                saved.length === myTracks.length &&
                saved.every((v) => v > 0)
            myTracks.forEach((t, p) => {
                const px = clampTrack(usable ? saved[p] : t.px)
                t.px = px
                D.documentElement.style.setProperty(t.cssVar, px + 'px')
            })
            widthsByKey[c.key] = myTracks.map((t) => t.px)
        }
    }

    /* inject a colgroup of one <col> per TRACK. header and body tables get the
    SAME 15-col structure: a resizable col reads its track var; the fixed spacer
    col carries a literal px. body display:none cells occupy no track in Chromium,
    so the visible body cells line up with the header tracks one-for-one. */
    function buildColgroup(table) {
        if (table.dataset.peCg) return

        const cg = D.createElement('colgroup')
        cg.dataset.peCg = '1'

        for (const t of tracks) {
            const col = D.createElement('col')
            col.dataset.peTk = t.index
            col.style.width = t.resizable ? 'var(' + t.cssVar + ')' : t.px + 'px'
            cg.appendChild(col)
        }

        if (table.dataset.pePrevLayout === undefined) {
            table.dataset.pePrevLayout = table.style.tableLayout || ''
        }
        table.style.tableLayout = 'fixed'
        table.insertBefore(cg, table.firstChild)
        table.dataset.peCg = '1'
    }

    function addHandles(row) {
        for (let i = 0; i < row.cells.length; i++) {
            const c = cols[i]
            if (!c || !c.resizable) continue

            const td = row.cells[i]
            if (td.querySelector(':scope > .pe__tracer-col-handle')) continue

            const handle = D.createElement('div')
            handle.className = 'pe__tracer-col-handle'
            handle.dataset.peCol = c.key
            handle.addEventListener('mousedown', (e) => startDrag(e, c))
            //don't let a handle click reach Pega's header click handlers
            handle.addEventListener('click', (e) => {
                e.stopPropagation()
                e.preventDefault()
            })
            td.appendChild(handle)
        }
    }

    /* resize the column's track(s). single-track columns set their one var; the
    3-track "Step Page" scales its tracks proportionally so the whole group grows. */
    function startDrag(e, c) {
        e.preventDefault()
        e.stopPropagation()

        const myTracks = tracks.filter((t) => t.colKey === c.key)
        if (!myTracks.length) return

        const startX = e.clientX
        const startWidths = myTracks.map((t) => t.px)
        const startTotal = startWidths.reduce((a, b) => a + b, 0)

        //full-doc overlay keeps the mouse stream from falling into inner elements
        const overlay = D.createElement('div')
        overlay.className = 'pe__tracer-resize-overlay'
        D.body.appendChild(overlay)
        D.body.classList.add('pe__tracer-resizing')

        const onMove = (ev) => {
            const newTotal = Math.min(
                MAX_COL,
                clampWidth(startTotal + (ev.clientX - startX))
            )
            const factor = startTotal > 0 ? newTotal / startTotal : 1
            myTracks.forEach((t, p) => {
                const w = Math.max(MIN_TRACK, Math.round(startWidths[p] * factor))
                t.px = w
                D.documentElement.style.setProperty(t.cssVar, w + 'px')
            })
            widthsByKey[c.key] = myTracks.map((t) => t.px)
        }
        const onUp = () => {
            D.removeEventListener('mousemove', onMove, true)
            D.removeEventListener('mouseup', onUp, true)
            overlay.remove()
            D.body.classList.remove('pe__tracer-resizing')
            persist() //debounced save, never per mousemove
        }

        D.addEventListener('mousemove', onMove, true)
        D.addEventListener('mouseup', onUp, true)
    }

    //debounced so a burst of drags collapses into a single storage write
    function persist() {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
            persistTimer = null
            try {
                chrome.runtime.sendMessage({
                    type: 'settingsSet',
                    sender: 'pega-extension',
                    payload: {
                        key: SETTINGS_KEY,
                        value: JSON.stringify(widthsByKey),
                    },
                })
            } catch (e) {
                /* ignore - widths still apply for this session */
            }
        }, PERSIST_DEBOUNCE)
    }

    //----- validation (structural + colspan-aware geometry) -----

    //header grid-track count must match the body's visible grid-track count
    function structureMatches(row) {
        const table = bodyTables().find(firstDataRow)
        if (!table) return false
        const bodyRow = firstDataRow(table)
        const headerTracks = [...row.cells].reduce(
            (s, td) => s + (td.colSpan || 1),
            0
        )
        const bodyTracks = [...bodyRow.cells]
            .filter(isVisibleCell)
            .reduce((s, td) => s + (td.colSpan || 1), 0)
        if (headerTracks !== bodyTracks) {
            log('structure: header tracks=', headerTracks, '| body tracks=', bodyTracks)
            return false
        }
        return true
    }

    /* compare the right edge of each header CELL to the right edge of the body
    cell that ends the same track (relative to each table's own left, so a
    globally indented body table doesn't trip the check). colspan-aware. */
    function validateAlignment() {
        const table = bodyTables().find(firstDataRow)
        if (!table) return true

        const bodyRow = firstDataRow(table)
        const headerRow = getHeaderRow()
        if (!bodyRow || !headerRow) return true

        const visible = [...bodyRow.cells].filter(isVisibleCell)
        const hBase = HEADER.getBoundingClientRect().left
        const bBase = table.getBoundingClientRect().left

        //right edge of each body track, indexed by track number
        const bodyTrackRight = []
        let bt = 0
        for (const td of visible) {
            bt += td.colSpan || 1
            bodyTrackRight[bt - 1] = td.getBoundingClientRect().right - bBase
        }

        let ht = 0
        let checked = 0
        let mismatched = 0
        for (const td of headerRow.cells) {
            ht += td.colSpan || 1
            const bRight = bodyTrackRight[ht - 1]
            if (bRight == null) continue
            const hRight = td.getBoundingClientRect().right - hBase
            checked++
            if (Math.abs(hRight - bRight) > ALIGN_TOLERANCE) mismatched++
        }
        //allow a single off cell for sub-pixel/rounding noise
        return checked === 0 || mismatched <= 1
    }

    //----- teardown / cleanup -----

    //remove our DOM artifacts but keep state (used by rebuild + teardown)
    function removeArtifacts() {
        if (!D) return
        for (const t of [HEADER, ...bodyTables()]) {
            if (!t) continue
            const cg = t.querySelector(':scope > colgroup[data-pe-cg]')
            if (cg) cg.remove()
            if (t.dataset.pePrevLayout !== undefined) {
                t.style.tableLayout = t.dataset.pePrevLayout
                delete t.dataset.pePrevLayout
            }
            delete t.dataset.peCg
        }
        for (const h of D.querySelectorAll('.pe__tracer-col-handle')) {
            h.remove()
        }
        for (const t of tracks) {
            if (t.resizable) D.documentElement.style.removeProperty(t.cssVar)
        }
    }

    //permanent fail-off: restore the native OOTB table and stop
    function teardown() {
        disabled = true
        if (observer) {
            observer.disconnect()
            observer = null
        }
        removeArtifacts()
        const style = D && D.getElementById(STYLE_ID)
        if (style) style.remove()
    }

    function injectStyle() {
        if (D.getElementById(STYLE_ID)) return
        const style = D.createElement('style')
        style.id = STYLE_ID
        style.textContent = [
            //defeat OOTB inline max-width caps so drags above them take effect; clip overflow
            'table[id^="traceEvent-TABLE-"] td { max-width: none !important; overflow: hidden; text-overflow: ellipsis; }',
            '#traceEvent-TABLE thead td.eventTitleBarStyle { position: relative; max-width: none !important; overflow: hidden; text-overflow: ellipsis; }',
            //NB: do NOT set overflow-x on #traceEvent-CONTAINER - per the CSS
            //overflow rules that also forces overflow-y to auto, which clips the
            //rows out of view. leave the native container scrolling untouched.
            '.pe__tracer-col-handle { position: absolute; top: 0; right: 0; width: ' +
                HANDLE_W +
                'px; height: 100%; cursor: col-resize; user-select: none; z-index: 50; }',
            '.pe__tracer-col-handle:hover { background: rgba(0, 135, 207, 0.45); }',
            '.pe__tracer-resize-overlay { position: fixed; inset: 0; z-index: 2147483646; cursor: col-resize; }',
            'body.pe__tracer-resizing { cursor: col-resize !important; user-select: none !important; }',
        ].join('\n')
        ;(D.head || D.documentElement).appendChild(style)
    }

    //----- small DOM helpers (all scoped to the tracer document D) -----

    //the header row: the thead row, else the first row that has a title cell
    function getHeaderRow() {
        if (!HEADER) return null
        const thead = HEADER.tHead
        if (thead && thead.rows[0] && thead.rows[0].cells.length) {
            return thead.rows[0]
        }
        for (const r of HEADER.rows) {
            if (
                [...r.cells].some((td) =>
                    td.classList.contains('eventTitleBarStyle')
                )
            ) {
                return r
            }
        }
        return null
    }

    function bodyTables() {
        return [...D.querySelectorAll('table[id^="traceEvent-TABLE-"]')]
    }

    function firstDataRow(table) {
        const tb = table.tBodies[0]
        if (!tb) return null
        for (const r of tb.rows) {
            if (r.cells.length) return r
        }
        return null
    }

    function isVisibleCell(td) {
        if (td.style.display === 'none') return false
        const view = D.defaultView
        if (!view) return true
        return view.getComputedStyle(td).display !== 'none'
    }
})()
