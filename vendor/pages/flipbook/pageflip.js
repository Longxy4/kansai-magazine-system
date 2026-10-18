/**
 * Flipbook PageFlip Module
 * Controls the low-level StPageFlip integration, page preloading, and dimension calculations.
 */
/**
 * Preload images for the next spread to ensure smooth flipping
 * @param {number} currentIndex - Current page index (0-based)
 */
function preloadNextSpread(currentIndex) {
    const config = window.FLIPBOOK_CONFIG || {};
    const isDoubleSpread = pageFlip && pageFlip.getSettings().display === 'double';
    const pageCount = config.pageCount;

    // Calculate next pages to preload
    const pagesToPreload = isDoubleSpread
        ? [currentIndex - 2, currentIndex - 1, currentIndex, currentIndex + 1, currentIndex + 2, currentIndex + 3]
        : [currentIndex - 1, currentIndex, currentIndex + 1];

    pagesToPreload.forEach(idx => {
        if (idx >= 0 && idx < pageCount) {
            const allImages = document.querySelectorAll('.page-image');
            if (allImages[idx]) {
                const img = allImages[idx];
                if (img.src) {
                    // Decode the actual page, so both forward and backward turns
                    // can reuse its bitmap instead of decoding a new preloader.
                    if (img.decode) img.decode().catch(() => {});
                }
            }
        }
    });
}

function calculateDimensions(wrapper, config) {
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    // Use injected aspect ratio or fallback to A4-ish (0.707)
    const pageAspectRatio = config.pageAspectRatio || 0.707;

    // Detect display mode
    const isSingleMode = window.innerHeight > window.innerWidth;

    let width, height;

    if (isSingleMode) {
        width = wrapperWidth;
        height = width / pageAspectRatio;

        if (height > wrapperHeight) {
            height = wrapperHeight;
            width = height * pageAspectRatio;
        }
    } else {
        const targetAspectRatio = pageAspectRatio * 2;
        width = wrapperWidth;
        height = width / targetAspectRatio;

        if (height > wrapperHeight) {
            height = wrapperHeight;
            width = height * targetAspectRatio;
        }
    }

    return {
        width: Math.floor(width),
        height: Math.floor(height)
    };
}

// Single-page readers use a deterministic two-image slide. The Pages engine
// still owns page selection, links, history and desktop double-page curls.
function setupSinglePageTransition(book, container) {
    const originalNext = book.flipNext.bind(book), originalPrev = book.flipPrev.bind(book);
    const originalTurn = book.turnToPage.bind(book);
    let active = null;
    const cleanup = () => {
        const run = active;
        active = null;
        if (!run) return;
        run.animation?.cancel();
        run.layer.remove();
        book.getFlipController().setState('read');
    };
    book.cancelSingleTransition = cleanup;
    book.flipSinglePage = async direction => {
        if (active || book.getState() !== 'read' || isZoomed()) return;
        const from = book.getCurrentPageIndex(), to = from + direction;
        if (to < 0 || to >= book.getPageCount()) return;
        const source = book.getPage(from).getElement().querySelector('.page-image');
        const target = book.getPage(to).getElement().querySelector('.page-image');
        if (!source || !target) { originalTurn(to); return; }
        const bounds = book.getBoundsRect(), layer = document.createElement('div');
        layer.className = 'single-page-transition';
        layer.setAttribute('aria-hidden', 'true');
        layer.dataset.from = String(from + 1);
        layer.dataset.to = String(to + 1);
        Object.assign(layer.style, {left:`${bounds.left}px`, top:`${bounds.top}px`,
            width:`${bounds.pageWidth}px`, height:`${bounds.height}px`});
        const track = document.createElement('div');
        track.className = 'single-page-track';
        const images = (direction > 0 ? [source, target] : [target, source]).map((img, index) => {
            const copy = document.createElement('img');
            copy.src = img.currentSrc || img.src;
            copy.alt = '';
            copy.style.left = `${index * 100}%`;
            track.appendChild(copy);
            return copy;
        });
        const run = {layer, animation:null};
        active = run;
        book.getFlipController().setState('flipping');
        try {
            await Promise.all(images.map(img => img.decode()));
            if (active !== run) return;
            const start = direction > 0 ? 'translateX(0%)' : 'translateX(-100%)';
            const end = direction > 0 ? 'translateX(-100%)' : 'translateX(0%)';
            track.style.transform = start;
            layer.appendChild(track);
            container.appendChild(layer);
            run.animation = track.animate([{transform:start}, {transform:end}], {
                duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280,
                easing:'ease-in-out', fill:'forwards'
            });
            await run.animation.finished;
            if (active !== run) return;
            originalTurn(to);
            // Paint the committed page before removing the transition cover.
            book.getRender().drawFrame();
        } catch (error) {
            if (active === run) console.warn('Page transition could not complete:', error.message);
        } finally {
            if (active === run) cleanup();
        }
    };
    book.flipNext = corner => book.getSettings().display === 'single' ? book.flipSinglePage(1) : originalNext(corner);
    book.flipPrev = corner => book.getSettings().display === 'single' ? book.flipSinglePage(-1) : originalPrev(corner);
    book.turnToPage = index => { cleanup(); originalTurn(index); };
}
