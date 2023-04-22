if (
    document.querySelector(
        'div[data-portalharnessinsname="Data-Portal-DesignerStudio!pzStudio"'
    )
) {
    console.log('🔥 good result')
    chrome.runtime.sendMessage({ script: 'dev-portal.js', styles: 'true' })
}
