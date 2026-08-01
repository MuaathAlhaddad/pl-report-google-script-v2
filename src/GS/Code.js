function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Daily Sales");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
