// ============================================================
// Debts page loader.
//
// The real Debts page (markup, CSS, and all its JS) is NOT baked into this
// initial page load -- it's fetched on first visit via getDebtsBundle() and
// injected into the DOM. This exists because of a real, reproducible
// ceiling on how much content Apps Script's HtmlService IFRAME sandbox can
// bake into the initial page: past a certain total size, the browser's
// `document.write` call (used internally by the sandbox to construct the
// page) throws a SyntaxError on essentially-arbitrary tokens partway
// through -- confirmed 2026-08-20 by shrinking/growing the Debts page's
// source and watching the failure point move around, which only makes
// sense as a size-triggered corruption, not a content bug. The full "Chase
// List" redesign is comfortably over that ceiling on its own, so it's
// loaded lazily instead of shrinking the design to fit.
//
// See Views/debts.html (markup fragment), CSS/debts.css (styles), and
// Views/debts-script.html (the real logic, as *raw* JS -- deliberately a
// ".html" project file, not ".js", so build.js doesn't wrap it in <script>
// tags and the server can hand back the bare source via include()).
// ============================================================

function loadDebtsPage() {
    showLoading();

    gsRun("getDebtsBundle")
        .then(function (bundle) {
            document.head.insertAdjacentHTML("beforeend", bundle.css);

            const script = document.createElement("script");
            script.textContent = bundle.js;
            document.body.appendChild(script);

            document.getElementById("debtsPage").innerHTML = bundle.html;

            hideLoading();

            // bundle.js just (re)defined loadDebtsPage() with the real
            // implementation (login check, etc.) -- this call now runs
            // that, not this loader.
            loadDebtsPage();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}
