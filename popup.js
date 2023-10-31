/* main assumption is that user will not change settings in different session while popup is open
getSettings gets fresh extension settings on load 

localStorage:
    os-type: mac/win

settins data model
{
    'tab-switch': {
        os_type: {}
    }
}
*/
class Popup {
    constructor(htmlElement) {
        if (!(htmlElement instanceof HTMLElement)) {
            throw new Error('Unsupported root element')
        }

        //get os type. try to get value from local storage first
        this.OS_TYPE = localStorage.getItem('os-type')

        if (!this.OS_TYPE) {
            let osType = navigator.userAgentData.platform.toLowerCase()
            if (osType.includes('mac')) {
                osType = 'mac'
            } else if (osType.includes('win')) {
                osType = 'win'
            }

            this.OS_TYPE = osType

            localStorage.setItem('os-type', this.OS_TYPE)
        }

        //after this time the popup will open on Projects tab, otherwise it will open the same tab
        this.SAME_SESSION_TIMEOUT = 30000

        setInterval(() => {
            this.state.setState('last-access-timestamp', Date.now())
        }, 2000)

        this.root = htmlElement

        this.getSettings = this.getSettings.bind(this)

        this.initPopup = this.initPopup.bind(this)

        this.initPopup()

        //this.renderSettingsScreen = this.renderSettingsScreen.bind(this)

        //this.renderSettingsScreen()
    }

    /*
    'popup-state': {
        navbar: 'projects',
        'current-page': 'projects'
        'last-access-timestamp': <time_in_ms>
    }
    */
    state = {
        setState: (attribute, value) => {
            let currentState = this.state.getState()

            if (!currentState) {
                currentState = {}
            }

            currentState[attribute] = value

            localStorage.setItem('popup-state', JSON.stringify(currentState))
        },
        getState: () => {
            return JSON.parse(localStorage.getItem('popup-state') || 'null')
        },

        getAttribute: (attribute) => {
            const currentState = this.state.getState()

            if (!currentState) return null

            return currentState[attribute]
        },
    }

    tabSwitchSettings = {
        mac: {
            allowedSysKeys: ['alt', 'meta', 'control'],
            sysKeyDisplay: (meta, ctrl, alt) => {
                let result = {}
                if (meta) {
                    result = {
                        key: 'Meta',
                        display: '⌘',
                    }
                } else if (ctrl) {
                    result = {
                        key: 'Ctrl',
                        display: '⌃',
                    }
                } else if (alt) {
                    result = {
                        key: 'Option',
                        display: '⌥',
                    }
                }
                return result
            },
            sysKeysMapping: (key) => {
                return key === 'Meta'
                    ? 'Command'
                    : key === 'Alt'
                    ? 'Option'
                    : key
            },
            valMsg: 'Include Control, Option, or ⌘',
        },
        win: {},
        setShortcut: (sysKey, key) => {
            let result = ''

            if (sysKey && key) {
                result = JSON.stringify({ sysKey, key })
            } else if (!sysKey && !key) {
                result = ''
            }

            if (!this.settings['tab-switch']) {
                this.settings['tab-switch'] = {}
            }

            //update cached settings
            this.settings['tab-switch'][this.OS_TYPE] = result

            this.setExtensionSettings()
        },
        getShortcut: () => {
            return JSON.parse(this.settings['tab-switch'][this.OS_TYPE] || null)
        },
    }

    //refreshes extension settings in sync storage. all updates should happen from this API
    setExtensionSettings() {
        chrome.storage.sync.set({ settings: this.settings })

        //this message will update cached settings in background worker
        chrome.runtime.sendMessage({ message: 'getSettings' })
    }

    //get settings from storage and set to the settings on context
    async getSettings(callback) {
        //localStorage.setItem('popup-state', '')
        await chrome.storage.sync.get(['settings']).then((result) => {
            this.settings = result.settings
            if (callback) callback()
        })
    }

    initPopup() {
        //try to get last access timeout value
        const lastAccessTimout = new Date(
            this.state.getAttribute('last-access-timestamp')
        )

        /* if popup last time was accessed more then predefined timeout constant
        show projects tab, otherwise open last time accessed page/navbar */
        if (
            Math.abs(new Date() - lastAccessTimout) >=
                this.SAME_SESSION_TIMEOUT ||
            !this.state.getAttribute('current-page')
        ) {
            this.state.setState('current-page', 'projects')
        }

        //get settings from storage and render main page
        this.getSettings(() => {
            this.buildPage(this.state.getAttribute('current-page'))
        })
    }

    //returns page markup
    buildPage(pageName, paramsObj) {
        //set current root. depends on current page and state
        let root = this.root

        console.log('pageName', pageName)

        //clean up navbar tab contents if current page is one of the main pages
        if (
            ['projects', 'settings', 'contact'].includes(
                this.state.getAttribute('current-page')
            )
        ) {
            //navbar value is the same as general pages names
            this.state.setState('navbar', pageName)
            if (!this.root.querySelector('.header-navbar')) {
                /*if current page is one of the set of main pages but
                there is not navbar (probably first render) 
                then render bavbar nad navbar content wrapper
                also override root
                */
                this.root.appendChild(this.buildComponent('header-navbar'))
                this.root.appendChild(this.buildComponent('navbar-tab-wrapper'))
            }
            root = this.root.querySelector('.navbar-tab-wrapper')
        }
        root.innerHTML = ''

        //set current page
        this.state.setState('current-page', pageName)

        console.log('current page ' + pageName, root)

        switch (pageName) {
            case 'projects':
                console.log('build projects page')

                if (!this.settings) {
                    //if there are no settings yet, show only button to set up a project
                    root.appendChild(
                        this.templateEngine({
                            tag: 'component',
                            name: 'workarea-noresults',
                            params: {
                                cls: 'layout-all-in-the-middle',
                                children: [
                                    {
                                        tag: 'div',
                                        content: 'Add a project',
                                    },
                                ],
                            },
                        })
                    )
                } else {
                    root.appendChild(
                        this.templateEngine({
                            tag: 'component',
                            name: 'navbar-tab-header',
                            params: {
                                children: [
                                    {
                                        tag: 'div',
                                        content: 'Configured projects',
                                    },
                                ],
                            },
                        })
                    )
                }
                break
            case 'settings':
                //settings screen
                console.log('render page', pageName)
                root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'navbar-tab-header',
                        params: {
                            children: [
                                { tag: 'div', content: 'General settings' },
                            ],
                        },
                    })
                )

                const tabSwitchShortcut = root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'setting-tab-switch-shortcut',
                    })
                )
                break
            case 'contact':
                console.log('render page', pageName)
                //this.root.appendChild(this.buildComponent('header-navbar'))
                break
            case 'new-project':
                //хз, нужен ли. мб можно в одном отображать и существующие настройки и новые
                break
            default:
                console.log('did not find any and started default')
                break
        }
    }

    //returns component. component is a small resusable part of a page. like in React
    buildComponent(compName, paramsObj) {
        let resultComponent = document.createDocumentFragment()

        //get array of classes
        let cls = paramsObj?.cls || []
        if (typeof cls === 'string') {
            cls = [cls]
        }

        switch (compName) {
            case 'header-navbar':
                //внутри билдит popup-tab-header
                const headerNavbar = this.templateEngine({
                    tag: 'div',
                    cls: 'header-navbar',
                    content: [
                        {
                            tag: 'component',
                            name: 'navbar-title',
                            params: {
                                title: 'Projects',
                                attrs: {
                                    'data-value': 'projects',
                                },
                            },
                        },
                        {
                            tag: 'component',
                            name: 'navbar-title',
                            params: {
                                title: 'Settings',
                                attrs: {
                                    'data-value': 'settings',
                                },
                            },
                        },
                        {
                            tag: 'component',
                            name: 'navbar-title',
                            params: {
                                title: 'Contact',
                                attrs: {
                                    'data-value': 'contact',
                                },
                            },
                        },
                    ],
                })

                //responsible for tab switch
                headerNavbar.addEventListener('click', (e) => {
                    e.preventDefault()

                    //get clicked tab as target
                    const target = e.target.matches('span.navbar-title')
                        ? e.target
                        : null
                    /*
                    const target =
                        e.target.closest('.navbar-title') ??
                        e.target.classList.contains('navbar-title')
                            ? e.target
                            : e.target.querySelector('.navbar-title')
                            */

                    if (target) {
                        if (
                            target.dataset.value !==
                            this.state.getState()?.['navbar']
                        ) {
                            //click on new menu item
                            for (const tab of headerNavbar.querySelectorAll(
                                '.navbar-title'
                            )) {
                                if (
                                    tab.dataset.value === target.dataset.value
                                ) {
                                    //select new
                                    tab.classList.add('selected')
                                    this.state.setState(
                                        'navbar',
                                        target.dataset.value
                                    )
                                    this.buildPage(tab.dataset.value)
                                } else {
                                    //deselect old
                                    tab.classList.remove('selected')
                                }
                            }
                        }
                    }
                })
                resultComponent.appendChild(headerNavbar)
                break
            case 'navbar-title':
                //get current tab value from state
                const currentTab = this.state.getAttribute('navbar')

                const { title, attrs } = paramsObj

                const classArr = ['navbar-title']
                if (attrs['data-value'] === currentTab) {
                    classArr.push('selected')
                }

                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'span',
                        cls: classArr,
                        attrs: attrs,
                        content: title,
                    })
                )
                break
            case 'navbar-tab-header':
                //header of navbar tab content
                console.log('navbar-tab-header building')
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'navbar-tab-header',
                        params: {
                            children: [
                                { tag: 'component', name: 'btn-setup-project' },
                            ],
                        },

                        /*
                        content: [
                            { tag: 'div', content: navBarHeaderTitle },
                            {
                                tag: 'div',
                                cls: 'popup-tab-header-actions',
                                content: [
                                    {
                                        tag: 'button',
                                        cls: [
                                            'popup-tab-header-actions-action',
                                            'action-add-env',
                                        ],
                                        content: [
                                            {
                                                tag: 'img',
                                                attrs: {
                                                    src: './assets/img/add_env.jpg',
                                                },
                                            },
                                            {
                                                tag: 'div',
                                                content: 'Set up Project',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],*/
                    })
                )
                break
            case 'navbar-tab-wrapper':
                //helps to cleanup tab content without whole page rerender
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'navbar-tab-wrapper',
                    })
                )
                break
            case 'workarea-default':
                //area with rounded borders
                cls.push('workarea-default')

                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls,
                    })
                )
                break
            case 'workarea-noresults':
                /* empty area. just a stub to create empty work area
                and add necessary classes */
                cls.push('workarea-noresults')

                //empty with a button in the center of the screen
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls,
                    })
                )
                break
            case 'workarea-empty':
                //just empty wrapper
                console.log('classes', cls)
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls,
                    })
                )
                break
            case 'setting-row-wrapper':
                //used to wrap specific set of settings, includes individual set of settings
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'setting-row-wrapper',
                    })
                )
                break
            case 'tabs-switch-setting':
                resultComponent.appendChild(this.templateEngine({}))
                break
            case 'btn-setup-project':
                console.log('btn-setup-project building')
                //button to set up project
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'button',
                        cls: [
                            'popup-tab-header-actions-action',
                            'action-add-env',
                        ],
                        content: [
                            {
                                tag: 'img',
                                attrs: {
                                    src: './assets/img/add_env.jpg',
                                },
                            },
                            {
                                tag: 'div',
                                content: 'Set up Project',
                            },
                        ],
                    })
                )
                break
            case 'setting-tab-switch-shortcut':
                //control to capture tab switch shortcut
                //loads from external file, depends on this function
                const tabSwitchSettingControl = settingTabSwitchShortcut(this)

                resultComponent.appendChild(tabSwitchSettingControl)
                break
            case 'header-nav-arrow-back':
                //back arrow for header breadcrumbs (but may be used in other scenarios as well)
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'button',
                        cls: 'header-nav-arrow-back',
                        content: [
                            {
                                tag: 'img',
                                attrs: {
                                    src: './assets/img/backarrow.svg',
                                },
                            },
                        ],
                    })
                )
                break
            case 'header-nav-link':
                //formatted as link
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'h2',
                        cls: 'header-nav-link',
                        content: [
                            {
                                tag: 'a',
                                content: 'Settings',
                            },
                        ],
                    })
                )
                break
            case 'settings-details-header':
                //whole header for settings details - breadcrumbs and arrow
                let wrapper = resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'settings-details-header',
                        content: [
                            {
                                tag: 'component',
                                name: 'header-nav-arrow-back',
                            },
                            {
                                tag: 'component',
                                name: 'header-nav-link',
                            },
                            {
                                tag: 'component',
                                name: 'header-text',
                                params: { content: '/' },
                            },
                            {
                                tag: 'component',
                                name: 'header-text',
                                params: { content: 'Set up Project' },
                            },
                        ],
                    })
                )

                const onClick = paramsObj?.onClick

                if (onClick) {
                    wrapper.addEventListener('click', function (event) {
                        onClick(event)
                    })
                }
                break
            case 'header-text':
                //regular header text with no action
                const content = paramsObj?.content

                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'h2',
                        cls: 'header-nav-text',
                        content: content,
                    })
                )
                break
            case 'toggle-switch':
                //toggle switch control
                const enabled = paramsObj?.enabled

                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'label',
                        cls: 'toggle-switch',
                        content: [
                            {
                                tag: 'input',
                                attrs: {
                                    type: 'checkbox',
                                    checked: enabled ? true : false,
                                },
                            },
                            { tag: 'span', cls: ['slider', 'round'] },
                        ],
                    })
                )
                break
            case 'layout-border':
                //все внутри устанавливается в строчку и добавляет рамку
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'layout-border',
                    })
                )
                break
            case 'layout-stack':
                //устанавливает контент в столбец
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'layout-stack',
                    })
                )
                break
            default:
                break
        }

        const children = paramsObj?.children
        //ожидает МАССИВ дочерних элементов
        if (children) {
            resultComponent.firstChild.appendChild(
                this.templateEngine(children)
            )
        }

        return resultComponent
    }

    //render settings screen
    async renderSettingsScreen_() {
        this.root.innerHTML = ''

        const onClickTab = (e) => {
            /* переключает табы. если нажата какая-то новая, то с текущей снимется класс select
            а новой он наоборот установится
            за то,
            */
            const target = e.target
            if (e.target.classList.contains('popup-tab-header')) {
                if (!target.classList.contains('selected')) {
                    for (let tab of target.parentNode.querySelector('span')) {
                        if (tab.classList.includes('selected')) {
                            tab.classList.remove('selected')
                        }
                    }

                    e.target.classList.add('selected')
                }
            }
        }
        //moved
        this.root.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'header-navbar-wrapper',
                content: [
                    {
                        tag: 'component',
                        name: 'popup-tab-header',
                        attrs: {
                            'data-value': 'env',
                            'data-page': 'environments',
                        },
                        params: {
                            title: 'Projects',
                        },
                    },
                    {
                        tag: 'component',
                        name: 'popup-tab-header',
                        attrs: {
                            'data-value': 'settings',
                        },
                        params: {
                            title: 'Settings',
                        },
                    },
                    {
                        tag: 'component',
                        name: 'popup-tab-header',
                        attrs: {
                            'data-value': 'contact',
                        },
                        params: {
                            title: 'Contact',
                        },
                    },
                ],
            })
        )

        await this.getSettings()

        let popupHeader = this.root.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'popup-tab-header',
                content: [
                    { tag: 'div', content: 'Configured environments' },
                    {
                        tag: 'div',
                        cls: 'popup-tab-header-actions',
                        content: [
                            {
                                tag: 'button',
                                cls: [
                                    'popup-tab-header-actions-action',
                                    'action-add-env',
                                ],
                                content: [
                                    {
                                        tag: 'img',
                                        attrs: {
                                            src: './assets/img/add_env.jpg',
                                        },
                                    },
                                    {
                                        tag: 'div',
                                        content: 'Set up Project',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        )

        //Set up Project button on popup main sceen
        popupHeader
            .querySelector(
                'button.popup-tab-header-actions-action.action-add-env'
            )
            .addEventListener('click', () => {
                //open new screen with environment details
                this.renderAddEnvironment()
            })

        this.root.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'settings',
            })
        )

        for (let setting of this.settings) {
            this.renderPopupSettingsItem({
                title: setting.name,
                url: setting.url,
                enabled: setting.enabled,
            })
        }
    }

    //open new screen with environment details
    renderAddEnvironment() {
        this.root.innerHTML = '' //clean up all inside root element

        function onClick(e) {
            const target = e.target

            if (
                target.closest('.header-nav-arrow-back') ||
                target.closest('.header-nav-link')
            ) {
                this.renderSettingsScreen()
            }
        }

        this.root.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'add-env-setting-wrapper',
                content: [
                    {
                        tag: 'component',
                        name: 'settings-details-header',
                        params: {
                            onClick: onClick.bind(this),
                        },
                    },
                    {
                        tag: 'component',
                        name: 'layout-border',
                        params: {
                            children: [
                                {
                                    tag: 'component',
                                    name: 'layout-stack',
                                    params: {
                                        children: [
                                            {
                                                tag: 'div',
                                                cls: 'form-setting-input',
                                                content: [
                                                    {
                                                        tag: 'label',
                                                        cls: 'input-label-left',
                                                        attrs: {
                                                            for: 'env-url',
                                                        },
                                                        content: 'URL',
                                                    },
                                                    {
                                                        tag: 'input',
                                                        cls: 'setting-input-field',
                                                        attrs: {
                                                            id: 'env-url',
                                                        },
                                                    },
                                                ],
                                            },
                                            {
                                                tag: 'button',
                                                cls: 'settings-details-action-delete',
                                                attrs: { type: 'submit' },
                                                content: {
                                                    tag: 'span',
                                                    content: 'Remove',
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
            })
        )
    }

    //renders settings list item
    renderPopupSettingsItem({ title, url, enabled }) {
        this.root.querySelector('.settings').appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'layout-border',
                content: [
                    {
                        tag: 'div',
                        cls: 'layout-stack',
                        content: [
                            {
                                tag: 'div',
                                cls: 'settings-item-content-title',
                                content: title,
                            },
                            {
                                tag: 'div',
                                cls: 'settings-item-content-url',
                                content: `${url}*`,
                            },
                            {
                                tag: 'div',
                                cls: 'settings-item-actions',
                                content: [
                                    {
                                        tag: 'button',
                                        cls: 'settings-item-action',
                                        content: 'Details',
                                    },
                                    {
                                        tag: 'button',
                                        cls: 'settings-item-action',
                                        content: 'Remove',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        tag: 'div',
                        cls: 'settings-item-status',
                        content: [
                            {
                                tag: 'component',
                                name: 'toggle-switch',
                                params: { enabled: enabled },
                            },
                        ],
                    },
                ],
            })
        )
    }

    //template engine
    templateEngine(block) {
        if (block === undefined || block === null || block === false) {
            return document.createTextNode('')
        }
        if (
            typeof block === 'string' ||
            typeof block === 'number' ||
            block === true
        ) {
            return document.createTextNode(block)
        }
        if (Array.isArray(block)) {
            const fragment = document.createDocumentFragment()

            block.forEach((element) => {
                fragment.appendChild(this.templateEngine(element))
            })

            return fragment
        }

        //experiment
        if (block.tag === 'component') {
            return this.buildComponent(block.name, block.params)
        }

        const result = document.createElement(block.tag)

        if (block.cls) {
            const classes = [].concat(block.cls)
            classes.forEach((cls) => {
                result.classList.add(cls)
            })
        }

        if (block.attrs) {
            const keys = Object.keys(block.attrs)

            keys.forEach((key) => {
                result.setAttribute(key, block.attrs[key])
            })
        }

        result.appendChild(this.templateEngine(block.content))

        return result
    }
}

/*
chrome.storage.sync.set({
    settings: {
        'tab-switch-settings': { 'meta-key': 'meta', 'os-type': 'mac' },
    },
})
*/

//chrome.storage.sync.set({ settings: {} })

chrome.storage.sync
    .get('settings')
    .then((result) => console.log('settins result', result))
//это только для теста было сделано, чтобы иметь хоть какие-то настройки
/*
chrome.storage.sync.set({
    settings: [
        {
            id: 23421341234, //some timestemp
            url: 'https://srvcrp-digops-dt1.pegacloud.net/',
            name: 'SCI',
            devStudio: {
                title: 'DEV',
                icon: '🏡',
                color: '',
            },
            logs: {},
            enabled: true,
            tracer: {
                events: [
                    {
                        title: 'Deselect all',
                        settings: 'all_false',
                    },
                ],
            },
        },
    ],
})
*/

let popup = new Popup(document.querySelector('.popup'))
