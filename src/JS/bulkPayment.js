// ============================================================
// Bulk Payment page loader.
//
// Fetched on first visit via getBulkPaymentBundle() and injected into the
// DOM, rather than baked into the initial page like the Dashboard/Sales/
// Expenses tabs. There's a real, reproducible ceiling on how much content
// Apps Script's HtmlService IFRAME sandbox can bake into the initial page --
// past a certain total size, the browser's `document.write` call (used
// internally by the sandbox to construct the page) throws a SyntaxError on
// essentially-arbitrary tokens partway through. Loading this page's markup/
// CSS/JS lazily instead keeps the initial page comfortably under that
// ceiling. Same pattern as the Bulk Invoice tool (JS/bulkInvoice.js).
// ============================================================

function loadBulkPaymentPage() {
    showLoading();

    gsRun("getBulkPaymentBundle")
        .then(function (bundle) {
            document.head.insertAdjacentHTML("beforeend", bundle.css);

            const script = document.createElement("script");
            script.textContent = bundle.js;
            document.body.appendChild(script);

            document.getElementById("bulkPaymentPage").innerHTML = bundle.html;

            hideLoading();

            // bundle.js just (re)defined loadBulkPaymentPage() with the real
            // implementation -- this call now runs that, not this loader.
            loadBulkPaymentPage();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}
