# Shared Storage Usage

Run a local server so VSCode preview and browser share one data file.

## Start

```powershell
cd d:\Desktop\demo\personal-planner
node dev-server.js
```

Open either of the following URLs (both use the same shared storage API):

- http://127.0.0.1:8787/index.html
- http://localhost:8787/index.html

## Notes

- Shared data is saved to `personal-planner/.planner-shared-storage.json`.
- If the server is not running, pages fall back to per-origin `localStorage` behavior.
