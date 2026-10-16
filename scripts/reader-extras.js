// One sharing entry: QR and link copy live in the same dialog.
document.addEventListener('DOMContentLoaded', () => {
    const issue = document.documentElement.dataset.issue;
    const canonical = new URL('../../?issue=' + issue, location.href).href;
    const dialog = document.getElementById('share-dialog');
    const input = document.getElementById('share-url');
    input.value = canonical;
    document.getElementById('issue-share').onclick = () => {
        const qr = qrcode(0, 'M');
        qr.addData(canonical);
        qr.make();
        document.getElementById('qr-container').innerHTML = qr.createSvgTag(5, 20);
        dialog.showModal();
    };
    document.getElementById('copy-share').onclick = async () => {
        try {
            await navigator.clipboard.writeText(canonical);
        } catch {
            input.focus();
            input.select();
        }
    };
    document.getElementById('close-share').onclick = () => dialog.close();
    setTimeout(() => {
        if (window.pageFlip) document.getElementById('page-input').value = window.pageFlip.getCurrentPageIndex() + 1;
    }, 250);
});
