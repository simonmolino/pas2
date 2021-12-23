const fs            = require("fs");
const path          = require("path");
const _             = require("lodash");
const gulp          = require("gulp");
const del           = require("del");
const {exec, spawn} = require("child_process");

const RootFolder  = path.join();
const DistFolder  = path.join(RootFolder, "Dist");
const SrcFolder   = path.join(RootFolder, "Src");
const TestFolder  = path.join(DistFolder, "Test");
const NodeBin     = path.join(RootFolder, "node_modules", ".bin");

const _AVA_       = path.join(NodeBin, "ava");
const _C8_        = path.join(NodeBin, "c8") + " --reporter=lcov --reporter=html --reporter=text-summary";
const _TSC_       = path.join(NodeBin, "ttsc");
const _ESLINT_    = path.join(NodeBin, "eslint");
const _MDLINT_    = path.join(NodeBin, "markdownlint");

// ---------------------------------------------------------------------------------------------------------------------
const DistPath = (aPath = "") => path.join(DistFolder, aPath);
const RootPath = (aPath = "") => path.join(RootFolder, aPath);
const SrcPath = (aPath = "") => path.join(SrcFolder, aPath);

const DistDest = (aPath = "") => { return gulp.dest(DistPath(aPath)); }
const Root = (aPath = "") => { return gulp.src(RootPath(aPath)); }
const Src = (aPath = "") => { return gulp.src(SrcPath(aPath)); }

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("check-node", (done) =>
{
    const lExpected = fs.readFileSync(`${RootFolder}/.nvmrc`).toString();
    const lActual = process.version;

    if (lActual.trim() !== lExpected.trim())
    {
        console.log("INVALID NODE VERSION");
        console.log("EXPECTED:", lExpected);
        console.log("RECEIVED:", lActual);
        done(-1);
    }

    done(0);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("clean", (done) =>
    {
        del([DistPath("**/*")], { force: true });
        done();
    },
);

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("compile", (done) => spawnTask(_TSC_, done, ["--build"]));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("copy", gulp.parallel(
    () => Root("tsconfig.json").pipe(DistDest()),
    () => Root(path.join("Config", "**", "*")).pipe(DistDest("Config")),
    () => Root(path.join("Config", "**", ".*")).pipe(DistDest("Config")),
));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("build", gulp.parallel("compile", "copy"));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("eslint-check", (done) => execTask(`${_ESLINT_} .`, done));
gulp.task("eslint-fix", (done) => execTask(`${_ESLINT_} . --fix`, done));
gulp.task("mdlint-check", (done) => execTask(`${_MDLINT_} .`, done));
gulp.task("mdlint-fix", (done) => execTask(`${_MDLINT_} . --fix`, done));

gulp.task("lint-check", gulp.parallel("eslint-check", "mdlint-check"));
gulp.task("lint-fix", gulp.parallel("eslint-fix", "mdlint-fix"));
gulp.task("lint", gulp.task("lint-check"));

// ---------------------------------------------------------------------------------------------------------------------
function getArgs()
{
    let args = {};
    let inProgressArg;

    for (let i = 0; i < process.argv.length; ++i)
    {
        let currentArg = process.argv[i];

        if (currentArg[0] === "-")
        {
            currentArg = currentArg.slice(1);
            if (currentArg[0] === "-")
            {
                currentArg = currentArg.slice(1);
            }

            inProgressArg = currentArg;
        }
        else if (inProgressArg)
        {
            args[inProgressArg] ?? (args[inProgressArg] = []);
            args[inProgressArg].push(currentArg);
            inProgressArg = undefined;
        }
    }

    if (inProgressArg != undefined)
    {
        args[inProgressArg] ?? (args[inProgressArg] = []);
    }

    return args;
}

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("test", (done) =>
{
    const lPathArgs = getArgs()["path"];
    const lFileArgs = getArgs()["file"];
    process.env.ENV__LOGGING_LEVEL = "OFF";

    let lArgs = [];
    if (lPathArgs !== undefined)
    {
        const allDone = _.after(lPathArgs.length, done);
        lPathArgs.forEach((aPath) =>
        {
            lArgs = lArgs.concat(getAllTestFiles(path.join(TestFolder, aPath)))
        });
        lArgs.push("--match");
    }
    else if (lFileArgs !== undefined)
    {
        const lMatchingFiles = getMatchingFiles(lFileArgs, "test");
        if (lMatchingFiles.length === 0)
        {
            done("Could not find any matching test.js files");
            return;
        }

        lArgs = lMatchingFiles;
    }
    else
    {
        lArgs = [...getAllTestFiles(TestFolder)];
    }

    lArgs.push("--verbose");

    spawnTask(_AVA_, done, lArgs);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("demo", (done) =>
{
    // get file name args
    const lFileArgs = getArgs()["file"];
    if (!lFileArgs || lFileArgs.length <= 0) {
        done("ERROR: Must supply file name list via `--file fileName`");
        return;
    }

    // filter demos to those matching file input
    const lMatchingFiles = getMatchingFiles(lFileArgs, "demo");
    if (lMatchingFiles.length === 0)
    {
        done("Could not find any matching demo.js files");
        return;
    }

    // run demos
    lMatchingFiles.unshift("--fail-fast");
    spawnTask(_AVA_, done, lMatchingFiles);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("coverage", (done) => execTask(`${_C8_} ${_AVA_} Test/**/*.test.ts`, done));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("start", (done) =>
{
    execTask(`node ${DistFolder}/Src/App.js`, done);
});

// ---------------------------------------------------------------------------------------------------------------------
// Aliases:
gulp.task("tests-all", gulp.task("test"));
gulp.task("build-test", gulp.series(
    "build",
    "tests-all",
));
gulp.task("build-check-test", gulp.series(
    "build",
    "lint-check",
    "tests-all",
));
gulp.task("build-lint-test", gulp.task("build-check-test"));

// Helper functions:
function spawnTask(command, done, args)
{
    let lCP;
    if (args !== undefined)
    {
        lCP = spawn(command, args, { stdio: "inherit" });
    } 
    else
    {
        lCP = spawn(command, { stdio: "inherit" });
    }
    
    let lError = undefined;
    lCP.on("error", (error) => lError = error);
    
    // catch non-zero exit statuses so that CI can understand when task fails
    lCP.on("close", (code) => {
        if (lError !== undefined) 
        { 
            done(lError);
        }
        else
        {
            done(code !== 0 ? new Error(`Task returned exit code ${code}`) : code );
        }
    })
}

function execTask(command, done)
{
    exec(command, (error, sout, serr) =>
        {
            serr && console.error(serr);
            ProcessExitCode(error);
            done(error);
        }
    ).stdout.pipe(process.stdout);
}

function getMatchingFiles(aFileArgs, aFileType)
{
    // filter files to those matching requested arguments
    const lRegex = new RegExp(`^.*(${aFileArgs.join('|')})\\.${aFileType}\\.js$`);
    const lMatchingFiles = [];
    getAllTestFiles(TestFolder, `.${aFileType}.js`).forEach(aFile =>
    {
        if (lRegex.test(aFile)) { lMatchingFiles.push(aFile); }
    });

    return lMatchingFiles;
}

function getAllTestFiles(aTopDirectory, aFilter = "test.js")
{
    // getTestsFromDir is called recursively until we run out of directories, this function must have access to lFiles
    // in its scope during execution. as such it is not save to move it from the getAllTestFiles scope
    const lFiles = [];
    function getTestsFromDir(aDirectory)
    {
        const lDirFiles = fs.readdirSync(aDirectory);

        for (const lFileName of lDirFiles)
        {
            const lFilePath = path.join(aDirectory, lFileName);
            if (fs.statSync(lFilePath).isDirectory())
            {
                getTestsFromDir(lFilePath);
            }
            else if (lFileName.includes(aFilter))
            {
                lFiles.push(lFilePath);
            }
        }
    }
    getTestsFromDir(aTopDirectory);

    return lFiles;
}

function getAvaCommand(aDirectory)
{
    return _AVA_ +  " " + getAllTestFiles(aDirectory).join(" ");
}

function getAvaArgs(aOption)
{
    const optionArgs = getArgs()[aOption];

    let args = "";

    if ( optionArgs !== undefined)
    {
        if ( optionArgs.length === 0 )
        {
            return ` --${aOption}`;
        }

        optionArgs.forEach((optionArg) =>
        {
            args += ` --${aOption} '${optionArg}'`;
        });
    }

    return args;
}

const ProcessExitCode = (error = null) =>
{
    if (error)
    {
        console.error(`exec error: ${error}`);
        process.exit(1);
    }
};
