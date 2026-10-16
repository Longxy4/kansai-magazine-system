/** Hover-revealed page rail using Pages' original images, TOC and navigation. */
function setupPageSidebar(pageFlip, config) {
    const sidebar = document.getElementById('toc-modal');
    const toggle = document.getElementById('toc-btn');
    const thumbnails = document.getElementById('thumbnail-list');
    const contents = document.getElementById('toc-list');
    const pageTab = document.getElementById('thumbnail-tab');
    const contentsTab = document.getElementById('contents-tab');
    if (!sidebar || !toggle || !thumbnails) return;
    const pages = window.FLIPBOOK_PAGES || [];
    let hideTimer = null;
    let selectedTab = 'pages';

    pages.forEach((page, index) => {
        const source = page.querySelector('img.page-image');
        if (!source) return;
        const link = document.createElement('a');
        link.className = 'page-thumbnail';
        link.href = `#page=${index + 1}`;
        link.dataset.targetPage = String(index + 1);
        link.setAttribute('aria-label', `ページ ${index + 1}`);
        const image = document.createElement('img');
        image.src = source.getAttribute('src');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 128;
        image.height = Math.round(128 / (config.pageAspectRatio || .707));
        const number = document.createElement('span');
        number.textContent = String(index + 1);
        link.append(image, number);
        thumbnails.appendChild(link);
    });

    const updateCurrentPages = (scroll = false) => {
        const index = pageFlip.getCurrentPageIndex();
        const double = pageFlip.getSettings().display === 'double';
        const lastVisible = double && index > 0 && index < pages.length - 1 ? index + 1 : index;
        const links = thumbnails.querySelectorAll('.page-thumbnail');
        links.forEach((link, i) => {
            link.classList.toggle('is-current', i >= index && i <= lastVisible);
            if (i === index) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const current = links[index];
        if (scroll && current && selectedTab === 'pages' && !sidebar.classList.contains('hidden')) {
            // Scroll only this list, without moving the book or the document.
            const top = current.offsetTop - thumbnails.offsetTop;
            if (top < thumbnails.scrollTop || top + current.offsetHeight > thumbnails.scrollTop + thumbnails.clientHeight) {
                thumbnails.scrollTop = Math.max(0, top - (thumbnails.clientHeight - current.offsetHeight) / 2);
            }
        }
    };
    const selectTab = tab => {
        selectedTab = tab;
        const showPages = tab === 'pages';
        thumbnails.hidden = !showPages;
        contents.hidden = showPages;
        pageTab.setAttribute('aria-selected', String(showPages));
        contentsTab.setAttribute('aria-selected', String(!showPages));
        pageTab.tabIndex = showPages ? 0 : -1;
        contentsTab.tabIndex = showPages ? -1 : 0;
        if (showPages) updateCurrentPages(true);
        else if (window.updateActiveTOC) window.updateActiveTOC(pageFlip.getCurrentPageIndex() + 1);
    };
    const clearHide = () => { clearTimeout(hideTimer); hideTimer = null; };
    const close = () => {
        clearHide();
        sidebar.classList.add('hidden');
        sidebar.setAttribute('aria-hidden', 'true');
        sidebar.inert = true;
        toggle.setAttribute('aria-expanded', 'false');
        if (sidebar.contains(document.activeElement)) document.activeElement.blur();
    };
    const open = () => {
        if (document.querySelector('dialog[open], .toc-modal:not(.hidden)')) return;
        clearHide();
        const wasHidden = sidebar.classList.contains('hidden');
        sidebar.classList.remove('hidden');
        sidebar.setAttribute('aria-hidden', 'false');
        sidebar.inert = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.getElementById('controls-panel').classList.remove('active');
        if (wasHidden) {
            selectTab(selectedTab);
            updateCurrentPages(true);
        }
    };
    const scheduleClose = () => {
        if (hideTimer !== null || sidebar.classList.contains('hidden')) return;
        hideTimer = setTimeout(() => {
            hideTimer = null;
            if (!sidebar.matches(':hover') && !sidebar.querySelector(':focus-visible')) close();
        }, 450);
    };
    window.openPageSidebar = open;
    window.closePageSidebar = close;
    toggle.addEventListener('click', open);
    sidebar.addEventListener('pointerenter', clearHide);
    sidebar.addEventListener('pointerleave', scheduleClose);
    sidebar.addEventListener('focusin', clearHide);
    sidebar.addEventListener('focusout', e => {
        if (!sidebar.contains(e.relatedTarget)) scheduleClose();
    });
    document.getElementById('toc-close-btn').addEventListener('click', close);
    pageTab.addEventListener('click', () => selectTab('pages'));
    contentsTab.addEventListener('click', () => selectTab('contents'));
    [pageTab, contentsTab].forEach(tab => tab.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        selectTab(selectedTab === 'pages' ? 'contents' : 'pages');
        (selectedTab === 'pages' ? pageTab : contentsTab).focus();
    }));
    if (!(config.tableOfContents || []).length) contentsTab.hidden = true;
    document.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        if (sidebar.contains(e.target) || toggle.contains(e.target)) open();
        else if (e.clientX <= 18 && !e.target.closest('a.pdf-link')) open();
        else scheduleClose();
    }, {passive: true});
    document.documentElement.addEventListener('pointerleave', scheduleClose);
    document.addEventListener('pointerdown', e => {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) close();
    }, true);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !sidebar.classList.contains('hidden')) {
            close();
            toggle.focus({preventScroll: true});
        }
    });
    pageFlip.on('flip', () => updateCurrentPages(true));
    window.addEventListener('resize', () => updateCurrentPages());
    close();
    selectTab('pages');
}
