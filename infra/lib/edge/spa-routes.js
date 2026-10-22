// CloudFront Function (viewer request) for the web: routes of the single-page app, such as
// /profile or /learn/house, have no file behind them, so they get index.html. Paths with an
// extension (assets, sw.js, /.well-known/assetlinks.json) are served as they are.
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split("/").pop();
  if (lastSegment.indexOf(".") === -1) request.uri = "/index.html";
  return request;
}
