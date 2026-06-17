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
plus a colspan-aware geometry check fail OFF to the native table on any mismatch.

We also add a "Columns" button to the Tracer toolbar (which may live in a sibling
frame); it opens a popup of checkboxes to hide/show columns, with Cancel/Apply.
Hiding a column sets its track var(s) to 0, display:none's its header cell, and
injects a nth-child rule that hides the matching body cells across all (and
future) rows. Hidden state persists like the widths do. */
;(function () {
    'use strict'

    //guard against double init in this (top) frame
    if (window.__peTracerResizeInit) return
    window.__peTracerResizeInit = true

    /* diagnostics: flip to false to silence. logs are tagged so you can filter
    this (top) frame's console by "pega-ext tracer" */
    const DEBUG = false
    const log = (...a) => DEBUG && console.log('[pega-ext tracer]', ...a)

    const MIN_COL = 24 //minimum width of a whole column (sum of its tracks), px
    const MIN_TRACK = 12 //minimum width of a single track, px (e.g. the "<--" cell)
    const MAX_COL = 1000 //maximum column width on drag, px (keeps handles reachable)
    const HANDLE_W = 8 //resize handle hit area, px
    const ALIGN_TOLERANCE = 6 //px drift allowed before the feature fails off
    const PERSIST_DEBOUNCE = 400 //ms - collapse a flurry of drags into one write
    const FRAME_WAIT_MS = 20000 //ms - give up looking for the TraceEvent frame
    const SETTINGS_KEY = 'tracer-colWidths-v2' //v2: per-column arrays of track widths
    const HIDDEN_KEY = 'tracer-hiddenCols' //column-visibility state (colKey -> true)
    const STYLE_ID = 'pe__tracer-resize-style'
    const HIDE_STYLE_ID = 'pe__tracer-hide-style'
    const TOOLBAR_STYLE_ID = 'pe__tracer-toolbar-style'
    const BTN_ID = 'pe__tracer-cols-btn'
    const POPUP_ID = 'pe__tracer-cols-popup'
    //declared up here (not by its use site) so it is initialized before the
    //synchronous bootstrap below can reach setupToolbar() - avoids a TDZ error
    //icon #8: two solid bars + one dashed - reads as "show / hide columns"
    const COLS_ICON =
        '<svg width="18" height="16" viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="3" y="4" width="4" height="16" rx="1" fill="currentColor"/>' +
        '<rect x="10" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 2.2"/>' +
        '<rect x="17" y="4" width="4" height="16" rx="1" fill="currentColor"/>' +
        '</svg>'

    //persists across subframe reloads:
    let widthsByKey = {} //column title -> [px per track] (persisted + live)
    let hiddenByKey = {} //column title -> true when the column is hidden
    let disabled = false //explicitly off, or after a fail-off teardown

    //reset for each tracer document (the subframe reloads give a fresh document):
    let D = null //the document that holds the tracer table
    let HEADER = null
    let cols = [] //header cells (one per <td>; "Step Page" has span 3)
    let tracks = [] //flat grid tracks (15 of them; the unit we actually size)
    let observer = null
    let validated = false
    let toolbarDoc = null //document holding the Tracer toolbar (maybe a sibling frame)
    let toolbarBtn = null //our injected "Columns" button (to detect a toolbar reload)
    let popupDocs = [] //documents the popup's outside-click listener is bound to

    let persistTimer = null
    let hidePersistTimer = null

    const raf = (cb) => window.requestAnimationFrame(cb)
    const clampWidth = (w) => Math.max(MIN_COL, Math.round(Number(w) || MIN_COL))
    const clampTrack = (w) => Math.max(MIN_TRACK, Math.round(Number(w) || MIN_TRACK))

    //parse a persisted value, returning a plain object or {} - never throws, and
    //never yields a scalar/array (which would later crash a property assignment)
    function safeParseObject(value) {
        if (!value) return {}
        try {
            const v = JSON.parse(value)
            return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
        } catch (e) {
            return {}
        }
    }

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
                    //parse each key independently and only accept a plain object,
                    //so a corrupt/scalar value under one key can neither throw
                    //(crashing the build) nor suppress loading of the other key
                    widthsByKey = safeParseObject(payload && payload[SETTINGS_KEY])
                    hiddenByKey = safeParseObject(payload && payload[HIDDEN_KEY])
                    log('settings loaded; widths=', widthsByKey, '| hidden=', hiddenByKey)
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

        //columns are fitted to the frame width, so re-fit on window resize
        if (D.defaultView) D.defaultView.addEventListener('resize', onResize)
    }

    let resizeTimer = null
    function onResize() {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
            resizeTimer = null
            if (!disabled && validated) {
                try {
                    applyVisibility() //re-scale the columns to the new frame width
                } catch (e) {
                    /* ignore - next change re-fills */
                }
            }
        }, 150)
    }

    /* idempotent, self-healing core. we hold off building until a real body row
    exists (so seeds + structure check have something to measure), then build the
    header colgroup + handles and every body colgroup. */
    function ensure() {
        if (disabled || !D) return

        HEADER = D.getElementById('traceEvent-TABLE')
        const row = getHeaderRow()
        if (!row) return

        /* the Columns button + popup work off the header alone, so offer them as
        soon as the header exists - no need to wait for the first rows to stream in.
        the resize/hide machinery still builds later, once a body row appears. */
        if (!cols.length) {
            cols = readHeaderCols(row)
            try {
                setupToolbar()
                applyVisibility() //apply persisted hides to the header right away
            } catch (e) {
                log('early column UI setup failed:', e && e.message)
            }
        }

        const built =
            !!HEADER.querySelector(':scope > colgroup[data-pe-cg]') &&
            !!row.querySelector('.pe__tracer-col-handle')

        if (!built) {
            //wait for a body data row: we need it to measure + validate first
            if (!bodyTables().some(firstDataRow)) return
            rebuildAll(row)
        } else {
            //header is fine; just colgroup any newly streamed body tables, then pin
            //them to the frame width so they line up with the (filled) header
            let added = false
            for (const t of bodyTables()) {
                if (!t.dataset.peCg) {
                    buildColgroup(t)
                    added = true
                }
            }
            if (added) pinTableWidths(availableWidth())
        }

        maybeValidate()

        /* re-add the toolbar button if its (possibly sibling) frame reloaded out
        from under us - a cheap connectivity check, no per-tick DOM search */
        if (validated && toolbarBtn && !toolbarBtn.isConnected) {
            toolbarBtn = null
            try {
                setupToolbar()
            } catch (e) {
                log('toolbar re-add failed:', e && e.message)
            }
        }
    }

    function rebuildAll(row) {
        /* clear any legacy hide style; the width vars (which carry our hides) are
        reset by removeArtifacts below, so measurement/structure-check see natural
        widths. applyVisibility() at the end of maybeValidate re-applies hides. */
        clearHideEffect()

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
            //the button was added early (off the header); now that tracks + the
            //nth-child map exist, apply hides fully (header + body). never let a
            //popup hiccup kill resize.
            try {
                setupToolbar() //idempotent - ensures the button after a rebuild
                applyVisibility()
            } catch (e) {
                log('column-visibility apply failed:', e && e.message)
            }
            log('alignment validated; feature active')
        } else {
            log(
                'header/body columns misaligned -> failing off (native restored)'
            )
            teardown()
        }
    }

    //----- the column / track model -----

    /* the header row is the canonical schema; cells map to one-or-more tracks.
    display:none cells occupy NO grid column, so they must be skipped - otherwise
    the track indices drift out of step with the rendered columns (and with the
    body, which hides a DIFFERENT set of cells), leaving dead columns at the end. */
    function readHeaderCols(row) {
        let ti = 0
        const out = []
        ;[...row.cells].forEach((td, i) => {
            if (!isVisibleCell(td)) return //not a grid column - ignore entirely
            const isData = td.classList.contains('eventTitleBarStyle')
            const span = td.colSpan || 1
            const title = (
                td.getAttribute('title') ||
                td.textContent ||
                ''
            ).trim()
            out.push({
                //key is the human title (persistence key, survives reorder);
                //the leading spacer cell has no class and is not resizable
                key: isData ? title || 'col' + i : 'spacer' + i,
                span,
                resizable: isData,
                px: measureCellPx(td),
                trackStart: ti,
                lastTrack: ti + span - 1,
                cellIndex: i, //real position in the header row (for hide/show toggling)
            })
            ti += span
        })
        return out
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
        //the table stays auto-width (= sum of its columns); applyVisibility scales
        //the columns to fill the frame, so the table fills without a fixed width
        //fighting the resize drags
        table.insertBefore(cg, table.firstChild)
        table.dataset.peCg = '1'
    }

    function addHandles(row) {
        for (const c of cols) {
            if (!c.resizable) continue

            const td = row.cells[c.cellIndex]
            if (!td || td.querySelector(':scope > .pe__tracer-col-handle')) continue

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

    /* fit-to-width resize: grow this column and shrink a neighbor by the SAME amount
    so the visible columns always sum to the frame width - the table never overflows
    (no horizontal scrollbar) and never leaves a gap. the neighbor is the next visible
    column; the rightmost column (whose handle sits on its left edge) trades with the
    previous one instead, so every column - including the last - is resizable. */
    function startDrag(e, c) {
        e.preventDefault()
        e.stopPropagation()

        const order = cols.filter((x) => x.resizable && !hiddenByKey[x.key])
        const idx = order.indexOf(c)
        if (idx < 0) return
        const isLast = idx === order.length - 1
        const give = isLast ? order[idx - 1] : order[idx + 1]
        if (!give || give === c) return //only one visible column - nothing to trade

        const myTracks = tracks.filter((t) => t.colKey === c.key)
        const giveTracks = tracks.filter((t) => t.colKey === give.key)
        const startX = e.clientX
        const myStart = myTracks.reduce((a, t) => a + t.px, 0)
        const giveStart = giveTracks.reduce((a, t) => a + t.px, 0)
        //last column's handle is on its LEFT edge, so dragging left should grow it
        const dir = isLast ? -1 : 1

        //full-doc overlay keeps the mouse stream from falling into inner elements
        const overlay = D.createElement('div')
        overlay.className = 'pe__tracer-resize-overlay'
        D.body.appendChild(overlay)
        D.body.classList.add('pe__tracer-resizing')

        const onMove = (ev) => {
            let delta = (ev.clientX - startX) * dir
            //keep both columns >= MIN_COL; their combined width stays constant
            delta = Math.max(MIN_COL - myStart, Math.min(giveStart - MIN_COL, delta))
            setColWidth(c, myTracks, myStart + delta)
            setColWidth(give, giveTracks, giveStart - delta)
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

    //set a column's total width, distributed across its track(s) proportionally
    //(single-track columns just take it; "Step Page" splits across its 3 tracks)
    function setColWidth(c, colTracks, total) {
        total = Math.max(MIN_COL, Math.round(total))
        const cur = colTracks.reduce((a, t) => a + t.px, 0) || colTracks.length
        let used = 0
        colTracks.forEach((t, p) => {
            const w =
                p === colTracks.length - 1
                    ? Math.max(MIN_TRACK, total - used)
                    : Math.max(MIN_TRACK, Math.round(total * (t.px / cur)))
            used += w
            t.px = w
            D.documentElement.style.setProperty(t.cssVar, w + 'px')
        })
        widthsByKey[c.key] = colTracks.map((t) => t.px)
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

    //----- column visibility (toolbar button + popup) -----

    /* clear any stale hide artifacts before a rebuild measures the table. we hide
    columns by setting their width var to 0 (NOT display:none, which would drop the
    cell from the grid and shift every following column), so there is no per-cell
    display state to undo - removeArtifacts clears the vars. we just empty the legacy
    body-hide rule in case an older build left one behind. crucially we do NOT touch
    cell display here: Pega hides its own columns (Thread, Int, ...) via display:none,
    and clearing that would wrongly resurrect them and break the structure check. */
    function clearHideEffect() {
        const style = D && D.getElementById(HIDE_STYLE_ID)
        if (style) style.textContent = ''
    }

    /* apply the current hidden/shown state and FIT the visible columns to the frame.
    every table is pinned to the frame width and the visible resizable columns are
    scaled proportionally so they sum to that width. a hidden column's track var is
    set to 0 (it stays in the grid, just collapsed), so its space is handed to the
    rest with no trailing gap. a fit-to-width drag trades width with a neighbor so
    the total never changes (no horizontal scrollbar). proportions are preserved
    across hide/show and window-resize, so the user's manual sizing survives. */
    function applyVisibility() {
        if (!D || !cols.length) return
        const row = getHeaderRow()

        //scale factor that makes the visible resizable columns fill the frame
        const avail = availableWidth()
        let fixedSum = 0 //visible non-resizable tracks (the leading spacer)
        let resizableSum = 0 //visible resizable tracks
        for (const t of tracks) {
            if (t.colKey && hiddenByKey[t.colKey]) continue
            if (t.resizable) resizableSum += t.px
            else fixedSum += t.px
        }
        const targetResizable = avail - fixedSum
        const factor =
            avail > 0 && resizableSum > 0 && targetResizable > 0
                ? targetResizable / resizableSum
                : 1

        //which visible column is rightmost - its handle moves to the left edge
        const order = cols.filter((c) => c.resizable && !hiddenByKey[c.key])
        const lastKey = order.length ? order[order.length - 1].key : null

        for (const c of cols) {
            if (!c.resizable) continue
            const hidden = !!hiddenByKey[c.key]
            const hcell = row && row.cells[c.cellIndex]
            if (hcell) {
                //never display:none our own cells (it shifts the grid); the var-0
                //below collapses the column in place. clear the OOTB max-width cap
                //so a shown column can grow to fill.
                hcell.style.display = ''
                hcell.style.maxWidth = 'none'
            }
            const handle = hcell && hcell.querySelector('.pe__tracer-col-handle')
            if (handle) {
                //a hidden (0-width) column must not show a draggable sliver
                handle.style.display = hidden ? 'none' : ''
                handle.classList.toggle('pe__left', c.key === lastKey)
            }

            for (const t of tracks) {
                if (t.colKey !== c.key) continue
                if (hidden) {
                    //keep t.px as the last real width so a later un-hide restores it
                    D.documentElement.style.setProperty(t.cssVar, '0px')
                } else {
                    //write the scaled width back so a drag starts from what's shown
                    const w = Math.max(MIN_TRACK, Math.round(t.px * factor))
                    t.px = w
                    D.documentElement.style.setProperty(t.cssVar, w + 'px')
                }
            }
            if (!hidden) {
                widthsByKey[c.key] = tracks
                    .filter((t) => t.colKey === c.key)
                    .map((t) => t.px)
            }
        }
        pinTableWidths(avail)
    }

    //pin every table box to the frame width so fixed-layout fills it exactly: the
    //visible columns share this width, so hiding one grows the rest with no gap
    function pinTableWidths(avail) {
        if (!avail) return
        const w = avail + 'px'
        if (HEADER) HEADER.style.width = w
        for (const t of bodyTables()) t.style.width = w
    }

    //width the (left-aligned) tables can occupy in the frame, minus a small margin
    function availableWidth() {
        if (!D || !HEADER) return 0
        const vw = D.documentElement.clientWidth || 0
        if (!vw) return 0 //not laid out yet; a later pass re-fills
        const left = HEADER.getBoundingClientRect().left
        return Math.max(0, vw - left - 6)
    }

    //the toolbar may live in a sibling frame (e.g. a MenuRow frame), so search around
    function findToolbarDoc() {
        const docs = []
        if (D) docs.push(D)
        if (!docs.includes(document)) docs.push(document)
        for (const f of document.querySelectorAll('frame, iframe')) {
            const d = safeContentDoc(f)
            if (d && !docs.includes(d)) docs.push(d)
        }
        for (const d of docs) {
            if (d && d.querySelector('.toolbarButton')) return d
        }
        return null
    }

    //add our "Columns" button next to the native toolbar buttons, once
    function setupToolbar() {
        const tdoc = findToolbarDoc()
        if (!tdoc) {
            log('toolbar not found; columns button not added')
            return
        }
        toolbarDoc = tdoc
        const existing = tdoc.getElementById(BTN_ID)
        if (existing) {
            toolbarBtn = existing
            return
        }

        const anchor = tdoc.querySelector('.toolbarButton')
        const cell = anchor && anchor.closest('td')
        const rowEl = cell && cell.parentElement
        if (!rowEl) return

        injectToolbarStyle(tdoc)

        const td = tdoc.createElement('td')
        td.className = 'pe__tracer-cols-cell'
        const btn = tdoc.createElement('div')
        btn.className = 'toolbarButton pe__tracer-cols-button'
        btn.id = BTN_ID
        btn.setAttribute('title', 'Show / hide columns')
        btn.innerHTML =
            '<div class="pe__tracer-cols-icon">' +
            COLS_ICON +
            '</div><div class="TracerIconStyling">Columns</div>'
        btn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePopup()
        })
        td.appendChild(btn)
        rowEl.appendChild(td)
        toolbarBtn = btn
        log('columns button added to toolbar')
    }

    function injectToolbarStyle(tdoc) {
        if (tdoc.getElementById(TOOLBAR_STYLE_ID)) return
        const s = tdoc.createElement('style')
        s.id = TOOLBAR_STYLE_ID
        s.textContent = [
            '.pe__tracer-cols-button { cursor: pointer; }',
            '.pe__tracer-cols-icon { display: flex !important; align-items: center; justify-content: center; height: 18px; margin: 0 auto; color: #fff; }',
            '.pe__tracer-cols-icon svg { display: block; }',
        ].join('\n')
        ;(tdoc.head || tdoc.documentElement).appendChild(s)
    }

    function togglePopup() {
        if (D.getElementById(POPUP_ID)) closePopup()
        else openPopup()
    }

    function onDocMouseDown(e) {
        const pop = D.getElementById(POPUP_ID)
        if (!pop || pop.contains(e.target)) return
        //ignore the Columns button itself - its own click handler does the toggle
        if (toolbarBtn && toolbarBtn.contains(e.target)) return
        closePopup()
    }

    function closePopup() {
        const pop = D && D.getElementById(POPUP_ID)
        if (pop) pop.remove()
        //the popup lives in D but the toolbar may be a sibling frame; dismiss from both
        for (const d of popupDocs) {
            d.removeEventListener('mousedown', onDocMouseDown, true)
        }
        popupDocs = []
    }

    //build a fresh popup over a working copy of hiddenByKey; only Apply commits it
    function openPopup() {
        const resizable = cols.filter((c) => c.resizable)
        if (!resizable.length) {
            log('no columns to show/hide yet')
            return
        }
        const draft = Object.assign({}, hiddenByKey)

        const pop = D.createElement('div')
        pop.id = POPUP_ID
        pop.className = 'pe__tracer-cols-popup'

        const hd = D.createElement('div')
        hd.className = 'pe__hd'
        hd.textContent = 'Columns'
        pop.appendChild(hd)

        const list = D.createElement('div')
        list.className = 'pe__list'
        for (const c of resizable) {
            const label = D.createElement('label')
            const cb = D.createElement('input')
            cb.type = 'checkbox'
            cb.checked = !draft[c.key]
            cb.addEventListener('change', () => {
                if (cb.checked) delete draft[c.key]
                else draft[c.key] = true
            })
            const span = D.createElement('span')
            span.textContent = c.key
            label.appendChild(cb)
            label.appendChild(span)
            list.appendChild(label)
        }
        pop.appendChild(list)

        const ft = D.createElement('div')
        ft.className = 'pe__ft'
        const cancel = D.createElement('button')
        cancel.textContent = 'Cancel'
        cancel.addEventListener('click', closePopup)
        const apply = D.createElement('button')
        apply.className = 'pe__apply'
        apply.textContent = 'Apply'
        apply.addEventListener('click', () => {
            hiddenByKey = draft
            applyVisibility()
            persistHidden()
            closePopup()
        })
        ft.appendChild(cancel)
        ft.appendChild(apply)
        pop.appendChild(ft)

        D.body.appendChild(pop)
        //dismiss on an outside click in EITHER the event doc or the (sibling) toolbar
        popupDocs = [D]
        if (toolbarDoc && toolbarDoc !== D) popupDocs.push(toolbarDoc)
        //defer binding so this opening click doesn't immediately close it
        raf(() => {
            for (const d of popupDocs) {
                d.addEventListener('mousedown', onDocMouseDown, true)
            }
        })
    }

    //debounced so it shares the same gentle write cadence as the widths
    function persistHidden() {
        if (hidePersistTimer) clearTimeout(hidePersistTimer)
        hidePersistTimer = setTimeout(() => {
            hidePersistTimer = null
            try {
                chrome.runtime.sendMessage({
                    type: 'settingsSet',
                    sender: 'pega-extension',
                    payload: {
                        key: HIDDEN_KEY,
                        value: JSON.stringify(hiddenByKey),
                    },
                })
            } catch (e) {
                /* ignore - state still applies for this session */
            }
        }, PERSIST_DEBOUNCE)
    }

    //remove our toolbar button + popup + hide styles (used on fail-off)
    function removeUi() {
        closePopup() //removes the popup + its outside-click listeners (all docs)
        if (toolbarDoc) {
            const btnCell = toolbarDoc.querySelector('.pe__tracer-cols-cell')
            if (btnCell) btnCell.remove()
            const ts = toolbarDoc.getElementById(TOOLBAR_STYLE_ID)
            if (ts) ts.remove()
        }
        toolbarBtn = null
        if (D) {
            const hs = D.getElementById(HIDE_STYLE_ID)
            if (hs) hs.remove()
        }
    }

    //----- validation (structural + colspan-aware geometry) -----

    //header grid-track count must match the body's visible grid-track count
    function structureMatches(row) {
        const table = bodyTables().find(firstDataRow)
        if (!table) return false
        const bodyRow = firstDataRow(table)
        //count VISIBLE cells on both sides: a display:none cell is not a grid column
        const headerTracks = [...row.cells]
            .filter(isVisibleCell)
            .reduce((s, td) => s + (td.colSpan || 1), 0)
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
            if (!isVisibleCell(td)) continue //display:none cells aren't grid columns
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
        removeUi()
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
            //pin the table boxes to a border-box width: applyVisibility sets each
            //table's width to the frame width, so border-box keeps borders inside
            //that width (no spurious horizontal scrollbar)
            '#traceEvent-TABLE, table[id^="traceEvent-TABLE-"] { box-sizing: border-box; }',
            //NB: do NOT set overflow-x on #traceEvent-CONTAINER - per the CSS
            //overflow rules that also forces overflow-y to auto, which clips the
            //rows out of view. leave the native container scrolling untouched.
            '.pe__tracer-col-handle { position: absolute; top: 0; right: 0; width: ' +
                HANDLE_W +
                'px; height: 100%; cursor: col-resize; user-select: none; z-index: 50; }',
            //the last visible column has no right neighbor to trade with, so its
            //handle sits on its LEFT edge (the boundary that actually moves)
            '.pe__tracer-col-handle.pe__left { right: auto; left: 0; }',
            '.pe__tracer-col-handle:hover { background: rgba(0, 135, 207, 0.45); }',
            '.pe__tracer-resize-overlay { position: fixed; inset: 0; z-index: 2147483646; cursor: col-resize; }',
            'body.pe__tracer-resizing { cursor: col-resize !important; user-select: none !important; }',
            //column show/hide popup (rendered into this event document). reset the
            //box model on the whole subtree so Pega's global td/div/button rules
            //can't squeeze it (that was clipping the Cancel/Apply labels)
            '.pe__tracer-cols-popup, .pe__tracer-cols-popup * { box-sizing: border-box; }',
            '.pe__tracer-cols-popup { position: fixed; top: 8px; right: 12px; z-index: 2147483647; width: 230px; padding: 8px 0; background: #fff; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.20); font: 13px/1.45 "Segoe UI", system-ui, sans-serif; }',
            '.pe__tracer-cols-popup .pe__hd { padding: 2px 14px 8px; font-weight: 600; }',
            '.pe__tracer-cols-popup .pe__list { max-height: 50vh; overflow-y: auto; padding: 4px 0; border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7; }',
            '.pe__tracer-cols-popup label { display: flex; align-items: center; gap: 9px; padding: 5px 14px; cursor: pointer; white-space: nowrap; }',
            '.pe__tracer-cols-popup label:hover { background: #f1f5f9; }',
            '.pe__tracer-cols-popup input { width: 15px; height: 15px; margin: 0; cursor: pointer; flex: none; }',
            '.pe__tracer-cols-popup .pe__ft { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px 2px; }',
            //hardened with !important + explicit sizing so inherited Pega button
            //styles cannot shrink/clip these
            '.pe__tracer-cols-popup button { flex: 0 0 auto !important; width: auto !important; min-width: 74px !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 6px 14px !important; font: 600 13px/1.2 "Segoe UI", system-ui, sans-serif !important; white-space: nowrap !important; overflow: visible !important; text-align: center !important; text-overflow: clip !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #fff !important; color: #334155 !important; cursor: pointer !important; }',
            '.pe__tracer-cols-popup button:hover { background: #f1f5f9 !important; }',
            '.pe__tracer-cols-popup button.pe__apply { background: #2563eb !important; border-color: #2563eb !important; color: #fff !important; }',
            '.pe__tracer-cols-popup button.pe__apply:hover { background: #1d4ed8 !important; }',
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
