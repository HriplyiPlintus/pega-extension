const getUserPages = () => {
    return document.querySelector('#gridNode')
}

let userPages = getUserPages()

//TODO: get from settings
const pagesToMove = [
    'pyWorkPage',
    'pyWorkCover',
    'newAssignPage',
    'pyDisplayHarness',
    'RH_1',
].reverse()

const movePagesToTop = (pageName) => {
    if (!pageName) return

    const pageToMove = userPages
        ?.querySelector(`li.gridRow div.oflowDiv span[title*="${pageName}"]`)
        ?.closest('li.gridRow')

    if (pageToMove) {
        userPages.insertBefore(pageToMove, userPages.firstChild)
    }
}

const setUpPinnedPages = () => {
    console.log('setUpPinnedPages')
    userPages = getUserPages()

    for (const p of pagesToMove) {
        movePagesToTop(p)
    }
}

setUpPinnedPages()

//mutation observer
const moCallback = (mutationList, observer) => {
    for (const mli of mutationList) {
        if (
            mli.type === 'childList' &&
            mli.addedNodes &&
            mli.addedNodes.length > 0 &&
            mli.removedNodes &&
            mli.removedNodes.length > 0
        ) {
            const foundNode = Array.from(mli.addedNodes).find(
                (n) => n.nodeName === 'TABLE' && n.id === 'EXPAND-OUTERFRAME'
            )

            if (foundNode) {
                setUpPinnedPages()
            }
        }
    }
}

const observer = new MutationObserver(moCallback)

observer.observe(
    document.querySelector('aside div[node_name="pzClipboardLeft"]'),
    { subtree: true, childList: true }
)
