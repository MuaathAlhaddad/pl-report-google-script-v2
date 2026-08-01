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
        path.join(DIST, "appsscript.json")
    );

    // Copy every file from src into dist (flatten folders)
    await copyFolder(SRC);

    console.log("✔ Build completed.");

}

async function copyFolder(folder){

    const items = await fs.readdir(folder);

    for(const item of items){

        const full = path.join(folder, item);

        const stat = await fs.stat(full);

        if(stat.isDirectory()){

            await copyFolder(full);

        }else{

            const dest = path.join(DIST, path.basename(item));

            if(path.extname(item) === ".html"){

                let html = await fs.readFile(full, "utf8");

                // Convert
                // include("Views/X")
                // include("CSS/X")
                // include("Anything/X")
                // into
                // include("X")

                html = html.replace(
                    /include\("([^"]*\/)?([^"]+)"\)/g,
                    'include("$2")'
                );

                await fs.writeFile(dest, html);

            }else{

                await fs.copy(full, dest);

            }

            console.log("Copied:", item);

        }

    }

}

build().catch(console.error);