// ============================================================
// Access control. The web app runs as the deploying user (the owner)
// with access "ANYONE", so Google's own sign-in only proves the visitor
// has *a* Google account -- and any versioned deployment would let that
// account run every global function below as the owner via
// google.script.run, Daftra writes included. Every client-callable
// entry point therefore calls requireAuthorizedUser_() first, the same
// way disabled features call assertFeatureEnabled_().
//
// Allowed accounts: the ALLOWED_EMAILS Script Property (comma-separated),
// or, when that's unset, only the script owner. Fails closed: a blank
// active-user email (Google hides it for some account combinations) is
// treated as unauthorized, never as "unknown, let it through".
//
// Sheet-menu functions (onOpen, importShortDebtsFromNotebook,
// showTodaysEntrySummary) are deliberately not guarded: they need
// SpreadsheetApp.getUi(), which only works from the Sheet itself, and
// anyone there already has the Sheet's own edit access.
// ============================================================

let authorizedUserEmail_ = null;

function getAllowedEmails_() {
    const configured = PropertiesService.getScriptProperties().getProperty(
        "ALLOWED_EMAILS",
    );

    const emails = configured
        ? configured.split(",")
        : [Session.getEffectiveUser().getEmail()];

    return emails
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean);
}

function getActiveUserEmail_() {
    try {
        return String(Session.getActiveUser().getEmail() || "")
            .trim()
            .toLowerCase();
    } catch (e) {
        return "";
    }
}

function isAuthorizedUser_() {
    const email = getActiveUserEmail_();
    return Boolean(email) && getAllowedEmails_().includes(email);
}

// Cached per execution -- nested guarded calls (e.g. getDashboard ->
// getAllSalesRows) only check once.
function requireAuthorizedUser_() {
    if (authorizedUserEmail_) return authorizedUserEmail_;

    if (!isAuthorizedUser_()) {
        throw new Error("You are not authorized to use this app.");
    }

    authorizedUserEmail_ = getActiveUserEmail_();
    return authorizedUserEmail_;
}

function accessDeniedPage_() {
    const email = getActiveUserEmail_();
    const who = email
        ? "<p>Signed in as <b>" + email + "</b>.</p>"
        : "<p>Your Google account's email could not be read.</p>";

    return HtmlService.createHtmlOutput(
        "<div style='font-family:sans-serif;max-width:420px;margin:15vh auto;text-align:center'>" +
            "<h2>Access denied</h2>" +
            who +
            "<p>Ask the shop owner to give this account access.</p>" +
            "</div>",
    ).setTitle("Access denied");
}
