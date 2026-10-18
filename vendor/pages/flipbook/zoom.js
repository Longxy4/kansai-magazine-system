/**
 * Flipbook Zoom Module
 * Implements high-resolution physical zoom and panning logic with viewport boundary enforcement.
 */
/**
 * Apply zoom and pan transforms to the container
 */
/**
 * Apply zoom and pan transforms to the container
 * @param {boolean} isPanOnly - If true, skip expensive resizing operations and only apply translation
 */
function updateTransform(isPanOnly = false) {
    const wrapper = document.getElementById('flipbook-wrapper');
    const container = document.getElementById('flipbook-container');

    if (!wrapper || !container) return;

    if (BOOK_WIDTH_AT_1X === 0) {
        BOOK_WIDTH_AT_1X = wrapper.clientWidth;
        BOOK_HEIGHT_AT_1X = wrapper.clientHeight;
    }

    // Constrain pan
    if (isZoomed()) {
        // Add a small buffer (e.g. 50px) to allow reaching the edges easily
        const buffer = 50;
        const maxPanX = Math.max(0, (BOOK_WIDTH_AT_1X * zoom - wrapper.clientWidth) / 2) + buffer;
        const maxPanY = Math.max(0, (BOOK_HEIGHT_AT_1X * zoom - wrapper.clientHeight) / 2) + buffer;
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    } else {
        panX = 0;
        panY = 0;
    }

    // Apply transform
    // We always set width/height to ensure consistency, but layout thrashing should be minimal if values don't change
    // However, dispatching 'resize' is VERY expensive.

    if (!isPanOnly) {
        container.style.width = `${BOOK_WIDTH_AT_1X * zoom}px`;
        container.style.height = `${BOOK_HEIGHT_AT_1X * zoom}px`;
    }

    container.style.transform = `translate(${panX}px, ${panY}px)`;

    if (!isPanOnly) {
        // Force StPageFlip to update its size
        window.isProgrammaticResize = true;
        window.dispatchEvent(new Event('resize'));
        window.isProgrammaticResize = false;

        // Update EPUB content scale immediately to prevent visual glitches
        updateEpubContentScale();
    }

    // Update cursor and disable/enable flipping
    // Only verify this on zoom change or start/end, not every frame of pan?
    // Doing it here is safe but we can skip if isPanOnly to save DOM writes
    if (!isPanOnly) {
        if (isZoomed()) {
            wrapper.style.cursor = 'grab';

            // Native library locks (supported after our custom lib build)
            if (window.pageFlip) {
                const settings = window.pageFlip.getSettings();
                settings.useMouseEvents = false;
                settings.showPageCorners = false;
            }
        } else {
            wrapper.style.cursor = 'default';

            if (window.pageFlip) {
                const settings = window.pageFlip.getSettings();
                settings.useMouseEvents = true;
                settings.showPageCorners = true;
            }
        }
    }

    window.currentZoom = zoom;
    // updateImageSizes() is now called with debounce in zoom handler
}

// Touch input is owned here, before PagesEngine's delayed touch handlers.
// Rendering, page turns, pan bounds and final zoom still use the Pages modules.
function setupTouchGestures(wrapper, slider, label, revealControls = () => {}) {
    const container = document.getElementById('flipbook-container');
    let gesture = null, pendingTap = null, suppressClickUntil = 0;
    const point = t => ({x:t.clientX, y:t.clientY});
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = ts => ({x:(ts[0].clientX + ts[1].clientX) / 2,
        y:(ts[0].clientY + ts[1].clientY) / 2});
    const center = () => {
        const r = wrapper.getBoundingClientRect();
        return {x:r.left + r.width / 2, y:r.top + r.height / 2};
    };
    const blocked = target => target.closest?.('button, input, select, textarea, dialog, .page-sidebar, .toc-modal, #controls-panel, #top-controls-panel') ||
        document.querySelector('dialog[open], .toc-modal:not(.hidden), .page-sidebar:not(.hidden)');
    const consume = e => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); };
    const cancelTap = () => { if (pendingTap) clearTimeout(pendingTap.timer); pendingTap = null; };
    const syncControls = () => {
        if (slider) slider.value = String(zoom);
        if (label) label.textContent = `${Number(zoom.toFixed(2))}x`;
        window.currentZoom = zoom;
    };
    const commitZoom = () => {
        updateTransform();
        syncControls();
        debouncedUpdateImageSizes();
    };
    const zoomAt = (next, p) => {
        const c = center(), ratio = next / zoom;
        panX = p.x - c.x - (p.x - c.x - panX) * ratio;
        panY = p.y - c.y - (p.y - c.y - panY) * ratio;
        zoom = next;
        commitZoom();
    };
    const turn = direction => {
        if (!pageFlip || isZoomed() || pageFlip.getState() !== 'read' || blocked(wrapper)) return;
        if (direction < 0) pageFlip.flipPrev();
        if (direction > 0) pageFlip.flipNext();
    };
    const finish = () => {
        if (gesture?.mode === 'pinch') commitZoom();
        gesture = null;
        isPanning = false;
        window.isPanning = false;
        container.style.transition = '';
    };
    wrapper.addEventListener('touchstart', e => {
        if (blocked(e.target)) return;
        // Do not interrupt a page that is already curling.
        if (!gesture && pageFlip.getState() !== 'read') { consume(e); return; }
        e.stopPropagation();
        container.style.transition = 'none';
        if (e.touches.length === 2) {
            cancelTap();
            const mid = midpoint(e.touches);
            gesture = {mode:'pinch', origin:mid, center:center(), zoom, panX, panY,
                distance:Math.max(1, distance(point(e.touches[0]), point(e.touches[1])))};
            isPanning = window.isPanning = true;
            consume(e);
        } else if (e.touches.length === 1 && !gesture) {
            const p = point(e.touches[0]);
            gesture = {mode:'single', origin:p, last:p, time:Date.now(), moved:false,
                wasZoomed:isZoomed(), panX, panY, link:e.target.closest?.('a')};
        } else if (e.touches.length > 2) {
            finish();
            gesture = {mode:'ignore'};
            consume(e);
        }
    }, {capture:true, passive:false});
    wrapper.addEventListener('touchmove', e => {
        if (!gesture) return;
        consume(e);
        if (gesture.mode === 'pinch' && e.touches.length === 2) {
            const mid = midpoint(e.touches), g = gesture;
            zoom = Math.max(1, Math.min(3, g.zoom * distance(point(e.touches[0]), point(e.touches[1])) / g.distance));
            const ratio = zoom / g.zoom;
            panX = mid.x - g.center.x - (g.origin.x - g.center.x - g.panX) * ratio;
            panY = mid.y - g.center.y - (g.origin.y - g.center.y - g.panY) * ratio;
            // Preview with one compositor transform; resize and select sharper
            // images only when the fingers lift, not on every touchmove.
            updateTransform(true);
            container.style.transform += ` scale(${ratio})`;
            syncControls();
        } else if (gesture.mode === 'single' && e.touches.length === 1) {
            const p = point(e.touches[0]), g = gesture;
            g.last = p;
            g.moved ||= distance(p, g.origin) > 8;
            if (g.moved) cancelTap();
            if (g.wasZoomed && g.moved) {
                isPanning = window.isPanning = true;
                panX = g.panX + p.x - g.origin.x;
                panY = g.panY + p.y - g.origin.y;
                updateTransform(true);
            }
        }
    }, {capture:true, passive:false});
    wrapper.addEventListener('touchend', e => {
        if (!gesture) return;
        const g = gesture;
        e.stopPropagation();
        if (g.mode !== 'single') {
            consume(e);
            suppressClickUntil = Date.now() + 600;
            finish();
            // A remaining finger must not become an accidental tap/swipe.
            if (e.touches.length) gesture = {mode:'ignore'};
            return;
        }
        if (e.touches.length) return;
        const p = e.changedTouches.length ? point(e.changedTouches[0]) : g.last;
        const dx = p.x - g.origin.x, dy = p.y - g.origin.y;
        const moved = g.moved || distance(p, g.origin) > 8;
        finish();
        if (g.link && !moved) { cancelTap(); suppressClickUntil = 0; return; }
        consume(e);
        suppressClickUntil = Date.now() + 600;
        if (!moved && p.y >= window.innerHeight - 96) {
            cancelTap();
            revealControls();
            return;
        }
        if (moved) {
            cancelTap();
            if (!g.wasZoomed && Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy) * 1.3) turn(dx > 0 ? -1 : 1);
            if (g.wasZoomed) debouncedUpdateImageSizes();
        } else if (Date.now() - g.time < 350) {
            if (pendingTap && distance(p, pendingTap.point) < 32) {
                cancelTap();
                zoomAt(isZoomed() ? 1 : 2, p);
            } else {
                cancelTap();
                const r = wrapper.getBoundingClientRect(), x = (p.x - r.left) / r.width;
                const direction = x < 0.3 ? -1 : x > 0.7 ? 1 : 0;
                pendingTap = {point:p, timer:setTimeout(() => { pendingTap = null; turn(direction); }, 260)};
            }
        }
    }, {capture:true, passive:false});
    const cancel = () => { cancelTap(); finish(); suppressClickUntil = Date.now() + 600; };
    wrapper.addEventListener('touchcancel', cancel, {capture:true});
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', () => { if (!window.isProgrammaticResize) cancel(); });
    // Cancel compatibility mouse/click events after gestures, without affecting
    // a deliberate tap on a link or keyboard activation of a link.
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) {
        wrapper.addEventListener(type, e => {
            if ((e.sourceCapabilities?.firesTouchEvents || Date.now() < suppressClickUntil) && e.detail !== 0) {
                if (e.type === 'click' && e.target.closest?.('a') && Date.now() >= suppressClickUntil) return;
                consume(e);
            }
        }, {capture:true});
    }
    if (label) label.addEventListener('click', () => { cancelTap(); zoomAt(1, center()); });
}
