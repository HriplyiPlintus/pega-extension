class Popup {
    constructor(htmlElement) {
        if (!(htmlElement instanceof HTMLElement)) {
            throw new Error('Unsupported root element')
        }

        this.root = htmlElement

        this.getInitialSettings = this.getInitialSettings.bind(this)

        this.renderSettingsScreen = this.renderSettingsScreen.bind(this)

        this.renderSettingsScreen()
    }

    state = {
        setState: (attribute, value) => {
            const currentState = JSON.parse(
                localStorage.getItem('popupState') || 'null'
            )

            currentState[attribute] = value

            currentState.localStorage.setItem('popupState', currentState)
        },
        getState: () => {
            return JSON.parse(localStorage.getItem('popupState') || '')
        },

        getAttribute: (attribute) => {
            const currentState = JSON.parse(
                localStorage.getItem('popupState') || 'null'
            )

            if (!currentState) return null

            return currentState[attribute]
        },
    }

    //returns page markup
    buildPage(pageName, paramsObj) {
        switch (pageName) {
            case 'settingsScreen':
                break
            default:
                break
        }
    }

    //returns component. component is a small resusable part of a page. like in React
    buildComponent(compName, paramsObj) {
        //let resultComponent = document.createElement('div')
        let resultComponent = document.createDocumentFragment()

        switch (compName) {
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
                                params: { content: 'Add Environment' },
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
            case 'popup-tab-header':
                //установка табы. сравнивается с title только для первичной отрисовки
                const currentTab =
                    this.state.getAttribute('navBarTab') || 'Envs'

                const title = paramsObj?.title

                const classArr = ['popup-tab-title']
                if (title === currentTab) {
                    classArr.push('selected')
                }

                if (currentTab === title) {
                }

                resultComponent.appendChild(
                    this.templateEngine({
                        tag: 'span',
                        cls: classArr,
                        content: title,
                    })
                )
                break
            default:
                break
        }

        const children = paramsObj?.children
        //ожидает МАССИВ дочерних элементов
        if (children) {
            const result = this.templateEngine(children)
            console.log('result', result.innerHTML)
            resultComponent.firstChild.appendChild(result)
        }

        return resultComponent
    }

    //get settings from storage and set to the settings on context
    async getInitialSettings() {
        await chrome.storage.sync.get(['settings']).then((result) => {
            this.settings = result.settings
        })
    }

    //render settings screen
    async renderSettingsScreen() {
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
        this.root.appendChild(
            this.templateEngine({
                tag: 'div',
                cls: 'popup-tab-title-wrapper',
                content: [
                    {
                        tag: 'component',
                        name: 'popup-tab-header',
                        attrs: {
                            'data-value': 'env',
                            'data-page': 'environments',
                        },
                        params: {
                            title: 'Envs',
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

        await this.getInitialSettings()

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
                                        content: 'Add Environment',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        )

        //Add Environment button on popup main sceen
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

        //экспериментальныая часть
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

//это только для теста было сделано, чтобы иметь хоть какие-то настройки
chrome.storage.sync.set({
    settings: [
        {
            id: 23421341234, //some timestemp
            url: 'https://srvcrp-digops-dt1.pegacloud.net/',
            name: 'Dev',
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

let popup = new Popup(document.querySelector('.popup'))
