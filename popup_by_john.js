'use strict'
function _pad(e) {
    return e < 10 ? '0' + e : e
}
function createUTCOffset(e) {
    var t = 0 < e.getTimezoneOffset() ? '-' : '+',
        e = Math.abs(e.getTimezoneOffset())
    return t + _pad(Math.floor(e / 60)) + ':' + _pad(e % 60)
}
function camelToKebab(e) {
    return e
        .replace(/[\w]([A-Z])/g, function (e) {
            return e[0] + '-' + e[1]
        })
        .toLowerCase()
}
$(document).ready(function () {
    var e = $('[data-switcher]'),
        s = $('.jpt-quote-list')
    function c() {
        var e = $(document.querySelector('.jpt-quote-list')),
            t = e.find('.jpt-quote-title'),
            o = e.find('.jpt-quote-link'),
            n = e.find('.jpt-quote-interval'),
            r = e.find('.jpt-quote-prefix'),
            i = []
        t.each(function (e, t) {
            t = $(t)
            i.push({
                title: t.val(),
                link: $(o.get(e)).val(),
                interval: $(n.get(e)).val(),
                prefix: $(r.get(e)).val(),
            })
        }),
            chrome.storage.local.set({ quoteList: i })
    }
    chrome.storage.local.get(['quoteList'], function (e) {
        var t = $(document.querySelector('.jpt-quote-list')),
            o = e.quoteList || [
                {
                    title: 'SPX',
                    link: 'https://ru.investing.com/indices/us-spx-500-futures',
                },
                {
                    title: 'Russell',
                    link: 'https://ru.investing.com/indices/smallcap-2000-futures',
                },
                {
                    title: 'NSDQ',
                    link: 'https://ru.investing.com/indices/nq-100-futures',
                },
            ],
            n = t.find('.jpt-quote-title'),
            r = t.find('.jpt-quote-link'),
            i = t.find('.jpt-quote-interval'),
            a = t.find('.jpt-quote-prefix')
        n.each(function (e, t) {
            t = $(t)
            o[e] || (o[e] = {}),
                t.val(o[e].title),
                $(r.get(e)).val(o[e].link).attr('title', o[e].link),
                $(i.get(e)).val(o[e].interval),
                $(a.get(e)).val(o[e].prefix)
        }),
            e.quoteList || c(),
            s.sortable({
                stop: function () {
                    c()
                },
            }),
            s.disableSelection(),
            s.on('input', function () {
                c()
            })
    }),
        [
            'termDelay',
            'pppUrl',
            'pppChannel',
            'pppText',
            'pppControlServer',
            'quoteInterval',
            'fastVolume',
            'colorVolume',
            'alorToken',
            'alorPortfolio',
            'alorAccount',
            'globalTrailing',
            'trailingTimeout',
            'stopSlippage',
            'signalsStopSlippage',
            'signalsTrailing',
            'signalsTakeProfit',
            'signalsLimit',
            'globalTakeProfit',
            'alpacaKey',
            'alpacaSecret',
            'alpacaUrl',
            'tsDepth',
        ].forEach(function (o) {
            chrome.storage.local.get([o], function (e) {
                var t = $('.jpt-tools-' + camelToKebab(o))
                e[o] && t.val(e[o]),
                    t.bind('input', function () {
                        var e
                        chrome.storage.local.set(
                            (((e = {})[o] = (this.value || '').trim()), e)
                        )
                    })
            })
        }),
        [
            'jpt-tools-fast-button-0',
            'jpt-tools-fast-button-1',
            'jpt-tools-fast-button-2',
            'jpt-tools-fast-button-3',
        ].forEach(function (o, e) {
            var n = 'fastButton' + e
            chrome.storage.sync.get(['fastButton' + e], function (e) {
                var t = $('.' + o)
                e[n] && t.val(e[n]),
                    t.bind('input', function () {
                        var e
                        chrome.storage.sync.set((((e = {})[n] = this.value), e))
                    })
            })
        }),
        e.each(function (e, t) {
            var o = $(t).attr('data-switcher')
            chrome.storage.sync.get([o], function (e) {
                var t = $('[data-switcher="' + o + '"]')
                t.prop('checked', !!e[o]),
                    t.bind('change', function () {
                        var e
                        chrome.storage.sync.set(
                            (((e = {})[o] = !!this.checked), e)
                        )
                    })
            })
        })
    var t = Array.from(
            document.querySelectorAll(
                'div[class^="src-modules-Feed-components-FeedHeader-FeedHeader-tab-"]'
            )
        ),
        o = $('.tab-pane')
    chrome.runtime.onMessage.addListener(function (e, t, o) {
        if (e && 'psid' === e.msg) {
            var n = $('.jpt-tools-report-ticker')
                    .val()
                    .split(',')
                    .map(function (e) {
                        return e.trim().toUpperCase()
                    })
                    .filter(function (e) {
                        return !!e
                    }),
                r = 1 === n.length ? n[0] : void 0,
                i = createUTCOffset((m = new Date())),
                a = document.querySelector('.jpt-tools-picker-to').value,
                s = document.querySelector('.jpt-tools-picker-from').value,
                c = (m.getMonth() + 1 + '').padStart(2, '0'),
                l = (m.getDate() + '').padStart(2, '0')
            ;(s = s
                ? s.replace(' ', 'T')
                : m.getFullYear() + '-' + c + '-' + l + 'T00:00:00'),
                (a = a
                    ? a.replace(' ', 'T')
                    : m.getFullYear() + '-' + c + '-' + l + 'T23:59:59'),
                (s += i),
                (a += i)
            var u = '2.0.0'
            return fetch(
                'https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=' +
                    u +
                    '&sessionId=' +
                    e.psid,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        to: a,
                        from: s,
                        brokerAccountId: e.accountId,
                        ticker: r,
                        overnightsDisabled: !0,
                    }),
                }
            )
                .then(function (e) {
                    return e.json()
                })
                .then(function (e) {
                    return (
                        1 < n.length &&
                            (e.payload.items = e.payload.items.filter(function (
                                e
                            ) {
                                return !!~n.indexOf(e.ticker)
                            })),
                        XLSX.utils.json_to_sheet(e.payload.items)
                    )
                })
                .then(function (e) {
                    var t = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(t, e, 'broker_rep'),
                        XLSX.writeFile(t, 'TinkoffReport.xlsx'),
                        chrome.notifications.create('', {
                            title: 'Отчёт по операциям',
                            message:
                                'Формирование отчета завершено, проверьте загрузки',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        })
                })
                .catch(function (e) {
                    return (
                        console.error(e),
                        chrome.notifications.create('', {
                            title: 'Отчёт по операциям',
                            message:
                                'Не удалось выгрузить отчёт. Повторите попытку позднее',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        }),
                        Promise.resolve()
                    )
                })
        }
        if (e && 'psid-summary' === e.msg) {
            var p = $('.jpt-tools-report-ticker')
                    .val()
                    .split(',')
                    .map(function (e) {
                        return e.trim().toUpperCase()
                    })
                    .filter(function (e) {
                        return !!e
                    }),
                d = 0 < p.length ? p[0] : void 0
            if (!d)
                return (
                    chrome.notifications.create('', {
                        title: 'Финансовый результат',
                        message: 'Необходимо указать тикер',
                        type: 'basic',
                        iconUrl: 'icons/T-48.png',
                    }),
                    Promise.resolve()
                )
            ;(i = createUTCOffset((m = new Date()))),
                (a = document.querySelector('.jpt-tools-picker-to').value),
                (s = document.querySelector('.jpt-tools-picker-from').value),
                (c = (m.getMonth() + 1 + '').padStart(2, '0')),
                (l = (m.getDate() + '').padStart(2, '0'))
            ;(s = s
                ? s.replace(' ', 'T')
                : m.getFullYear() + '-' + c + '-' + l + 'T00:00:00'),
                (a = a
                    ? a.replace(' ', 'T')
                    : m.getFullYear() + '-' + c + '-' + l + 'T23:59:59'),
                (s += i),
                (a += i)
            u = '2.0.0'
            return fetch(
                'https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=' +
                    u +
                    '&sessionId=' +
                    e.psid,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        to: a,
                        from: s,
                        brokerAccountId: e.accountId,
                        ticker: d,
                        overnightsDisabled: !0,
                    }),
                }
            )
                .then(function (e) {
                    return e.json()
                })
                .then(function (e) {
                    var t = ((e.payload || {}).items || []).filter(function (
                        e
                    ) {
                        return (
                            ((e || {}).ticker || '').toUpperCase() ===
                            d.toUpperCase()
                        )
                    })
                    if (t.length) {
                        var e = t[0].currency,
                            o = 0,
                            n = 0,
                            r = 0,
                            i = 0,
                            a = 0,
                            s = 0,
                            c = 0
                        return (
                            t.forEach(function (e) {
                                'decline' === e.status
                                    ? c++
                                    : 'done' === e.status &&
                                      ('Sell' === e.operationType
                                          ? (s++,
                                            i++,
                                            (o += Math.abs(e.commission || 0)),
                                            (a += Math.abs(e.payment || 0)))
                                          : e.operationType.startsWith('Buy') &&
                                            (s++,
                                            n++,
                                            (o += Math.abs(e.commission || 0)),
                                            (r += Math.abs(e.payment || 0))))
                            }),
                            alert(
                                'Сводка по тикеру ' +
                                    d +
                                    ':\nСделок на покупку/продажу: ' +
                                    n +
                                    '/' +
                                    i +
                                    '\nВсего совершённых/отменённых сделок: ' +
                                    s +
                                    '/' +
                                    c +
                                    '\nКомиссия: ' +
                                    o.toFixed(2) +
                                    ' ' +
                                    e +
                                    '\nСумма покупок: ' +
                                    r.toFixed(2) +
                                    '  ' +
                                    e +
                                    '\nСумма продаж: ' +
                                    a.toFixed(2) +
                                    ' ' +
                                    e +
                                    '\nФинансовый результат: ' +
                                    (Math.abs(a) - Math.abs(r)).toFixed(2) +
                                    ' ' +
                                    e +
                                    '\nС учётом комиссии: ' +
                                    (Math.abs(a) - Math.abs(r) - o).toFixed(2) +
                                    ' ' +
                                    e +
                                    '\n              '
                            ),
                            Promise.resolve()
                        )
                    }
                    return (
                        chrome.notifications.create('', {
                            title: 'Финансовый результат',
                            message: 'Нет операций за указанный период',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        }),
                        Promise.resolve()
                    )
                })
                .catch(function (e) {
                    return (
                        console.error(e),
                        chrome.notifications.create('', {
                            title: 'Финансовый результат',
                            message:
                                'Не удалось выгрузить сводку. Повторите попытку позднее',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        }),
                        Promise.resolve()
                    )
                })
        }
        if (e && 'psid-summary-xlsx' === e.msg) {
            var m,
                f = $('.jpt-tools-report-ticker')
                    .val()
                    .split(',')
                    .map(function (e) {
                        return e.trim().toUpperCase()
                    })
                    .filter(function (e) {
                        return !!e
                    }),
                r = 1 === f.length ? f[0] : void 0,
                i = createUTCOffset((m = new Date())),
                a = document.querySelector('.jpt-tools-picker-to').value,
                s = document.querySelector('.jpt-tools-picker-from').value,
                c = (m.getMonth() + 1 + '').padStart(2, '0'),
                l = (m.getDate() + '').padStart(2, '0')
            ;(s = s
                ? s.replace(' ', 'T')
                : m.getFullYear() + '-' + c + '-' + l + 'T00:00:00'),
                (a = a
                    ? a.replace(' ', 'T')
                    : m.getFullYear() + '-' + c + '-' + l + 'T23:59:59'),
                (s += i),
                (a += i)
            u = '2.0.0'
            return fetch(
                'https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=' +
                    u +
                    '&sessionId=' +
                    e.psid,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        to: a,
                        from: s,
                        brokerAccountId: e.accountId,
                        ticker: r,
                        overnightsDisabled: !0,
                    }),
                }
            )
                .then(function (e) {
                    return e.json()
                })
                .then(function (e) {
                    1 < f.length &&
                        (e.payload.items = e.payload.items.filter(function (e) {
                            return !!~f.indexOf(e.ticker)
                        }))
                    var e = e.payload.items,
                        n = {},
                        t = []
                    return (
                        e.forEach(function (e) {
                            var t, o
                            e.ticker &&
                                e.currency &&
                                ((o = e.ticker),
                                void 0 === n[o] &&
                                    (n[o] =
                                        (((t = {})['Тикер'] = o),
                                        (t['Валюта'] = e.currency),
                                        (t['Комиссия'] = 0),
                                        (t['Сумма покупок'] = 0),
                                        (t['Сумма продаж'] = 0),
                                        (t['Финансовый результат'] = 0),
                                        (t[
                                            'Финансовый результат с учётом комиссии'
                                        ] = 0),
                                        (t['Сделок на покупку'] = 0),
                                        (t['Сделок на продажу'] = 0),
                                        (t['Совершённых сделок'] = 0),
                                        (t['Отменённых сделок'] = 0),
                                        t)),
                                'decline' === e.status
                                    ? n[o]['Отменённых сделок']++
                                    : 'done' === e.status &&
                                      ('Sell' === e.operationType
                                          ? (n[o]['Сделок на продажу']++,
                                            n[o]['Совершённых сделок']++,
                                            (n[o]['Комиссия'] += Math.abs(
                                                e.commission || 0
                                            )),
                                            (n[o]['Сумма продаж'] += Math.abs(
                                                e.payment || 0
                                            )))
                                          : 'Buy' === e.operationType &&
                                            (n[o]['Сделок на покупку']++,
                                            n[o]['Совершённых сделок']++,
                                            (n[o]['Комиссия'] += Math.abs(
                                                e.commission || 0
                                            )),
                                            (n[o]['Сумма покупок'] += Math.abs(
                                                e.payment || 0
                                            )))))
                        }),
                        Object.keys(n).forEach(function (e) {
                            return t.push(n[e])
                        }),
                        t.forEach(function (e) {
                            ;(e['Финансовый результат'] =
                                e['Сумма продаж'] - e['Сумма покупок']),
                                (e['Финансовый результат с учётом комиссии'] =
                                    e['Сумма продаж'] -
                                    e['Сумма покупок'] -
                                    e['Комиссия'])
                        }),
                        XLSX.utils.json_to_sheet(t)
                    )
                })
                .then(function (e) {
                    var t = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(t, e, 'summary'),
                        XLSX.writeFile(t, 'TinkoffSummary.xlsx'),
                        chrome.notifications.create('', {
                            title: 'Финансовая сводка',
                            message:
                                'Формирование сводки завершено, проверьте загрузки',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        })
                })
                .catch(function (e) {
                    return (
                        console.error(e),
                        chrome.notifications.create('', {
                            title: 'Финансовая сводка',
                            message:
                                'Не удалось выгрузить сводку. Повторите попытку позднее',
                            type: 'basic',
                            iconUrl: 'icons/T-48.png',
                        }),
                        Promise.resolve()
                    )
                })
        }
    }),
        $('body').on(
            'click',
            'div[class^="src-modules-Feed-components-FeedHeader-FeedHeader-tab-"]',
            function (e) {
                o.css('display', 'none'),
                    $(t)
                        .children('.UITextSmall')
                        .removeClass(
                            'src-modules-Feed-components-FeedHeader-FeedTabButton-selected-3vIU4'
                        ),
                    $(o.get(t.indexOf(this))).css('display', 'block'),
                    $(this)
                        .children('.UITextSmall')
                        .addClass(
                            'src-modules-Feed-components-FeedHeader-FeedTabButton-selected-3vIU4'
                        )
            }
        ),
        new Picker(document.querySelector('.jpt-tools-picker-from'), {
            controls: !0,
            format: 'YYYY-MM-DD HH:mm:ss',
            headers: !0,
            date: new Date(),
            text: {
                title: 'Выберите дату и время',
                cancel: 'Отмена',
                confirm: 'Выбрать',
                year: 'Год',
                month: 'Месяц',
                day: 'День',
                hour: 'Час',
                minute: 'Минута',
                second: 'Секунда',
            },
        }),
        new Picker(document.querySelector('.jpt-tools-picker-to'), {
            controls: !0,
            format: 'YYYY-MM-DD HH:mm:ss',
            headers: !0,
            date: new Date(),
            text: {
                title: 'Выберите дату и время',
                cancel: 'Отмена',
                confirm: 'Выбрать',
                year: 'Год',
                month: 'Месяц',
                day: 'День',
                hour: 'Час',
                minute: 'Минута',
                second: 'Секунда',
            },
        }),
        $('.jpt-tools-download-report').on('click', function () {
            chrome.tabs.query({ currentWindow: !0, active: !0 }, function (e) {
                e = e[0]
                chrome.tabs.sendMessage(e.id, { type: 'psid' })
            })
        }),
        $('.jpt-tools-view-summary').on('click', function () {
            chrome.tabs.query({ currentWindow: !0, active: !0 }, function (e) {
                e = e[0]
                chrome.tabs.sendMessage(e.id, { type: 'psid-summary' })
            })
        }),
        $('.jpt-tools-view-summary-xlsx').on('click', function () {
            chrome.tabs.query({ currentWindow: !0, active: !0 }, function (e) {
                e = e[0]
                chrome.tabs.sendMessage(e.id, { type: 'psid-summary-xlsx' })
            })
        })
})
