function settingTabSwitchShortcut(context) {
    return {
        context: context,
        handlers: {
            onKeyDown: (e) => {
                console.log('this', this)
                e.preventDefault()

                const target = e.target
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

                    target.value = `${sysKeyDisplay}${key.toUpperCase()}`
                    //target.dataset.hotkey = `${sysKey}:${key}` //TODO: chnage to {syskey: '', key: ''}
                    //systemkey + key object in string
                    target.dataset.hotkey = JSON.stringify({
                        syskey: sysKey,
                        key: key,
                    })

                    //TODO: test
                    context.tabSwitchSettings.setShortcut(sysKey, key)

                    target.dataset.value = target.value
                    target.blur()
                } else if (
                    context.tabSwitchSettings[
                        context.OS_TYPE
                    ].allowedSysKeys.includes(key.toLowerCase())
                ) {
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
}
