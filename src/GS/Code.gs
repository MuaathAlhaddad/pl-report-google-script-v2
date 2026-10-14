function doGet() {
    if (!isAuthorizedUser_()) return accessDeniedPage_();

    return HtmlService.createTemplateFromFile("Index")
        .evaluate()
        .setTitle("Daily Sales");
}

function include(filename) {
    requireAuthorizedUser_();
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
