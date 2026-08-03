const fs = require("fs-extra");
const path = require("path");

const SRC = path.join(__dirname, "src");
const DIST = path.join(__dirname, "dist");

async function build() {
    // Delete previous build
    await fs.remove(DIST);

    // Recreate dist
    await fs.ensureDir(DIST);

    // Copy appsscript.json
    await fs.copy(
        path.join(__dirname, "appsscript.json"),
        path.join(DIST, "appsscript.json"),
    );

    // Copy every file from src into dist (flatten folders)
    await copyFolder(SRC);

    console.log("✔ Build completed.");
}

async function copyFolder(folder) {
    const items = await fs.readdir(folder);

    for (const item of items) {
        const full = path.join(folder, item);
        const stat = await fs.stat(full);

        if (stat.isDirectory()) {
            await copyFolder(full);
        } else {
            const ext = path.extname(item);
            const baseNameNoExt = path.basename(item, ext);

            // ============================
            // Server (.gs)
            // ============================
            if (ext === ".gs") {
                await fs.copy(full, path.join(DIST, path.basename(item)));
            }

            // ============================
            // Client JS (Outputs as filename.js.html)
            // ============================
            else if (ext === ".js") {
                const js = await fs.readFile(full, "utf8");
                const wrapped = `<script>\n${js}\n</script>`;

                // CRITICAL FIX: Name it 'dashboard.js.html' instead of 'dashboard.html'
                await fs.writeFile(
                    path.join(DIST, `${baseNameNoExt}.js.html`),
                    wrapped,
                );
            }

            // ============================
            // CSS (Outputs as filename.css.html)
            // ============================
            else if (ext === ".css") {
                const css = await fs.readFile(full, "utf8");
                const wrapped = `<style>\n${css}\n</style>`;

                // CRITICAL FIX: Name it 'dashboard.css.html'
                await fs.writeFile(
                    path.join(DIST, `${baseNameNoExt}.css.html`),
                    wrapped,
                );
            }

            // ============================
            // Views
            // ============================
            else if (ext === ".html") {
                let html = await fs.readFile(full, "utf8");

                // CRITICAL FIX: Updates include("dashboard.js") to include("dashboard.js")
                // while dropping folder paths.
                html = html.replace(
                    /include\("([^"]*\/)?([^"]+)"\)/g,
                    'include("$2")',
                );

                await fs.writeFile(path.join(DIST, path.basename(item)), html);
            }
        }
    }
}

build().catch(console.error);
