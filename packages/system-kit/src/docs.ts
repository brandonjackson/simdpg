/**
 * Minimal HTML page that renders an OpenAPI spec with Scalar's standalone
 * API reference (loaded from CDN). Served at `GET /docs` by each system; the
 * spec itself is served at `specUrl` (e.g. `/openapi.yaml`).
 */
export function docsHtml(specUrl: string, title: string): string {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="${specUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
