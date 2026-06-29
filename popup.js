/* main assumption is that user will not change settings in different session while popup is open
getSettings freshs extension settings on load 

localStorage:
    os-type: mac/win

state is a state manager
settins data model - settings is synced settings    //TODO: use state manager
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

        //after this time the popup will open on default tab, otherwise it will open the same tab
        this.SAME_SESSION_TIMEOUT = 90000

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

    /* 'popup-state': {
        navbar: 'projects',
        'current-page': 'projects'
        'last-access-timestamp': <time_in_ms> } */
    /* state is a locally stored settings, not syncing between browsers
    used to store only popup state */
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

    //stores extension data in settings - essential to main extension purpose
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
        win: {
            allowedSysKeys: ['alt', 'control'],
            /* for win only ctrl and alt allowed, meta ignored */
            sysKeyDisplay: (meta, ctrl, alt) => {
                let result = {}
                if (ctrl) {
                    result = {
                        key: 'Ctrl',
                        display: 'Ctrl',
                    }
                } else if (alt) {
                    result = {
                        key: 'Alt',
                        display: 'Alt',
                    }
                }
                return result
            },
            sysKeysMapping: (key) => {
                return key === 'Control' ? 'Ctrl' : key === 'Alt' ? 'Alt' : key
            },
            valMsg: 'Include Ctrl or Alt',
        },
        setShortcut: (sysKey, key) => {
            console.log('setShortcut', `sysKey: ${sysKey}, key: ${key}`)
            let result = ''

            if (sysKey && key) {
                result = JSON.stringify({ sysKey, key })
            } else if (!sysKey && !key) {
                result = ''
            }

            /*
            //BUG settings for clean run is undefined
            if (!this.settings?.['tab-switch']) {
                this.settings['tab-switch'] = {}
            }

            //update cached settings
            this.settings['tab-switch'][this.OS_TYPE] = result
            */

            //this.setExtensionSettings('tab-switch', result)
            this.extensionSettings.set('tab-switch', result)
        },
        //BUG breaks for clean installation
        getShortcut: () => {
            console.log('getShortcut', this.settings)

            return this.extensionSettings.get('tab-switch') //this.getExtensionSetting('tab-switch')

            /* return JSON.parse(
                this.settings?.['tab-switch']?.[this.OS_TYPE] || null
            ) */
        },
    }

    /* Updates settings in sync storage and in local copy on [popup].settings
    also fires a message so background worker can hanle it and path to content scripts */
    extensionSettings = {
        set: (key, value) => {
            if (!key) {
                console.warn('empty settings key')
                return
            }

            //FIXED breaks for clean installation. TODO: not sure if this is required
            if (!this.settings?.[key]) {
                this.settings[key] = {}
            }

            //update cached settings
            if (key === 'tab-switch') {
                //OOPS, only for specific key
                this.settings[key][this.OS_TYPE] = value
            } else {
                this.settings[key] = value
            }

            chrome.storage.sync.set({ settings: this.settings })

            /* this message will update cached settings in background worker
            here we don't rely on sync, because local changed are sufficient */
            chrome.runtime.sendMessage({
                type: 'settingsUpdated',
                sender: 'pega-extension',
            })
        },
        get: (key) => {
            if (!key) {
                console.warn('empty settings key')
                return
            }

            let result = null

            if (key === 'tab-switch') {
                result = JSON.parse(
                    this.settings?.[key]?.[this.OS_TYPE] || null
                )
            } else {
                result = this.settings?.[key] || null
            }

            return result
        },
    }
    /* refreshes extension settings in sync storage
    all updates should happen from this API 
    also this method fires runtime message */
    /*
    setExtensionSettings(settingKey, settingValue) {
        if (!settingKey) {
            console.warn('empty settings key')
            return
        }

        //FIXED breaks for clean installation. TODO: not sure if this is required
        if (!this.settings?.[settingKey]) {
            this.settings[settingKey] = {}
        }

        //update cached settings
        if (settingKey === 'tab-switch') {
            //OOPS, only for specific key
            this.settings[settingKey][this.OS_TYPE] = settingValue
        } else {
            this.settings[settingKey] = settingValue
        }

        chrome.storage.sync.set({ settings: this.settings })

        /* this message will update cached settings in background worker
        here we don't rely on sync, because local changed are sufficient */
    /*
        chrome.runtime.sendMessage({
            type: 'settingsUpdated',
            sender: 'pega-extension',
        })
    }
    */

    /*
    //get setting from local copy of sync storage
    getExtensionSetting(settingKey) {
        if (!settingKey) {
            console.warn('empty settings key')
            return
        }

        let result = null

        if (settingKey === 'tab-switch') {
            result = JSON.parse(
                this.settings?.[settingKey]?.[this.OS_TYPE] || null
            )
        } else {
            this.settings?.[settingKey] || null
        }

        console.log('data from get extension settings api function', result)
        return result
    }
        */

    //get settings from storage and set to the settings on context
    async getSettings(callback) {
        //localStorage.setItem('popup-state', '')
        await chrome.storage.sync.get(['settings']).then((result) => {
            this.settings = result.settings ?? {} //fallback for clean installation

            console.log('getSettings', this.settings)

            if (callback) callback()
        })
    }

    /* initializes popup */
    initPopup() {
        //try to get last access timesamp
        const lastAccessTimout = new Date(
            this.state.getAttribute('last-access-timestamp')
        )

        /* if popup last time was accessed more then predefined timeout 
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
            ['projects', 'settings', 'contact'].includes(pageName)
        ) {
            //navbar value is the same as general pages names
            this.state.setState('navbar', pageName)
            if (!this.root.querySelector('.header-navbar')) {
                /*if current page is in the set of main pages but
                there is no navbar (probably first render) 
                then render bavbar and navbar content wrapper.
                also override root */
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

                const projects = this.settings?.projects || []

                if (projects.length === 0) {
                    //no projects — show empty state with icon and centered button
                    root.appendChild(
                        this.templateEngine({
                            tag: 'component',
                            name: 'workarea-noresults',
                            params: {
                                cls: 'layout-all-in-the-middle',
                                children: [
                                    {
                                        tag: 'img',
                                        cls: 'empty-state-icon',
                                        attrs: {
                                            src: './assets/img/add-project.svg',
                                            alt: 'Add project',
                                        },
                                    },
                                    {
                                        tag: 'button',
                                        cls: [
                                            'action-add-project',
                                            'action-add-project--centered',
                                        ],
                                        content: 'Add a project',
                                    },
                                ],
                            },
                        })
                    )

                    const addBtn = root.querySelector('.action-add-project')

                    addBtn?.addEventListener('click', () => {
                        console.log('add-project button clicked')
                        const emptyBlock = root.querySelector('.workarea-noresults')
                        if (emptyBlock) emptyBlock.remove()

                        root.appendChild(
                            this.templateEngine({
                                tag: 'component',
                                name: 'inline-project-form',
                            })
                        )
                    })
                } else {
                    //has projects — show list with add button
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

                    //container for project items
                    root.appendChild(
                        this.templateEngine({
                            tag: 'div',
                            cls: 'settings',
                        })
                    )

                    for (const project of projects) {
                        this.renderPopupSettingsItem({
                            id: project.id,
                            title: project.name,
                            url: project.url,
                            color: project.color,
                            tabTitle: project.tabTitle,
                            enabled: project.enabled,
                        })
                    }

                    //add project button
                    root.appendChild(
                        this.templateEngine({
                            tag: 'button',
                            cls: 'action-add-project',
                            content: 'Add a project',
                        })
                    )

                    root.querySelector('.action-add-project')
                        ?.addEventListener('click', () => {
                            console.log('add-project button clicked (list view)')
                            //clear everything, show only the form
                            root.innerHTML = ''
                            root.appendChild(
                                this.templateEngine({
                                    tag: 'component',
                                    name: 'inline-project-form',
                                })
                            )
                        })
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

                //probably redundant
                const eventTraceSettings = root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'setting-event-trace-persist-state',
                    })
                )

                console.log('!!!!!!! setting-dev-studio-enh rendering')
                //params dataCompId sets component id for example to control visibility
                root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'setting-dev-studio-enh',
                        params: {
                            dataCompId: 'dse',
                        },
                    })
                )

                /*
                const tabSwitchShortcut = root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'setting-tab-switch-shortcut',
                    })
                ) */

                break
            case 'contact':
                console.log('render page', pageName)
                //this.root.appendChild(this.buildComponent('header-navbar'))
                break
            case 'new-project':
                this.root.innerHTML = ''

                const newProjectPage = this.root.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'add-env-setting-wrapper',
                        content: [
                            {
                                tag: 'component',
                                name: 'settings-details-header',
                                params: {
                                    breadcrumbLink: 'Projects',
                                    breadcrumbTitle: 'New project',
                                    onClick: (e) => {
                                        const target = e.target
                                        if (
                                            target.closest(
                                                '.header-nav-arrow-back'
                                            ) ||
                                            target.closest('.header-nav-link')
                                        ) {
                                            this.state.setState(
                                                'current-page',
                                                'projects'
                                            )
                                            this.initPopup()
                                        }
                                    },
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
                                                                    for: 'project-url',
                                                                },
                                                                content: 'URL',
                                                            },
                                                            {
                                                                tag: 'input',
                                                                cls: 'setting-input-field',
                                                                attrs: {
                                                                    id: 'project-url',
                                                                    type: 'text',
                                                                    placeholder:
                                                                        'https://example.pegacloud.net/',
                                                                },
                                                            },
                                                        ],
                                                    },
                                                    {
                                                        tag: 'button',
                                                        cls: 'settings-details-action-save',
                                                        attrs: {
                                                            type: 'button',
                                                        },
                                                        content: {
                                                            tag: 'span',
                                                            content: 'Save',
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

                newProjectPage
                    .querySelector('.settings-details-action-save')
                    ?.addEventListener('click', () => {
                        const urlInput =
                            newProjectPage.querySelector('#project-url')
                        const url = urlInput?.value?.trim()

                        if (!url) return

                        const projects = this.settings?.projects || []
                        projects.push({
                            id: Date.now(),
                            url: url,
                            name: url,
                            enabled: true,
                        })

                        this.extensionSettings.set('projects', projects)

                        this.state.setState('current-page', 'projects')
                        this.initPopup()
                    })
                break
            default:
                console.log('did not find any and started default')
                break
        }
    }

    /* returns component. component is a small resusable part of a page. like in React
    paramsObj contains additional parameters: eventListersArr - is an arrya of objects
    {eventType, eventFu} */
    buildComponent(compName, paramsObj) {
        const HEX_RE = /^#[0-9a-fA-F]{3,6}$/
        let resultComponent = document.createDocumentFragment()

        //get array of classes
        let cls = paramsObj?.cls || []
        if (typeof cls === 'string') {
            cls = [cls]
        }

        let appendedElement = null

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
                                                    src: './assets/img/add-project.svg',
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
                                    src: './assets/img/add-project.svg',
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
                //TODO: replace with defined contract
                const dataCompId = paramsObj.dataCompId || ''
                const tabSwitchSettingControl =
                    popupUILib.settingTabSwitchShortcut(this, dataCompId)

                resultComponent.appendChild(tabSwitchSettingControl)

                break
            case 'setting-event-trace-persist-state':
                /* control to capture default width and height settings
                for tracer event window and many more - tracer-context-page */
                //loads from external file
                const tracerEventWindowEnh = popupUILib.tracerEventWindowEnh({
                    renderEngine: this.templateEngine.bind(this),
                    currentState: this.extensionSettings.get('tcp-enabled'),
                    setStateFu: this.extensionSettings.set,
                    stateAttr: 'tcp-enabled',
                })

                resultComponent.appendChild(tracerEventWindowEnh)
                break
            case 'setting-dev-studio-enh':
                //get data comp id from params. if empty set it to be current timestamp
                const dataCompIdMain = paramsObj.dataCompId ?? Date.now()
                const dataCompIdSwitchShortcut = dataCompIdMain + '__tab-switch'

                const tabSwitchComp = this.templateEngine({
                    tag: 'component',
                    name: 'setting-tab-switch-shortcut',
                    params: {
                        dataCompId: dataCompIdSwitchShortcut,
                    },
                })

                const devStudioEnhCurrState =
                    this.extensionSettings.get('dev-studio-enabled')

                if (!devStudioEnhCurrState) {
                    console.log('###', tabSwitchComp)
                    tabSwitchComp.firstChild.classList.add('pe__display-none')
                }

                //enables additional icons and ability to copy pzinskey and signature
                const devStudioEnh = popupUILib.devStudioEnh({
                    renderEngine: this.templateEngine.bind(this),
                    currentState: devStudioEnhCurrState,
                    setStateFu: (key, isEnabled) => {
                        this.extensionSettings.set(key, isEnabled)

                        const tsComp = this.root.querySelector(
                            `[data-comp-id="${dataCompIdSwitchShortcut}"]`
                        )

                        console.log('⚠️', tsComp)
                        if (isEnabled) {
                            tsComp?.classList.remove('pe__display-none')
                        } else {
                            tsComp?.classList.add('pe__display-none')
                        }
                    },
                    stateAttr: 'dev-studio-enabled',
                })
                resultComponent.appendChild(devStudioEnh)

                resultComponent.appendChild(tabSwitchComp)
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
                const linkText = paramsObj?.content || 'Settings'
                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'h2',
                        cls: 'header-nav-link',
                        content: [
                            {
                                tag: 'a',
                                content: linkText,
                            },
                        ],
                    })
                )
                break
            case 'settings-details-header':
                //whole header for settings details - breadcrumbs and arrow
                const breadcrumbLink = paramsObj?.breadcrumbLink || 'Settings'
                const breadcrumbTitle = paramsObj?.breadcrumbTitle || 'Set up Project'
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
                                params: { content: breadcrumbLink },
                            },
                            {
                                tag: 'component',
                                name: 'header-text',
                                params: { content: '/' },
                            },
                            {
                                tag: 'component',
                                name: 'header-text',
                                params: { content: breadcrumbTitle },
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
                const enabled = paramsObj?.enabled //controls the state of the toggle

                const toggleElementAttrs = { type: 'checkbox' }

                if (enabled) {
                    toggleElementAttrs.checked = true
                }

                //we're appending new child and store it in a separate variable to apply event listeners later
                appendedElement = resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'label',
                        cls: 'toggle-switch',
                        content: [
                            {
                                tag: 'input',
                                attrs: toggleElementAttrs,
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
            case 'color-palette':
                const paletteColors = [
                    '#E53935', '#8E24AA', '#3949AB', '#039BE5',
                    '#00897B', '#43A047', '#FFB300', '#F4511E',
                ]
                const selectedColorVal = paramsObj?.selected || ''
                //check if selected value is a custom color (not in palette)
                const isCustomColor =
                    selectedColorVal && !paletteColors.includes(selectedColorVal)

                const pickerWrapper = resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'color-picker',
                        content: [
                            {
                                tag: 'button',
                                cls: 'color-picker-trigger',
                                attrs: { type: 'button' },
                                content: [
                                    {
                                        tag: 'span',
                                        cls: 'color-picker-preview',
                                        attrs: {
                                            style: selectedColorVal
                                                ? `background-color: ${selectedColorVal}`
                                                : '',
                                        },
                                    },
                                    {
                                        tag: 'span',
                                        cls: 'color-picker-arrow',
                                        content: '▾',
                                    },
                                ],
                            },
                            {
                                tag: 'div',
                                cls: 'color-picker-dropdown',
                                content: [
                                    {
                                        tag: 'div',
                                        cls: 'color-picker-swatches',
                                        content: paletteColors.map(
                                            (color) => ({
                                                tag: 'span',
                                                cls:
                                                    color === selectedColorVal
                                                        ? [
                                                              'color-swatch',
                                                              'selected',
                                                          ]
                                                        : 'color-swatch',
                                                attrs: {
                                                    'data-color': color,
                                                    style: `background-color: ${color}`,
                                                },
                                            })
                                        ),
                                    },
                                    {
                                        tag: 'div',
                                        cls: 'color-picker-custom',
                                        content: [
                                            {
                                                tag: 'span',
                                                cls: 'color-picker-custom-preview',
                                                attrs: {
                                                    style: isCustomColor
                                                        ? `background-color: ${selectedColorVal}`
                                                        : '',
                                                },
                                            },
                                            {
                                                tag: 'input',
                                                cls: 'color-picker-custom-input',
                                                attrs: {
                                                    type: 'text',
                                                    placeholder: '#hex',
                                                    value: isCustomColor
                                                        ? selectedColorVal
                                                        : '',
                                                    maxlength: '7',
                                                },
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    })
                )

                const trigger = pickerWrapper.querySelector(
                    '.color-picker-trigger'
                )
                const dropdown = pickerWrapper.querySelector(
                    '.color-picker-dropdown'
                )
                const preview = pickerWrapper.querySelector(
                    '.color-picker-preview'
                )
                const customInput = pickerWrapper.querySelector(
                    '.color-picker-custom-input'
                )
                const customPreview = pickerWrapper.querySelector(
                    '.color-picker-custom-preview'
                )

                if (!selectedColorVal) {
                    preview.classList.add('empty')
                }

                const deselectSwatches = () => {
                    dropdown
                        .querySelectorAll('.color-swatch.selected')
                        .forEach((s) => s.classList.remove('selected'))
                }

                const selectColor = (color) => {
                    preview.style.backgroundColor = color
                    preview.classList.remove('empty')
                    deselectSwatches()
                }

                const clearColor = () => {
                    preview.style.backgroundColor = ''
                    preview.classList.add('empty')
                    deselectSwatches()
                    customInput.value = ''
                    customPreview.style.backgroundColor = ''
                }

                //toggle dropdown
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation()
                    dropdown.classList.toggle('open')
                })

                //close on outside click (use { once: false } on a scoped handler)
                const closeHandler = (e) => {
                    if (!pickerWrapper.contains(e.target)) {
                        dropdown.classList.remove('open')
                    }
                }
                document.addEventListener('click', closeHandler)
                //cleanup when element is removed from DOM
                new MutationObserver((_, obs) => {
                    if (!pickerWrapper.isConnected) {
                        document.removeEventListener('click', closeHandler)
                        obs.disconnect()
                    }
                }).observe(pickerWrapper.parentElement || document.body, { childList: true, subtree: true })

                //select swatch color
                dropdown
                    .querySelector('.color-picker-swatches')
                    .addEventListener('click', (e) => {
                        const swatch = e.target.closest('.color-swatch')
                        if (!swatch) return
                        e.stopPropagation()

                        const wasSelected =
                            swatch.classList.contains('selected')

                        if (wasSelected) {
                            clearColor()
                        } else {
                            selectColor(swatch.dataset.color)
                            swatch.classList.add('selected')
                            //clear custom input when picking swatch
                            customInput.value = ''
                            customPreview.style.backgroundColor = ''
                        }

                        dropdown.classList.remove('open')
                    })

                //custom hex input
                customInput.addEventListener('input', (e) => {
                    e.stopPropagation()
                    let val = e.target.value.trim()
                    if (val && !val.startsWith('#')) val = '#' + val

                    if (HEX_RE.test(val)) {
                        customPreview.style.backgroundColor = val
                        selectColor(val)
                    } else {
                        customPreview.style.backgroundColor = ''
                    }
                })

                //press Enter in custom input => close dropdown
                customInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        dropdown.classList.remove('open')
                    }
                })

                //prevent dropdown close when clicking inside
                customInput.addEventListener('click', (e) => {
                    e.stopPropagation()
                })
                break
            case 'inline-project-form':
                //inline form to add/edit a project
                //params: editId, editName, editUrl, editColor — if editId set, form is in edit mode
                const editId = paramsObj?.editId || null
                const editName = paramsObj?.editName || ''
                const editUrl = paramsObj?.editUrl || ''
                const editColor = paramsObj?.editColor || ''
                const editTabTitle = paramsObj?.editTabTitle || ''
                const isEditMode = !!editId

                const tabTitleInputAttrs = {
                    id: 'project-tab-title',
                    type: 'text',
                    placeholder: 'Tab title',
                    value: editTabTitle,
                }

                const formEl = resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'div',
                        cls: 'inline-project-form',
                        content: [
                            {
                                tag: 'div',
                                cls: 'form-setting-input',
                                content: [
                                    {
                                        tag: 'label',
                                        cls: 'input-label-left',
                                        attrs: { for: 'project-name' },
                                        content: 'Name',
                                    },
                                    {
                                        tag: 'input',
                                        cls: 'setting-input-field',
                                        attrs: {
                                            id: 'project-name',
                                            type: 'text',
                                            placeholder: 'My project',
                                            value: editName,
                                        },
                                    },
                                ],
                            },
                            {
                                tag: 'div',
                                cls: 'form-setting-input',
                                content: [
                                    {
                                        tag: 'label',
                                        cls: 'input-label-left',
                                        attrs: { for: 'project-url' },
                                        content: 'URL',
                                    },
                                    {
                                        tag: 'input',
                                        cls: 'setting-input-field',
                                        attrs: {
                                            id: 'project-url',
                                            type: 'text',
                                            placeholder:
                                                'https://example.pegacloud.net/',
                                            value: editUrl,
                                        },
                                    },
                                ],
                            },
                            {
                                tag: 'div',
                                cls: 'form-appearance-row',
                                content: [
                                    {
                                        tag: 'div',
                                        cls: ['form-appearance-field', 'form-appearance-field--color'],
                                        content: [
                                            {
                                                tag: 'component',
                                                name: 'color-palette',
                                                params: {
                                                    selected: editColor,
                                                },
                                            },
                                        ],
                                    },
                                    {
                                        tag: 'div',
                                        cls: 'form-appearance-divider',
                                    },
                                    {
                                        tag: 'div',
                                        cls: ['form-appearance-field', 'form-appearance-field--title'],
                                        content: [
                                            {
                                                tag: 'input',
                                                cls: 'setting-input-field',
                                                attrs: tabTitleInputAttrs,
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                tag: 'div',
                                cls: 'inline-project-form-actions',
                                content: [
                                    {
                                        tag: 'button',
                                        cls: 'settings-details-action-cancel',
                                        attrs: { type: 'button' },
                                        content: {
                                            tag: 'span',
                                            content: 'Cancel',
                                        },
                                    },
                                    {
                                        tag: 'button',
                                        cls: 'settings-details-action-save',
                                        attrs: { type: 'button' },
                                        content: {
                                            tag: 'span',
                                            content: 'Save',
                                        },
                                    },
                                ],
                            },
                        ],
                    })
                )

                //Cancel — re-render projects page
                formEl
                    .querySelector('.settings-details-action-cancel')
                    .addEventListener('click', () => {
                        console.log('cancel clicked')
                        this.buildPage('projects')
                    })

                //Save
                formEl
                    .querySelector('.settings-details-action-save')
                    .addEventListener('click', () => {
                        const nameInput = formEl.querySelector('#project-name')
                        const urlInput = formEl.querySelector('#project-url')
                        const customHex =
                            formEl.querySelector('.color-picker-custom-input')
                                ?.value?.trim() || ''
                        const swatchColor =
                            formEl.querySelector('.color-swatch.selected')
                                ?.dataset.color || ''
                        //custom input takes priority if it's a valid hex
                        const selectedColor =
                            HEX_RE.test(customHex)
                                ? customHex
                                : swatchColor
                        const name = nameInput?.value?.trim()
                        const url = urlInput?.value?.trim()
                        const tabTitle = formEl
                            .querySelector('#project-tab-title')
                            ?.value?.trim() || ''

                        console.log('save project:', {
                            name, url, color: selectedColor,
                            tabTitle, editId,
                        })

                        if (!url) return

                        const currentProjects =
                            this.settings?.projects || []

                        if (isEditMode) {
                            const project = currentProjects.find(
                                (p) => p.id === editId
                            )
                            if (project) {
                                project.name = name || url
                                project.url = url
                                project.color = selectedColor
                                project.tabTitle = tabTitle
                            }
                        } else {
                            currentProjects.push({
                                id: Date.now(),
                                url: url,
                                name: name || url,
                                color: selectedColor,
                                tabTitle: tabTitle,
                                enabled: true,
                            })
                        }

                        this.extensionSettings.set(
                            'projects',
                            currentProjects
                        )

                        console.log('project saved, re-rendering projects')
                        this.buildPage('projects')
                    })
                break
            default:
                break
        }

        const children = paramsObj?.children
        //expects an array of child elements
        if (children) {
            resultComponent.firstChild.appendChild(
                this.templateEngine(children)
            )
        }

        //attaches event listeners. all event listeners come from the ui library normally
        const eventListersArr = paramsObj?.eventListersArr
        if (eventListersArr && Array.isArray(eventListersArr)) {
            for (const el of eventListersArr) {
                if (
                    typeof el === 'object' &&
                    el.eventType &&
                    el.eventFu &&
                    typeof el.eventFu === 'function'
                ) {
                    appendedElement.addEventListener(el.eventType, el.eventFu)
                }
            }
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
                                            src: './assets/img/add-project.svg',
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
    renderPopupSettingsItem({ id, title, url, color, tabTitle, enabled }) {
        const settingsContainer = this.root.querySelector('.settings')

        //color indicator — only if color is set
        const titleContent = color
            ? [
                  {
                      tag: 'span',
                      cls: 'project-color-dot',
                      attrs: {
                          style: `background-color: ${color}`,
                      },
                  },
                  title,
              ]
            : title

        settingsContainer.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'layout-border',
                attrs: { 'data-project-id': id },
                content: [
                    {
                        tag: 'div',
                        cls: 'layout-stack',
                        content: [
                            {
                                tag: 'div',
                                cls: 'settings-item-content-title',
                                content: titleContent,
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
                                        cls: [
                                            'settings-item-action',
                                            'action-details',
                                        ],
                                        content: 'Details',
                                    },
                                    {
                                        tag: 'button',
                                        cls: [
                                            'settings-item-action',
                                            'action-remove',
                                        ],
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

        const projectCard = settingsContainer.querySelector(
            `[data-project-id="${id}"]`
        )

        //Remove button
        projectCard
            .querySelector('.action-remove')
            ?.addEventListener('click', () => {
                console.log('remove project:', id)
                const currentProjects = this.settings?.projects || []
                const updated = currentProjects.filter((p) => p.id !== id)
                this.extensionSettings.set('projects', updated)
                this.buildPage('projects')
            })

        //Enabled toggle — persist on/off state
        projectCard
            .querySelector('.toggle-switch input[type="checkbox"]')
            ?.addEventListener('change', (e) => {
                console.log('toggle project:', id, e.target.checked)
                const currentProjects = this.settings?.projects || []
                const project = currentProjects.find((p) => p.id === id)
                if (project) {
                    project.enabled = e.target.checked
                    this.extensionSettings.set('projects', currentProjects)
                }
            })

        //Details button — clear tab, show only edit form
        projectCard
            .querySelector('.action-details')
            ?.addEventListener('click', () => {
                console.log('edit project:', id)

                const root = this.root.querySelector('.navbar-tab-wrapper')
                root.innerHTML = ''
                root.appendChild(
                    this.templateEngine({
                        tag: 'component',
                        name: 'inline-project-form',
                        params: { editId: id, editName: title, editUrl: url, editColor: color, editTabTitle: tabTitle },
                    })
                )
            })
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

/* structure 2.0
[
    {
        "devStudio": {
            "color": "",
            "icon": "🏡",
            "title": "DEV"
        },
        "enabled": true,
        "id": 23421341234,
        "logs": {},
        "name": "SCI",
        "tracer": {
            "events": [
                {
                    "settings": "all_false",
                    "title": "Deselect all"
                }
            ]
        },
        "url": "https://srvcrp-digops-dt1.pegacloud.net/"
    }
]
*/

let popup = new Popup(document.querySelector('.popup'))
window._popup = popup
