const chokidar = require("chokidar");
const { exec } = require("child_process");

let running = false;
let queued = false;

function runBuild() {

    if (running) {
        queued = true;
        return;
    }

    running = true;

    console.clear();
    console.log("🔄 Building...");

    exec("npm run push", (err, stdout, stderr) => {

        if (stdout)
            console.log(stdout);

        if (stderr)
            console.log(stderr);

        if (err)
            console.error(err);

        running = false;

        if (queued) {
            queued = false;
            runBuild();
        }

    });

}

chokidar
    .watch("./src", {

        ignoreInitial: true

    })
    .on("all", (event, path) => {

        console.log(`📄 ${event}: ${path}`);

        runBuild();

    });

console.log("👀 Watching src...");