if (
    document.querySelector(
        'div[data-portalharnessinsname="Data-Portal-DesignerStudio!pzStudio"'
    )
) {
    chrome.runtime.sendMessage({ script: 'dev-portal.js', styles: 'true' })
}
