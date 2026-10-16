/**
 * Flipbook HTML Generator
 * Creates a standalone HTML file with embedded CSS, JavaScript, and page images
 * Supports both legacy format (array of data URLs) and responsive format (array of variants)
 *
 * @typedef {Object} GeneratorOptions
 * @property {string} title - Title of the flipbook
 * @property {boolean} doubleSpread - Whether to enable double spread mode
 * @property {boolean} doubleSpread - Whether to enable double spread mode
 * @property {'single'|'folder'} mode - Generation mode: 'single' (embedded base64) or 'folder' (external images)
 */

/**
 * Interface for loading CSS and JS content
 * @typedef {Object} AssetLoader
 * @property {Function} loadCss - Function to load CSS content
 * @property {Function} loadJs - Function to load JS content
 */

/**
 * @typedef {Object} RenderVariant
 * @property {number} scale - The scale factor used
 * @property {number} width - Image width in pixels
 * @property {number} height - Image height in pixels
 * @property {string} dataUrl - The data URL for this variant
 */

/**
 * Default asset loader that fetches from files
 */
export const defaultAssetLoader = {
    async loadCss() {
        try {
            const response = await fetch('./src/flipbook.css');
            return await response.text();
        } catch (error) {
            console.warn('Could not load flipbook.css, using fallback');
            return '';
        }
    },

    async loadPageFlipJs() {
        try {
            //The lib is already included in ${js}
            return '';
        } catch {
            return '';
        }
    },

    async loadJs() {
        const modules = [
            'utils.js', 'state.js', 'navigation.js', 'scaling.js',
            'zoom.js', 'pageflip.js', 'ui.js', 'links.js', 'main.js'
        ];
        try {
            const contents = await Promise.all(
                modules.map(m => fetch(`./src/js/flipbook/${m}`).then(r => r.text()))
            );
            return contents.join('\n');
        } catch (error) {
            console.warn('Could not load modular JS files, using fallback');
            return '';
        }
    }
};

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, char => htmlEscapeMap[char]);
}

/**
 * Escapes characters for safe use in HTML attributes
 * Handles quotes, ampersands, and other special characters that could break attribute boundaries
 * @param {string} str - String to escape for HTML attribute
 * @returns {string} Escaped string safe for HTML attributes
 */
function escapeAttr(str) {
    if (typeof str !== 'string') return '';
    const attrEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '\n': '&#10;',
        '\r': '&#13;',
        '\t': '&#9;'
    };
    return str.replace(/[&<>"'\n\r\t]/g, char => attrEscapeMap[char]);
}



/**
 * Generates srcset string from image variants
 * @param {Array<RenderVariant>} variants - Array of image variants
 * @param {string} [basePath] - Optional base path for external images (e.g. 'images/')
 * @param {number} [pageIndex] - Page index for naming
 * @returns {string} srcset attribute value
 */
function generateSrcset(variants, basePath = '', pageIndex = 0) {
    if (!variants || variants.length === 0) return '';

    return variants
        .map((v, i) => {
            // Escape data URLs for safe use in srcset attribute
            const src = basePath ? `${basePath}page-${pageIndex + 1}-${v.width}w.jpg` : escapeAttr(v.dataUrl);
            return `${src} ${v.width}w`;
        })
        .join(', ');
}

/**
 * Generates sizes string based on layout mode
 * @param {boolean} doubleSpread - Whether in double spread mode
 * @returns {string} sizes attribute value
 */
function generateSizes(doubleSpread) {
    // In double spread mode, each half-page takes roughly half the viewport
    return doubleSpread ? '50vw' : '100vw';
}

/**
 * Renders PDF link annotations as absolute positioned <a> tags
 * @param {Array} links - Array of normalized links
 * @returns {string} HTML string of links
 */
function renderPdfLinks(links) {
    if (!links || links.length === 0) return '';

    return links.map(link => {
        const style = `top: ${link.top}; left: ${link.left}; width: ${link.width}; height: ${link.height}; position: absolute;`;

        let attr = '';
        if (link.url) {
            attr = `href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer"`;
        } else if (link.pageNumber) {
            attr = `href="#page=${link.pageNumber}" data-target-page="${link.pageNumber}"`;
        }

        return `<a class="pdf-link" style="${style}" ${attr} title="${escapeAttr(link.title || '')}" aria-label="${escapeAttr(link.title || '')}" data-link-source="${escapeAttr(link.source || 'pdf')}" data-source-top="${link.top}" data-source-left="${link.left}" data-source-width="${link.width}" data-source-height="${link.height}"></a>`;
    }).join('');
}

/**
 * Renders PDF text content as transparent selectable spans
 * @param {Array} textItems - Array of normalized text items
 * @returns {string} HTML string of text elements
 */
function renderPdfText(textItems) {
    if (!textItems || textItems.length === 0) return '';

    return textItems.map(item => {
        // PDF.js text items have transform [scaleX, skewY, skewX, scaleY, translateX, translateY]
        // Our normalized items should already have percentage-based { top, left, width, height }
        const style = `top: ${item.top}; left: ${item.left}; font-size: ${item.fontSize}cqh; font-family: ${item.fontFamily || 'sans-serif'}; transform: scaleX(${item.scaleX}); transform-origin: left top; position: absolute; line-height: 1;`;
        return `<span class="pdf-text" style="${style}">${escapeHtml(item.str)}</span>`;
    }).join('');
}

/**
 * Generates HTML for individual pages with enrichment support
 * @param {Array<string|Array<RenderVariant>>} pageImages - Array of either data URLs or variant arrays
 * @param {boolean} doubleSpread - Whether in double spread mode
 * @param {'single'|'folder'} mode - Generation mode
 * @param {Array<string>} [enrichmentHtmlList] - Array of raw HTML strings for each page's enrichment layer
 * @param {Array<Object>} [pdfPageLinks] - Array of link collections for each page (PDF only)
 * @returns {string} HTML string for all pages
 */
export function generatePagesHtml(pageImages, doubleSpread = false, mode = 'single', enrichmentHtmlList = [], pdfPageLinks = [], pdfPageText = []) {
    if (!Array.isArray(pageImages)) {
        throw new Error('pageImages must be an array');
    }

    const pagesHtml = Array.from({ length: pageImages.length }, (_, i) => {
        const pageNum = i + 1;
        const pageData = pageImages[i];
        const pageEnrichmentHtml = enrichmentHtmlList?.[i] || '';

        const isLegacyFormat = typeof pageData === 'string';

        let imgTag;
        if (isLegacyFormat) {
            const src = mode === 'folder' ? `images/page-${pageNum}.jpg` : escapeAttr(pageData);
            imgTag = `<img class="page-image" src="${src}" alt="" loading="eager" />`;
        } else {
            const variants = pageData;
            if (!Array.isArray(variants) || variants.length === 0) {
                throw new Error(`Page ${pageNum} has no image variants`);
            }

            let src, srcset;
            if (mode === 'folder') {
                src = `images/page-${pageNum}-${variants[0].width}w.jpg`;
                srcset = generateSrcset(variants, 'images/', i);
            } else {
                src = escapeAttr(variants[0].dataUrl);
                srcset = generateSrcset(variants);
            }

            const sizes = generateSizes(doubleSpread);
            const objectPosition = doubleSpread ? (pageNum % 2 === 0 ? 'left' : 'right') : 'center';

            imgTag = `<img class="page-image" src="${src}" srcset="${srcset}" sizes="${sizes}" alt="" loading="eager" style="object-position: ${objectPosition} center;" />`;
        }

        return `
<!-- =================================================================== -->
<!-- PAGE ${pageNum} - ENRICHMENT ZONE -->
<!-- Keep the <img> tag. Add interactive elements INSIDE enrichment-layer -->
<!-- =================================================================== -->
<div class="page-container" data-density="soft">
  ${imgTag}
  <div class="enrichment-layer">
    ${pageEnrichmentHtml}
    ${renderPdfLinks(pdfPageLinks?.[i]?.links)}
    ${renderPdfText(pdfPageText?.[i]?.items)}
  </div>
</div>
<!-- PAGE ${pageNum} END -->
<!-- =================================================================== -->`;
    }).join('');

    return pagesHtml;
}

/**
 * Generates the complete HTML structure for the flipbook with EPUB support
 * @param {Array<string|Array<RenderVariant>>} pageImages - Array of either data URLs or variant arrays
 * @param {GeneratorOptions} options - Generator options
 * @param {AssetLoader} assetLoader - Asset loader (optional, defaults to file loader)
 * @param {Array<string>} [enrichmentHtmlList] - Optional array of HTML strings for enrichment layers
 * @param {Array<Object>} [pdfPageLinks] - Optional PDF link data
 * @returns {Promise<string|{html: string, assets: Array}>} Complete HTML document or object with assets
 */
export async function generateFlipbookHtml(pageImages, options = {},
    assetLoader = defaultAssetLoader, enrichmentHtmlList = [], pdfPageLinks = [], pdfPageText = []) {
    if (!Array.isArray(pageImages)) {
        throw new Error('pageImages must be an array');
    }

    if (pageImages.length < 1) {
        throw new Error('pageImages must contain at least one image');
    }

    const { title = 'Flipbook', doubleSpread = false, mode = 'single', extraCss = '' } = options;
    const [baseCss, js, pageFlipJs] = await Promise.all([
        assetLoader.loadCss().catch(() => ''),
        assetLoader.loadJs().catch(() => ''),
        assetLoader.loadPageFlipJs().catch(() => '')
    ]);

    // Construct the array of pages conditionally
    const pagesArray = [];

    // Add content pages - FIXED: Pass enrichmentHtmlList
    pagesArray.push(
        generatePagesHtml(pageImages, doubleSpread, mode, enrichmentHtmlList, pdfPageLinks, pdfPageText)
    );

    // Add blank page at end if odd number of pages
    let totalPageCount = pageImages.length;

    if (totalPageCount % 2 !== 0) {
        pagesArray.push(
            '<div class="page-container" data-density="soft" style="background-color: white;"></div>'
        );
    }

    // Join all page HTML
    const pagesHtml = pagesArray.join('');

    const actualPageCount = pageImages.length;

    // Calculate aspect ratio from the first page's first variant
    let aspectRatio = 0.707; // Default fallback (A4-ish)
    if (pageImages.length > 0) {
        const firstPage = pageImages[0];
        if (Array.isArray(firstPage) && firstPage.length > 0) {
            const firstVariant = firstPage[0];
            if (firstVariant.width && firstVariant.height) {
                aspectRatio = firstVariant.width / firstVariant.height;
            }
        }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
        <style>
        /* --- ENRICHMENT UTILITIES --- */
        .page-container {
    position: relative;
    width: 100%;
    height: 100%;
    z-index: 1500;
}

.page-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
}

.enrichment-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    z-index: 1510;
    container-type: size;
}

.pdf-link {
    display: block;
    cursor: pointer;
    z-index: 1520;
    pointer-events: auto;
}

        .pdf-link:hover {
        background-color: rgba(255, 255, 0, 0.2);
        }

        .pdf-text {
            position: absolute;
            color: rgba(0, 0, 0, 0);
            white-space: pre;
            cursor: text;
            transform-origin: left top;
            z-index: 1515;
            pointer-events: auto;
        }

        .pdf-text::selection {
            background: rgba(0, 0, 255, 0.2);
        }
        /* --- END UTILITIES --- */
        </style>
        <style>
        ${baseCss}
        </style>
        <style>
        /* --- EXTRA CSS --- */
        ${extraCss}
        </style>
</head>
<body>
    <div id="loading-screen">
        <div class="spinner"></div>
        <div class="loading-text">Loading Pages...</div>
    </div>

<!-- 
ENRICHMENT GUIDE:
1. Find the PAGE number you want to edit (search for "PAGE 5 - ENRICHMENT ZONE")
2. Add elements inside <div class="enrichment-layer">
3. Use absolute positioning: style="top: 100px; left: 150px;"
4. See CSS classes defined in <style> for building blocks
-->

    <div id="flipbook-wrapper">
        <div id="flipbook-container">
            <div id="flipbook" data-double-spread="${doubleSpread}">${pagesHtml}</div>
        </div>
        <div id="controls-panel" role="toolbar" aria-label="閲覧操作">
            <div class="page-input-container">
                <button id="prev-page-btn" class="page-nav-btn" aria-label="Previous Page">‹</button>
                <input type="number" id="page-input" aria-label="Page number" min="1" max="${actualPageCount}" value="1">
                <span id="total-pages" aria-label="総ページ数">/ ${actualPageCount}</span>
                <button id="next-page-btn" class="page-nav-btn" aria-label="Next Page">›</button>
            </div>
            <div class="zoom-controls">
                <input type="range" id="zoom-slider" min="1" max="3" step="0.05" value="1" aria-label="Zoom">
                <div id="zoom-level">1x</div>
            </div>
            <button id="fullscreen-btn" aria-label="Toggle Fullscreen" title="全画面">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
            <button id="issue-share" aria-label="共有" aria-haspopup="dialog">共有</button>
            <a id="issue-pdf" href="__ISSUE_PDF__" target="_blank" rel="noopener">PDF</a>
            <button id="page-links-btn" class="icon-btn" aria-label="Page Links" style="display:none">リンク</button>
        </div>

        <button id="toc-btn" aria-label="ページと目次を開く" aria-controls="toc-modal" aria-expanded="false"></button>
        <aside id="toc-modal" class="page-sidebar hidden" aria-label="ページと目次" aria-hidden="true" inert>
            <div class="sidebar-header">
                <div class="sidebar-tabs" role="tablist" aria-label="ナビゲーション表示">
                    <button id="thumbnail-tab" role="tab" aria-selected="true" aria-controls="thumbnail-list">ページ</button>
                    <button id="contents-tab" role="tab" aria-selected="false" aria-controls="toc-list" tabindex="-1">目次</button>
                </div>
                <button id="toc-close-btn" aria-label="サイドバーを閉じる">‹</button>
            </div>
            <nav id="thumbnail-list" role="tabpanel" aria-labelledby="thumbnail-tab"></nav>
            <nav id="toc-list" class="toc-list" role="tabpanel" aria-labelledby="contents-tab" hidden></nav>
        </aside>

        <div id="links-modal" class="toc-modal hidden">
            <div class="toc-overlay"></div>
            <div class="toc-content">
                <div class="toc-header">
                    <h2>このページのリンク</h2>
                    <button id="links-close-btn" aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div id="links-list" class="toc-list"></div>
            </div>
        </div>
    </div>
    <script>
        // Flipbook Configuration
        // This object is injected before the application scripts run
        // and provides all necessary configuration to the flipbook
        window.FLIPBOOK_CONFIG = {
            pageCount: ${actualPageCount},
            doubleSpread: ${doubleSpread},
            pageAspectRatio: ${aspectRatio},
            linkPreviews: ${options.linkPreviews !== false},
            linkMap: ${JSON.stringify(options.linkMap || {}).replace(/</g, '\\u003c')},
            tableOfContents: ${JSON.stringify(options.tableOfContents || []).replace(/</g, '\\u003c')},
            pageLinks: ${JSON.stringify(options.pageLinks || []).replace(/</g, '\\u003c')}
        };
    </script>
    <script>${pageFlipJs}</script>
    <script>${js}</script>
</body>
</html>`;

    if (mode === 'single') {
        return html;
    } else {
        // Folder mode: Return HTML + Assets
        const assets = [];

        // Extract assets from pageImages
        pageImages.forEach((pageData, i) => {
            const pageNum = i + 1;
            if (typeof pageData === 'string') {
                // Data URL (could be JPEG, PNG, or SVG)
                // Detect file type from data URL
                let ext = 'jpg'; // default
                if (pageData.startsWith('data:image/svg+xml')) {
                    ext = 'svg';
                } else if (pageData.startsWith('data:image/png')) {
                    ext = 'png';
                } else if (pageData.startsWith('data:image/webp')) {
                    ext = 'webp';
                } else if (pageData.startsWith('data:image/gif')) {
                    ext = 'gif';
                }

                assets.push({
                    filename: `images/page-${pageNum}.${ext}`,
                    data: pageData
                });
            } else {
                // Variants (PDF multi-scale mode)
                pageData.forEach(v => {
                    assets.push({
                        filename: `images/page-${pageNum}-${v.width}w.jpg`,
                        data: v.dataUrl
                    });
                });
            }
        });

        return { html, assets };
    }
}
