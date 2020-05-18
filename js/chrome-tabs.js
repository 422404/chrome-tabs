const TAB_CONTENT_MARGIN = 9
const TAB_CONTENT_OVERLAP_DISTANCE = 1

const TAB_OVERLAP_DISTANCE = (TAB_CONTENT_MARGIN * 2) + TAB_CONTENT_OVERLAP_DISTANCE

const TAB_CONTENT_MIN_WIDTH = 24
const TAB_CONTENT_MAX_WIDTH = 240

const TAB_SIZE_SMALL = 84
const TAB_SIZE_SMALLER = 60
const TAB_SIZE_MINI = 48

/**
 * @param {number} value
 * @param {number[]} array
 */
const closest = (value, array) => {
    let closest = Infinity
    let closestIndex = -1

    array.forEach((v, i) => {
        if (Math.abs(value - v) < closest) {
            closest = Math.abs(value - v)
            closestIndex = i
        }
    })

    return closestIndex
}

const tabTemplate = `
  <div class="chrome-tab" draggable="true">
    <div class="chrome-tab-dividers"></div>
    <div class="chrome-tab-background">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg"><defs><symbol id="chrome-tab-geometry-left" viewBox="0 0 214 36"><path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z"/></symbol><symbol id="chrome-tab-geometry-right" viewBox="0 0 214 36"><use xlink:href="#chrome-tab-geometry-left"/></symbol><clipPath id="crop"><rect class="mask" width="100%" height="100%" x="0"/></clipPath></defs><svg width="52%" height="100%"><use xlink:href="#chrome-tab-geometry-left" width="214" height="36" class="chrome-tab-geometry"/></svg><g transform="scale(-1, 1)"><svg width="52%" height="100%" x="-100%" y="0"><use xlink:href="#chrome-tab-geometry-right" width="214" height="36" class="chrome-tab-geometry"/></svg></g></svg>
    </div>
    <div class="chrome-tab-content">
      <div class="chrome-tab-favicon"></div>
      <div class="chrome-tab-title"></div>
      <div class="chrome-tab-close"></div>
    </div>
  </div>
`

export class ChromeTabData {
    /**
     * @param {string} title
     * @param {string} favicon
     */
    constructor(title, favicon) {
        this.title = title
        this.favicon = favicon
        /** @type {number} */
        this.id = null
        /** @type {string | number} */
        this.sourceInstanceId = null
    }
}

const defaultTabProperties = new ChromeTabData(
    'New tab',
    null
)

export class ChromeTabs {
    /**
     * @param {HTMLElement} el
     * @param {string | number} instanceId
     * @param {(tabEl: HTMLElement, tabData: ChromeTabData) => any} onTabDrag
     */
    init(el, instanceId, onTabDrag = () => ({})) {
        this.el = el
        this.nextTabId = 1
        this.instanceId = instanceId
        this.onTabDrag = onTabDrag
        this.el.setAttribute('data-chrome-tabs-instance-id', this.instanceId)

        this.setupTabDrop()
        this.setupCustomProperties()
        this.setupStyleEl()
        this.setupEvents()
        this.layoutTabs()
        this.setupDrag()
    }

    /**
     * @param {string} eventName 
     * @param {*} data
     */
    emit(eventName, data) {
        this.el.dispatchEvent(new CustomEvent(eventName, { detail: data }))
    }

    setupTabDrop() {
        /**
         * @param {DragEvent} e
         * @param {function} callback
         */
        let ensureTabButDifferentInstance = (e, callback) => {
            if (e.dataTransfer.types.includes('chrome-tabs/tab')
                    && !e.dataTransfer.types.includes(this.dropInstanceId())) {
                callback()
            }
        }

        let removeDropTarget = () => {
            this.tabDropEl.classList.remove('on-tab-drag-over')
            this.tabDropEl.style.pointerEvents = 'none'
        }


        /** @type {HTMLElement} */
        this.tabDropEl = this.el.querySelector('.chrome-tabs-tab-drop')

        if (this.tabDropEl) {
            this.tabDropEl.ondragenter = e => {
                ensureTabButDifferentInstance(e, () => {
                    this.tabDropEl.classList.add('on-tab-drag-over')
                })
            }

            this.el.ondragover = e => {
                e.preventDefault()
                ensureTabButDifferentInstance(e, () => {
                    // renders the drop target interactive
                    this.tabDropEl.style.pointerEvents = 'all'
                })
            }

            this.tabDropEl.ondragleave = e => {
                ensureTabButDifferentInstance(e, () => {
                    // renders the drop target non interactive
                    removeDropTarget()
                })
            }

            this.tabDropEl.ondrop = e => {
                ensureTabButDifferentInstance(e, () => {
                    const stringData = e.dataTransfer.getData('chrome-tabs/tab')
                    if (stringData) {
                        removeDropTarget()

                        /** @type {ChromeTabData} */
                        const data = JSON.parse(stringData)
                        const insertedTab = this.addTab(data)
                        this.emit('insertedTab', { insertedTab, tabData: { ...data } })
                    }
                })
            }
        }
    }

    setupCustomProperties() {
        this.el.style.setProperty('--tab-content-margin', `${TAB_CONTENT_MARGIN}px`)
    }

    setupStyleEl() {
        this.styleEl = document.createElement('style')
        this.el.appendChild(this.styleEl)
    }

    setupEvents() {
        window.addEventListener('resize', _ => {
            this.cleanUpPreviouslyDraggedTabs()
            this.layoutTabs()
        })

        let newTab = event => {
            if ([this.el, this.tabContentEl].includes(event.target)) this.addTab()
        }
        this.el.addEventListener('dblclick', newTab)
        this.el.addEventListener('auxclick', newTab)

        this.tabEls.forEach((tabEl) => this.setTabCloseEventListener(tabEl))
    }

    dropInstanceId() {
        return `chrome-tabs/source-id=${this.instanceId}`
    }

    get tabEls() {
        return Array.prototype.slice.call(this.el.querySelectorAll('.chrome-tab'))
    }

    get tabContentEl() {
        return this.el.querySelector('.chrome-tabs-content')
    }

    get tabContentWidths() {
        const numberOfTabs = this.tabEls.length
        const tabsContentWidth = this.tabContentEl.clientWidth
        const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * TAB_CONTENT_OVERLAP_DISTANCE
        const targetWidth = (tabsContentWidth - (2 * TAB_CONTENT_MARGIN) + tabsCumulativeOverlappedWidth) / numberOfTabs
        const clampedTargetWidth = Math.max(TAB_CONTENT_MIN_WIDTH, Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth))
        const flooredClampedTargetWidth = Math.floor(clampedTargetWidth)
        const totalTabsWidthUsingTarget = (flooredClampedTargetWidth * numberOfTabs) + (2 * TAB_CONTENT_MARGIN) - tabsCumulativeOverlappedWidth
        const totalExtraWidthDueToFlooring = tabsContentWidth - totalTabsWidthUsingTarget

        // TODO - Support tabs with different widths / e.g. "pinned" tabs
        const widths = []
        let extraWidthRemaining = totalExtraWidthDueToFlooring
        for (let i = 0; i < numberOfTabs; i += 1) {
            const extraWidth = flooredClampedTargetWidth < TAB_CONTENT_MAX_WIDTH && extraWidthRemaining > 0 ? 1 : 0
            widths.push(flooredClampedTargetWidth + extraWidth)
            if (extraWidthRemaining > 0) extraWidthRemaining -= 1
        }

        return widths
    }

    get tabContentPositions() {
        const positions = []
        const tabContentWidths = this.tabContentWidths

        let position = TAB_CONTENT_MARGIN
        tabContentWidths.forEach((width, i) => {
            const offset = i * TAB_CONTENT_OVERLAP_DISTANCE
            positions.push(position - offset)
            position += width
        })

        return positions
    }

    get tabPositions() {
        const positions = []

        this.tabContentPositions.forEach((contentPosition) => {
            positions.push(contentPosition - TAB_CONTENT_MARGIN)
        })

        return positions
    }

    layoutTabs() {
        const tabContentWidths = this.tabContentWidths

        this.tabEls.forEach((tabEl, i) => {
            const contentWidth = tabContentWidths[i]
            const width = contentWidth + (2 * TAB_CONTENT_MARGIN)

            tabEl.style.width = width + 'px'
            tabEl.removeAttribute('is-small')
            tabEl.removeAttribute('is-smaller')
            tabEl.removeAttribute('is-mini')

            if (contentWidth < TAB_SIZE_SMALL) tabEl.setAttribute('is-small', '')
            if (contentWidth < TAB_SIZE_SMALLER) tabEl.setAttribute('is-smaller', '')
            if (contentWidth < TAB_SIZE_MINI) tabEl.setAttribute('is-mini', '')
        })

        let styleHTML = ''
        this.tabPositions.forEach((position, i) => {
            styleHTML += `
        .chrome-tabs[data-chrome-tabs-instance-id="${ this.instanceId}"] .chrome-tab:nth-child(${i + 1}) {
          transform: translate3d(${ position}px, 0, 0)
        }
      `
        })
        this.styleEl.innerHTML = styleHTML
    }

    createNewTabEl() {
        const div = document.createElement('div')
        div.innerHTML = tabTemplate
        return div.firstElementChild
    }

    /**
     * @param {ChromeTabData} tabData
     * @param {{ animate: boolean, background: boolean }} config
     */
    addTab(tabData, { animate = true, background = false } = {}) {
        const tabEl = this.createNewTabEl()

        if (animate) {
            tabEl.classList.add('chrome-tab-was-just-added')
            setTimeout(() => tabEl.classList.remove('chrome-tab-was-just-added'), 500)
        }

        tabData = {
            ...defaultTabProperties,
            ...tabData,
            id: this.nextTabId++,
            sourceInstanceId: this.instanceId
        }
        this.tabContentEl.appendChild(tabEl)
        this.setTabCloseEventListener(tabEl)
        this.updateTab(tabEl, tabData)
        this.emit('tabAdd', { tabEl })
        if (!background) this.setCurrentTab(tabEl)
        this.cleanUpPreviouslyDraggedTabs()
        this.layoutTabs()
        this.setupDrag()

        tabEl.addEventListener('auxclick', () => { this.removeTab(tabEl) })

        return tabEl
    }

    /**
     * @param {HTMLElement} tabEl
     */
    setTabCloseEventListener(tabEl) {
        tabEl.querySelector('.chrome-tab-close').addEventListener('click', _ => this.removeTab(tabEl))
    }

    get activeTabEl() {
        return this.el.querySelector('.chrome-tab[active]')
    }

    hasActiveTab() {
        return !!this.activeTabEl
    }

    /**
     * @param {HTMLElement} tabEl
     */
    setCurrentTab(tabEl) {
        const activeTabEl = this.activeTabEl
        if (activeTabEl === tabEl) return
        if (activeTabEl) activeTabEl.removeAttribute('active')
        tabEl.setAttribute('active', '')
        this.emit('activeTabChange', { tabEl })
    }

    /**
     * @param {HTMLElement} tabEl
     */
    removeTab(tabEl) {
        if (tabEl === this.activeTabEl) {
            if (tabEl.nextElementSibling) {
                this.setCurrentTab(tabEl.nextElementSibling)
            } else if (tabEl.previousElementSibling) {
                this.setCurrentTab(tabEl.previousElementSibling)
            }
        }
        tabEl.parentNode.removeChild(tabEl)
        this.emit('tabRemove', { tabEl })
        this.cleanUpPreviouslyDraggedTabs()
        this.layoutTabs()
        this.setupDrag()
    }

    /**
     * @param {HTMLElement} tabEl
     * @param {ChromeTabData} tabData
     */
    updateTab(tabEl, tabData) {
        tabEl.$$chromeTabs = { data: tabData }

        tabEl.querySelector('.chrome-tab-title').textContent = tabData.title

        const faviconEl = tabEl.querySelector('.chrome-tab-favicon')
        if (tabData.favicon) {
            faviconEl.style.backgroundImage = `url('${tabData.favicon}')`
            faviconEl.removeAttribute('hidden', '')
        } else {
            faviconEl.setAttribute('hidden', '')
            faviconEl.removeAttribute('style')
        }

        if (tabData.id) {
            tabEl.setAttribute('data-tab-id', tabData.id)
        }
    }

    cleanUpPreviouslyDraggedTabs() {
        this.tabEls.forEach((tabEl) => tabEl.classList.remove('chrome-tab-was-just-dragged'))
    }

    setupDrag() {
        const tabEls = this.tabEls
        const tabPositions = this.tabPositions
        const tabStripOffsetX = this.el.getBoundingClientRect().left

        if (this.isDragging) {
            this.dragged.ondragend()
        }

        tabEls.forEach((tabEl, originalIndex) => {
            const originalTabPositionX = tabPositions[originalIndex]
            let initalPos = null
            let prevX = 0

            /** @param {PointerEvent} e */
            tabEl.onpointerdown = e => {
                this.setCurrentTab(tabEl)
                initalPos = [e.clientX, e.clientY]
            }

            tabEl.onpointerup = () => {
                initalPos = null
            }

            /** @param {DragEvent} e */
            tabEl.ondragstart = e => {
                this.isDragging = true
                this.dragged = tabEl
                // we don't want any drag image so we pass a blank canvas
                const canvas = document.createElement('canvas')
                canvas.width = 0
                canvas.height = 0
                e.dataTransfer.setDragImage(canvas, 0, 0)
                e.dataTransfer.setData('chrome-tabs/tab', JSON.stringify(
                    {
                        ...this.onTabDrag(tabEl, tabEl.$$chromeTabs.data),
                        ...tabEl.$$chromeTabs.data
                    }
                ))
                // Workaround to pass instance id even so we can only access data when dropped
                e.dataTransfer.setData(this.dropInstanceId(), '')
            }

            /** @param {DragEvent} e */
            tabEl.ondragend = e => {
                this.isDragging = false
                const currentX = originalTabPositionX + (e.clientX - initalPos[0])

                // Animate dragged tab back into its place
                requestAnimationFrame(_ => {
                    tabEl.style.left = '0px'
                    tabEl.style.transform = `translate3d(${currentX}px, 0, 0)`

                    requestAnimationFrame(_ => {
                        tabEl.classList.remove('chrome-tab-is-dragging')
                        this.el.classList.remove('chrome-tabs-is-sorting')

                        tabEl.classList.add('chrome-tab-was-just-dragged')

                        requestAnimationFrame(_ => {
                            tabEl.style.transform = ''

                            this.layoutTabs()
                            this.setupDrag()
                        })
                    })
                })
            }

            /** @param {DragEvent} e */
            tabEl.ondrag = e => {
                // Avoid responding to a last drag event with coordinates (0, 0)
                if (e.clientX !== 0 || e.clientX === 0 && prevX < 100) {
                    prevX = e.clientX

                    tabEl.classList.add('chrome-tab-is-dragging')
                    this.el.classList.add('chrome-tabs-is-sorting')

                    const tabEls = this.tabEls
                    const currentIndex = tabEls.indexOf(tabEl)

                    const currentTabPositionX = originalTabPositionX + (e.clientX - initalPos[0])
                    const destinationIndexTarget = closest(currentTabPositionX, tabPositions)
                    const destinationIndex = Math.max(0, Math.min(tabEls.length, destinationIndexTarget))

                    if (currentIndex !== destinationIndex) {
                        this.animateTabMove(tabEl, currentIndex, destinationIndex)
                    }

                    const translateX = e.clientX - initalPos[0]
                    tabEl.style.left = `${originalTabPositionX}px`
                    tabEl.style.transform = `translate3d(${translateX}px, 0, 0)`
                }
            }
        })
    }

    /**
     * @param {HTMLElement} tabEl
     * @param {number} originIndex
     * @param {number} destinationIndex
     */
    animateTabMove(tabEl, originIndex, destinationIndex) {
        if (destinationIndex < originIndex) {
            tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex])
        } else {
            tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex + 1])
        }
        this.emit('tabReorder', { tabEl, originIndex, destinationIndex })
        this.layoutTabs()
    }
}
