// ============================================================
// Bulk Invoice page loader.
//
// Same lazy-bundle pattern as the Debts page (see JS/debts.js's header
// comment for the full why) -- fetched on first visit via
// getBulkInvoiceBundle() and injected into the DOM, rather than baked into
// the initial page like the Dashboard/Sales/Expenses tabs, to stay well
// clear of the Apps Script HtmlService page-size ceiling documented there.
// ============================================================

function loadBulkInvoicePage() {
    showLoading();

    gsRun("getBulkInvoiceBundle")
        .then(function (bundle) {
            document.head.insertAdjacentHTML("beforeend", bundle.css);

            const script = document.createElement("script");
            script.textContent = bundle.js;
            document.body.appendChild(script);

            document.getElementById("bulkInvoicePage").innerHTML = bundle.html;

            hideLoading();

            // bundle.js just (re)defined loadBulkInvoicePage() with the real
            // implementation -- this call now runs that, not this loader.
            loadBulkInvoicePage();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}
