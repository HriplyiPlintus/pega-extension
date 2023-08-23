const userPages = document.querySelector('#gridNode')

//TODO: брать из настроек
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

for (const p of pagesToMove) {
    movePagesToTop(p)
}
