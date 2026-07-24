// Minimal static server for Kratos Lab — serves the project root so the app
// can fetch files from /extracted/ and /tools/kratos-lab/.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") {
      res.writeHead(302, { Location: "/tools/kratos-lab/" });
      return res.end();
    }
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found: " + urlPath);
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Kratos Lab at http://localhost:${PORT}/`));
