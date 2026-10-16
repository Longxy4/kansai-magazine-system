/**
 * Flipbook UI Module
 * Manages all UI event listeners, controls (zoom, full-screen, TOC), and user input handling.
 */
function setupUI(pageCount, pageInput, zoomSlider, zoomText, controlsPanel, topControlsPanel, fullscreenBtn, wrapper, tocBtn, tableOfContents, tocModal, tocList, tocCloseBtn, tocOverlay, prevPageBtn, nextPageBtn, pageLinksBtn, linksModal, linksList, linksCloseBtn) {
    // Mobile-friendly control panel activation (both panels share state)
    let controlsPanelTimeout = null;
    let isUsingSlider = false;

    const activateControlPanel = () => {
        if (controlsPanel) controlsPanel.classList.add('active');
        if (topControlsPanel) topControlsPanel.classList.add('active');

        // Clear any existing timeout
        if (controlsPanelTimeout) {
            clearTimeout(controlsPanelTimeout);
            controlsPanelTimeout = null;
        }
    };

    const deactivateControlPanel = () => {
        const hoveringControls = controlsPanel && matchMedia('(hover: hover)').matches && controlsPanel.matches(':hover');
        if (isUsingSlider || hoveringControls || controlsPanelTimeout !== null) return;
        controlsPanelTimeout = setTimeout(() => {
            controlsPanelTimeout = null;
            if (controlsPanel) controlsPanel.classList.remove('active');
            if (topControlsPanel) topControlsPanel.classList.remove('active');
        }, 1000);
    };

    if (controlsPanel) {
        controlsPanel.addEventListener('click', () => {
            activateControlPanel();
            deactivateControlPanel();
        });
    }

    if (topControlsPanel) {
        topControlsPanel.addEventListener('click', () => {
            activateControlPanel();
            deactivateControlPanel();
        });
    }

    // Reuse Pages' active state and hide timer. Only the bottom edge reveals it.
    const nearBottom = y => y >= window.innerHeight - 96;
    document.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch' || document.querySelector('dialog[open], .toc-modal:not(.hidden)')) return;
        if (document.querySelector('.page-sidebar:not(.hidden)') || e.target.closest?.('.page-sidebar, #toc-btn')) return;
        // A low-positioned PDF link/QR must stay clickable without summoning
        // the dock over the pointer before its click reaches the link.
        if (e.target.closest?.('a.pdf-link')) { deactivateControlPanel(); return; }
        if (nearBottom(e.clientY)) activateControlPanel();
        else deactivateControlPanel();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', deactivateControlPanel);
    document.addEventListener('touchstart', e => {
        if (e.touches.length !== 1 || document.querySelector('dialog[open], .toc-modal:not(.hidden)') || e.target.closest?.('a.pdf-link')) return;
        if (e.target.closest?.('.page-sidebar, #toc-btn')) return;
        if (nearBottom(e.touches[0].clientY) && !controlsPanel.contains(e.target)) {
            // Consume the reveal tap so it does not also turn the magazine page.
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            activateControlPanel();
            deactivateControlPanel();
        }
    }, { capture: true, passive: false });
    if (controlsPanel) {
        controlsPanel.addEventListener('focusin', activateControlPanel);
        controlsPanel.addEventListener('focusout', e => {
            if (!controlsPanel.contains(e.relatedTarget)) deactivateControlPanel();
        });
    }

    // Fullscreen button handler
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (typeof document.documentElement.requestFullscreen !== 'function') {
                    return;
                }
                document.documentElement.requestFullscreen().catch(err => {
                    console.error('Error attempting to enable fullscreen:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // Deactivate controls when clicking outside
    document.addEventListener('click', (e) => {
        const isClickInsideControls = controlsPanel && controlsPanel.contains(e.target);
        const isClickInsideTopControls = topControlsPanel && topControlsPanel.contains(e.target);
        if (isUsingSlider) return;
        if (!isClickInsideControls && !isClickInsideTopControls) {
            if (nearBottom(e.clientY)) return;
            if (controlsPanel) controlsPanel.classList.remove('active');
            if (topControlsPanel) topControlsPanel.classList.remove('active');
            if (controlsPanelTimeout) {
                clearTimeout(controlsPanelTimeout);
                controlsPanelTimeout = null;
            }
        }
    });

    // Shortcuts feed the original slider input handler, sharing its clamping,
    // transform, pan constraints and debounced high-resolution image update.
    function adjustZoom(delta) {
        if (!zoomSlider) return;
        const current = parseFloat(zoomSlider.value);
        const next = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max),
            Math.round((current + delta) * 100) / 100));
        if (next === current) return;
        zoomSlider.value = String(next);
        zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.addEventListener('wheel', e => {
        if (!e.ctrlKey || document.querySelector('dialog[open], .toc-modal:not(.hidden)')) return;
        e.preventDefault();
        if (e.deltaY) adjustZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    // Zoom Slider
    if (zoomSlider) {
        zoomSlider.addEventListener('mousedown', () => {
            isUsingSlider = true;
            activateControlPanel();
        });
        zoomSlider.addEventListener('touchstart', () => {
            isUsingSlider = true;
            activateControlPanel();
        });
        zoomSlider.addEventListener('mouseup', () => {
            isUsingSlider = false;
            zoomSlider.blur();
            deactivateControlPanel();
        });
        zoomSlider.addEventListener('touchend', () => {
            isUsingSlider = false;
            zoomSlider.blur();
            deactivateControlPanel();
        });
        zoomSlider.addEventListener('input', e => {
            zoom = parseFloat(e.target.value);
            if (zoomText) {
                zoomText.textContent = Number.isInteger(zoom) ? `${zoom}x` : `${zoom.toFixed(2)}x`;
            }
            updateTransform();
            debouncedUpdateImageSizes();
        });
        zoomSlider.addEventListener('keydown', e => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }
        });
    }

    // Page navigation buttons
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            handleZoomNavigation(() => pageFlip.flipPrev());
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            handleZoomNavigation(() => pageFlip.flipNext());
        });
    }

    // Page input handler
    if (pageInput) {
        const jumpToInput = () => {
            const targetPage = parseInt(pageInput.value, 10);
            if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= pageCount) {
                handleZoomNavigation(() => pageFlip.turnToPage(targetPage - 1));
            }
        };
        pageInput.addEventListener('change', jumpToInput);
        pageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); jumpToInput(); pageInput.blur(); }
        });

        // Blur input when tapping outside (dismisses keyboard on mobile)
        // Use pointerdown instead of click for immediate response on touch
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.page-input-container')) {
                pageInput.blur();
            }
        });
    }

    // Table of Contents
    if (tocBtn && tableOfContents.length > 0) {
        tocBtn.style.display = 'flex';
        function renderTOC(items, container, level = 0) {
            items.forEach(item => {
                const itemEl = document.createElement('button');
                itemEl.type = 'button';
                itemEl.className = `toc-item toc-level-${level}`;
                // Add data-page attribute for Active TOC logic
                itemEl.setAttribute('data-page', item.page);

                const titleEl = document.createElement('span');
                titleEl.className = 'toc-item-title';
                titleEl.textContent = item.title;
                const numberEl = document.createElement('span');
                numberEl.className = 'toc-item-page';
                numberEl.textContent = item.page;
                itemEl.append(titleEl, numberEl);
                itemEl.addEventListener('click', () => {
                    if (pageFlip) {
                        handleZoomNavigation(() => {
                            pageFlip.turnToPage(item.page - 1);
                            closeTOC();
                        });
                    }
                });
                container.appendChild(itemEl);
                if (item.children && item.children.length > 0) {
                    renderTOC(item.children, container, level + 1);
                }
            });
        }
        renderTOC(tableOfContents, tocList);

        // Active TOC Logic
        window.updateActiveTOC = (currentPage) => {
            const items = tocList.querySelectorAll('.toc-item');
            let activeItem = null;

            items.forEach(item => {
                item.classList.remove('active');
                const itemPage = parseInt(item.getAttribute('data-page'), 10);
                if (itemPage <= currentPage) {
                    activeItem = item;
                }
            });

            if (activeItem) {
                activeItem.classList.add('active');
                // Only scroll if TOC is visible to avoid unnecessary layout calculations
                if (!tocModal.classList.contains('hidden') && !tocList.hidden) {
                    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        };

        const closeTOC = () => window.closePageSidebar();
    }

    // Page Links List
    if (pageLinksBtn && linksModal && linksList) {
        const isExternalUrl = (url) => url && (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('tel:'));

        const getLinksFromVisiblePages = () => {
            if (!pageFlip) return [];
            const activeIndex = pageFlip.getCurrentPageIndex();
            const display = (pageFlip.getSettings() && pageFlip.getSettings().display) || 'double';

            const pageContainers = document.querySelectorAll('.page-container');
            const indices = [activeIndex];
            if (display === 'double' && activeIndex > 0 && activeIndex < pageCount - 1) indices.push(activeIndex + 1);

            const links = [];
            indices.forEach(idx => {
                const page = pageContainers[idx];
                if (!page) return;

                // Query all links in the enrichment layer
                const pageLinks = page.querySelectorAll('.enrichment-layer a');
                pageLinks.forEach(a => {
                    const epubHref = a.getAttribute('data-epub-href');
                    let targetPage = a.getAttribute('data-target-page');

                    // Resolve EPUB link for the list title/target if possible
                    if (epubHref) {
                        const linkMap = (window.FLIPBOOK_CONFIG && window.FLIPBOOK_CONFIG.linkMap) || {};

                        // 1. Try exact match (with anchor) first
                        targetPage = linkMap[epubHref];

                        // 2. Fallback to stripping the anchor
                        if (!targetPage) {
                            let key = epubHref.split('#')[0];
                            targetPage = linkMap[key];
                        }
                    }

                    const href = a.getAttribute('href');
                    const isExternal = href && (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:'));

                    // Skip links that have no destination
                    if (!isExternal && !targetPage) return;

                    links.push({
                        title: a.getAttribute('title') || a.textContent.trim() || (isExternal ? 'External Link' : 'Internal Link'),
                        url: isExternal ? href : null,
                        targetPage: targetPage,
                        epubHref: epubHref,
                        sourceArea: {
                            top: parseFloat(a.getAttribute('data-source-top')),
                            left: parseFloat(a.getAttribute('data-source-left')),
                            width: parseFloat(a.getAttribute('data-source-width')),
                            height: parseFloat(a.getAttribute('data-source-height'))
                        },
                        sourcePageIndex: idx
                    });
                });
            });
            return links;
        };

        const updateLinksButtonVisibility = () => {
            const links = getLinksFromVisiblePages();
            if (links.length > 0) {
                pageLinksBtn.style.display = 'flex';
            } else {
                pageLinksBtn.style.display = 'none';
                closeLinks();
            }
        };

        const renderLinks = (links) => {
            linksList.innerHTML = '';
            links.forEach(link => {
                const itemEl = document.createElement('button');
                itemEl.type = 'button';
                itemEl.className = 'toc-item';

                let targetText = '';
                if (link.url) {
                    targetText = link.url.length > 60 ? link.url.substring(0, 57) + '...' : link.url;
                } else if (link.targetPage) {
                    targetText = `Page ${link.targetPage}`;
                }

                let previewHtml = '';
                if (window.FLIPBOOK_CONFIG.linkPreviews !== false && link.sourceArea && !isNaN(link.sourceArea.top)) {
                    const pageContainers = document.querySelectorAll('.page-container');
                    const sourcePageEl = pageContainers[link.sourcePageIndex];
                    if (sourcePageEl) {
                        const sourceImg = sourcePageEl.querySelector('img.page-image');
                        if (sourceImg) {
                            const { top, left, width, height } = link.sourceArea;
                            // Replicate CSS logic for preview dimensions to ensure JS math matches exactly
                            let previewW = Math.min(window.innerWidth * 0.25, 180); // max-width: 180px
                            let previewH = previewW * 0.6;

                            // Check media query equivalent (max-height: 600px)
                            if (window.innerHeight <= 600) {
                                previewH = Math.min(window.innerHeight * 0.15, 108); // max-height: 108px
                                previewW = previewH * 1.666;
                            }

                            const previewAspect = previewW / previewH;
                            const centerX = left + width / 2;
                            const centerY = top + height / 2;

                            // Calculate zoom: fill the preview box as much as possible but cap resolution
                            // To avoid blurriness, we cap the background-size.
                            const zoom = Math.min(800, Math.max(200, 100 / Math.max(width / 100, height * previewAspect / 100)));
                            const zoomFactor = zoom / 100;

                            const aspect = sourceImg.naturalWidth / sourceImg.naturalHeight || 0.707;
                            const imgW = previewW * zoomFactor;
                            const imgH = imgW / aspect;

                            // Calculate pixel offset to center the link in the box
                            const posX = (previewW / 2) - (centerX / 100) * imgW;
                            const posY = (previewH / 2) - (centerY / 100) * imgH;

                            const highlightWidth = width * (zoomFactor);
                            const highlightHeight = height * (zoomFactor);


                            // Create offscreen canvas for the thumbnail
                            const canvas = document.createElement('canvas');
                            // Scale for high DPI
                            const pixelRatio = window.devicePixelRatio || 1;
                            canvas.width = previewW * pixelRatio;
                            canvas.height = previewH * pixelRatio;

                            const ctx = canvas.getContext('2d');
                            ctx.scale(pixelRatio, pixelRatio);

                            // Draw the image at the exact position calculated for CSS
                            // CSS 'backgound-position: Xpx Ypx' corresponds to drawing at (X, Y)
                            ctx.drawImage(sourceImg, posX, posY, imgW, imgH);

                            // Export to low-quality JPEG for memory efficiency
                            const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);

                            previewHtml = `
                                <div class="link-preview-container">
                                    <div class="link-preview-viewport" style="
                                        background-image: url('${thumbUrl}');
                                        background-position: center;
                                        background-size: 100% 100%;
                                    "></div>
                                    <div class="link-preview-highlight" style="
                                        width: ${highlightWidth}px;
                                        height: ${highlightHeight}px;
                                        left: calc(50% - ${highlightWidth / 2}px);
                                        top: calc(50% - ${highlightHeight / 2}px);
                                    "></div>
                                </div>
                            `;
                        }
                    }
                }

                itemEl.innerHTML = previewHtml;
                const textEl = document.createElement('span');
                textEl.className = 'toc-item-text';
                const titleEl = document.createElement('span');
                titleEl.className = 'toc-item-title';
                titleEl.textContent = link.title;
                const targetEl = document.createElement('span');
                targetEl.className = 'toc-item-page';
                targetEl.textContent = targetText;
                textEl.append(titleEl, targetEl);
                itemEl.appendChild(textEl);

                itemEl.addEventListener('click', () => {
                    if (link.url) {
                        window.open(link.url, '_blank', 'noopener,noreferrer');
                    } else if (link.targetPage) {
                        const pageNum = parseInt(link.targetPage, 10);
                        if (!isNaN(pageNum)) {
                            console.log('Links Modal: Flipping to page', pageNum);
                            handleZoomNavigation(() => pageFlip.turnToPage(pageNum - 1));
                        }
                    }
                    closeLinks();
                });
                linksList.appendChild(itemEl);
            });
        };

        const openLinks = () => {
            const links = getLinksFromVisiblePages();
            renderLinks(links);
            linksModal.classList.remove('hidden');
        };
        const closeLinks = () => linksModal.classList.add('hidden');

        pageLinksBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLinks();
        });
        if (linksCloseBtn) linksCloseBtn.addEventListener('click', closeLinks);
        const linksOverlay = linksModal.querySelector('.toc-overlay');
        if (linksOverlay) linksOverlay.addEventListener('click', closeLinks);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeLinks();
        });

        // Expose to window for main.js to call
        window.updateLinksButtonVisibility = updateLinksButtonVisibility;

        // Initial check
        setTimeout(updateLinksButtonVisibility, 500);
    }

    // Keyboard navigation
    document.addEventListener('keydown', e => {
        if (document.querySelector('dialog[open], .toc-modal:not(.hidden)') || e.target.isContentEditable ||
            ['TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
            (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
        if (!e.altKey) {
            const plus = ['+', '='].includes(e.key) || e.code === 'NumpadAdd';
            const minus = e.key === '-' || e.code === 'NumpadSubtract';
            if (plus || minus) {
                e.preventDefault();
                adjustZoom(plus ? 0.1 : -0.1);
                return;
            }
        }
        if (e.target.tagName === 'INPUT') return;
        if (isZoomed()) {
            if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
            return;
        }
        if (pageFlip) {
            if (e.key === 'ArrowRight') pageFlip.flipNext();
            else if (e.key === 'ArrowLeft') pageFlip.flipPrev();
        }
    });

    // Panning helper
    let isActuallyPanning = false;
    let mouseDownX = 0;
    let mouseDownY = 0;
    const PAN_THRESHOLD = 5;

    const onStart = (clientX, clientY) => {
        if (isZoomed()) {
            isPanning = true;
            window.isPanning = true; // Expose globally for scaling.js check
            isActuallyPanning = false;
            mouseDownX = clientX;
            mouseDownY = clientY;
            startX = clientX - panX;
            startY = clientY - panY;
            wrapper.style.cursor = 'grabbing';
        }
    };
    const onMove = (clientX, clientY) => {
        if (isPanning && isZoomed()) {
            const dist = getDistance(mouseDownX, mouseDownY, clientX, clientY);
            if (!isActuallyPanning && dist > PAN_THRESHOLD) {
                isActuallyPanning = true;
            }

            if (isActuallyPanning) {
                panX = clientX - startX;
                panY = clientY - startY;
                updateTransform(true); // Optimization: Pan only
            }
        }
    };
    const onEnd = () => {
        isPanning = false;
        window.isPanning = false;
        isActuallyPanning = false;
        if (isZoomed()) {
            wrapper.style.cursor = 'grab';
            // Trigger quality update now that panning has stopped
            debouncedUpdateImageSizes();
        }
    };

    wrapper.addEventListener('mousedown', (e) => {
        if (e.target.closest('#controls-panel') || e.target.closest('#top-controls-panel') || e.target.closest('dialog')) return;
        onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            if (isActuallyPanning) {
                e.preventDefault();
            }
            onMove(e.clientX, e.clientY);
        }
    });
    window.addEventListener('mouseup', onEnd);
    wrapper.addEventListener('touchstart', (e) => {
        if (e.target.closest('#controls-panel') || e.target.closest('#top-controls-panel') || e.target.closest('dialog')) return;
        if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 1) {
            if (isActuallyPanning && e.cancelable) {
                e.preventDefault();
            }
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });
    window.addEventListener('touchend', onEnd);
}
