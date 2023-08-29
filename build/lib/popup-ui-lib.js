//TODO: limit the interface
/*
get shortcut
if exists
    set input value - need just to display it
        so get formatted version
otherwise keep value empty

how to store shortcut?
{ostype, syskey, value}

so to set it use the same pattern but interface will be (syskey, key)
setShortcut(sysKey, key)
    {ostype, syskey, key}

allowedSysKeys: [array_of_syskeys] for each platform
win: ctrl, alt
mac: control, option, command ('alt', 'meta', 'control')

sysKeyDisplay
 */
/*
interface: markup bilder function, current settings, set new hotkey function
*/
function settingTabSwitchShortcut(context) {
    //markup with handlers
    const settings = {
        context: context,
        handlers: {
            onKeyDown: (e) => {
                /*
                the result of this function is to set: 
                input value, dataset.hotkey, set hotkey setting, dataset.value
                also sets value during kydown event
                value and dataset.hotkey 
                from tabSwitchSettings
                    [os_type].sysKeyDisplay
                    .setShortcut
                    [os_type].allowedSysKeys
                    [os_type].sysKeysMapping
                    [os_type].valMsg
                    getShortcut()
                */
                e.preventDefault()

                const target = e.target

                //most of the keys are in Key<key_in_upperCase> and we need only actual key or the whole name
                let key = e.code.includes('Key')
                    ? e.code.substring(3, 4)
                    : e.key

                key = key.length === 1 ? key.toLowerCase() : key

                const tabSwitchInputValMsg = target
                    .closest('.control-wrapper')
                    .querySelector('span.control-msg-alert')

                if (
                    /[a-z0-9]/.test(key) &&
                    key.length === 1 &&
                    (e.metaKey || e.ctrlKey || e.altKey)
                ) {
                    //happy path
                    const { key: sysKey, display: sysKeyDisplay } =
                        context.tabSwitchSettings[
                            context.OS_TYPE
                        ].sysKeyDisplay(e.metaKey, e.ctrlKey, e.altKey)

                    //input value: visible part
                    target.value = `${sysKeyDisplay}${key.toUpperCase()}`

                    //systemkey + key object in string: invisible part - actual setting
                    target.dataset.hotkey = JSON.stringify({
                        syskey: sysKey,
                        key: key,
                    })

                    //TODO: this should be a part of the interface (set new hotkey function)
                    context.tabSwitchSettings.setShortcut(sysKey, key)

                    //remember current value to allow to set it back in some cases
                    target.dataset.value = target.value
                    target.blur()
                } else if (
                    context.tabSwitchSettings[
                        context.OS_TYPE
                    ].allowedSysKeys.includes(key.toLowerCase())
                ) {
                    //allowed system key was pressed but there are no letter was pressed
                    target.value =
                        context.tabSwitchSettings[
                            context.OS_TYPE
                        ].sysKeysMapping(key)
                    target.dataset.pressedKey = key
                    tabSwitchInputValMsg.innerText = 'Type a letter'
                } else {
                    target.value = ''
                    tabSwitchInputValMsg.innerText =
                        context.tabSwitchSettings[context.OS_TYPE].valMsg //'Include Control, Option, or ⌘'
                }
            },
            onKeyUp: (e) => {
                e.preventDefault()

                const target = e.target
                const key = e.key

                if (
                    key.toLowerCase() ===
                        target.dataset.pressedKey?.toLocaleLowerCase() &&
                    target.dataset.value !== target.value
                ) {
                    target.value = ''
                    target
                        .closest('.control-wrapper')
                        .querySelector('span.control-msg-alert').innerText =
                        context.tabSwitchSettings[context.OS_TYPE].valMsg //'Include Control, Option, or ⌘'
                }
            },
            onBlur: (e) => {
                console.log('blur', e.target.dataset.hotkey)
                //removes or sets the value. after on focus the value is empty
                if (e.target.dataset.hotkey) {
                    e.target.value = e.target.dataset.value
                } else {
                    e.target.value = ''
                }
                e.target
                    .closest('.control-wrapper')
                    .querySelector('span.control-msg-alert').innerText = ''
            },
            onFocus: (e) => {
                e.target.value = ''
            },
            onClick: (e) => {
                e.preventDefault()

                const inputRel = e.target
                    .closest('.control-input-with-btn')
                    ?.querySelector('input')

                inputRel.value = ''
                inputRel.dataset.hotkey = ''
                inputRel.dataset.value = ''
                context.tabSwitchSettings.setShortcut('', '')
                inputRel.blur()
            },
        },
        markup: {
            tag: 'div',
            cls: 'setting-row-wrapper',
            content: {
                tag: 'div',
                cls: 'setting-item',
                content: [
                    {
                        tag: 'div',
                        content: [
                            {
                                tag: 'div',
                                cls: 'setting-item-label',
                                content:
                                    'Switch instantly between the two most recent tabs',
                            },
                            {
                                tag: 'div',
                                cls: 'setting-item-description',
                                content: [
                                    'Consider the list of ',
                                    {
                                        tag: 'a',
                                        cls: 'link-info',
                                        content: 'Pega OOTB shotcuts',
                                        attrs: {
                                            href: 'https://docs-previous.pega.com/sites/default/files/help_v718/definitions/s/shortcut.htm',
                                            target: '_blank',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        tag: 'div',
                        cls: ['setting-item-control', 'control-wrapper'],
                        content: [
                            {
                                tag: 'div',
                                cls: 'control-input-with-btn',
                                content: [
                                    {
                                        tag: 'input',
                                        cls: 'control-input',
                                        attrs: {
                                            type: 'text',
                                            placeholder: 'Type a shortcut',
                                            id: 'pega-extension__tab-switch-hotkey',
                                        },
                                    },
                                    {
                                        tag: 'button',
                                        cls: 'control-cross',
                                        attrs: { type: 'button' },
                                        content: {
                                            tag: 'img',
                                            attrs: {
                                                src: './assets/img/close.png',
                                                alt: 'X',
                                            },
                                        },
                                    },
                                ],
                            },
                            { tag: 'span', cls: 'control-msg-alert' },
                        ],
                    },
                ],
            },
        },
    }

    const controlElement = context.templateEngine(settings?.markup)

    const tabSwitchInput = controlElement.querySelector(
        '#pega-extension__tab-switch-hotkey'
    )

    //check if setting already exists
    let shortcut = context.tabSwitchSettings.getShortcut()
    console.log('existing shortcut', shortcut)

    if (shortcut) {
        //TODO: implement for win. for win it will be the same but just different expressions
        const sysKeyToDisplay = context.tabSwitchSettings[
            context.OS_TYPE
        ].sysKeyDisplay(
            shortcut.sysKey === 'Meta',
            shortcut.sysKey === 'Ctrl',
            shortcut.sysKey === 'Option'
        )

        //create separate function to display hotkey
        tabSwitchInput.value = `${
            sysKeyToDisplay.display
        }${shortcut.key.toUpperCase()}`

        tabSwitchInput.dataset.hotkey = JSON.stringify(shortcut)

        tabSwitchInput.dataset.value = tabSwitchInput.value //to display the value correctly

        console.log('init', tabSwitchInput.dataset.hotkey)
    }

    const controlActionBtn = tabSwitchInput.parentElement.querySelector(
        'button[type="button"]'
    )

    tabSwitchInput.addEventListener('keydown', settings.handlers.onKeyDown)

    tabSwitchInput.addEventListener('keyup', settings.handlers.onKeyUp)

    tabSwitchInput.addEventListener('blur', settings.handlers.onBlur)

    tabSwitchInput.addEventListener('focus', settings.handlers.onFocus)

    controlActionBtn.addEventListener('click', settings.handlers.onClick)

    return controlElement
}
