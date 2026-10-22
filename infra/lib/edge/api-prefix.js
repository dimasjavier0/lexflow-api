// CloudFront Function (viewer request) for /api/*: the API's routes have no /api prefix, and
// the API needs the public origin to build the URLs of the files it stores (see
// src/lib/public-url.ts). Whatever the viewer sent in x-public-origin is replaced.
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/api(?=\/|$)/, "") || "/";
  request.headers["x-public-origin"] = { value: "https://" + request.headers.host.value };
  return request;
}
