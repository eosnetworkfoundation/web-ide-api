import execute from "../util/execute";
import fs from "fs";
import rimraf from "rimraf";

let localPath:any = null;

export class BuildStatus {
    constructor(public success:boolean, public data: string) {}
}

const deleteProject = (id:string) => {
    try { fs.rmSync(`tmp_projects/${id}/`, { recursive: true }); } catch (error) {}
}
const buildContract = async (id:string): Promise<BuildStatus> => {
    try {
        let project = fs.readFileSync(`tmp_projects/${id}/${id}.json`, 'utf8');
        project = JSON.parse(project);
        return buildContractFromProject(project, id);
    } catch (error) {
        console.error("Missing project files", error);
        return new BuildStatus(false, "Missing project files");
    }
}

const buildContractFromProject = async (project:any, id:string|null = null): Promise<BuildStatus> => {
    if(!id) id = Math.round(Math.random() * 10000000000000) + 100 + "-VSCODE";

    // Make new directory for project
    await rimraf(`tmp_projects/${id}/src`);
    try { fs.mkdirSync(`tmp_projects/${id}/`, { recursive: true }); } catch (error) {}
    try { fs.mkdirSync(`tmp_projects/${id}/src`, { recursive: true }); } catch (error) {}
    fs.writeFileSync(`tmp_projects/${id}/${id}.json`, JSON.stringify(project));

    // Write every file and create directories if the file is in a subdirectory
    project.files.forEach((file:any) => {
        if(file.path !== ""){
            try { fs.mkdirSync(`tmp_projects/${id}/src/${file.path}`, { recursive: true }); } catch (error) {}
        }
        fs.writeFileSync(`tmp_projects/${id}/src/${file.path}${file.name}`, file.content);
    });

    return buildContractFromSource(project, id);
}


const findContractName = (file:any) => {
    try {
        if(file.content.includes('//contractName:')){
            return file.content.split("//contractName:")[1].split("\n")[0].trim();
        }
        else if(file.content.includes('CONTRACT')){
            return file.content.split("CONTRACT")[1].split(":")[0].trim()
        }
        else if(file.content.includes('[[eosio::contract')) {
            return file.content.split(`[[eosio::contract("`)[1].split(`")]]`)[0].trim();
        }
    } catch (error) {
        console.error("Error splitting file", error, file.name);
        return null;
    }

    return null;
}

const buildContractFromSource = async (project:any, id:string): Promise<BuildStatus> => {

    const hasOnlyOneContract = project.files.filter((x:any) => x.name.endsWith(".cpp")).length === 1;
    const hasEntryContracts = project.files.filter((x:any) => x.name.endsWith(".entry.cpp")).length > 0;

    if(!hasOnlyOneContract && !hasEntryContracts){
        return new BuildStatus(false, "Must have only one contract file in the root or an entry file (<name>.entry.cpp).");
    }

    const buildableFiles = (() => {
        if(hasEntryContracts) return project.files.filter((x:any) => x.name.endsWith(".entry.cpp"));
        return project.files.filter((x:any) => x.name.endsWith(".cpp"));
    })();

    let compiledFiles = [];

    try { fs.mkdirSync(`tmp_projects/${id}/build`, { recursive: true }); } catch (error) {}
    try { await execute(`rm tmp_projects/${id}/build/*`); } catch (error) {}

    let timeTaken = Date.now();
    for(let file of buildableFiles){
        const contractName = findContractName(file);
        if(!contractName) return new BuildStatus(false, `No contract name found for: ${file.name}. You can try adding a comment to your cpp entry file with the contract name like this: '//contractName:<name>'`);

        const fileName = file.name.replace(".entry.cpp", "").replace(".cpp", "");

        let buildResult:string = await execute(`cdt-cpp -I tmp_projects/${id}/src/include -o tmp_projects/${id}/build/${fileName}.wasm tmp_projects/${id}/src/${file.name} --contract=${contractName} --abigen --no-missing-ricardian-clause`).catch(x => x) as string;
        if(buildResult !== "") {
            if(!localPath) {
                localPath = (await execute('pwd')) + `/tmp_projects/${id}`;
                localPath = `\\/`+localPath. replace(/(\r\n|\n|\r)/gm, "").split('/').filter((x:any) => !!x).join('\\/');
            }

            const stripped = buildResult.replace(new RegExp(localPath, "g"), "").replace(new RegExp("/"+id+".cpp", "g"), file.name);
            return new BuildStatus(false, stripped);
        }

        // export memory from wasm
        // something is not working with piping in the wat on my env, so using a temp file
        const exportTmp = await execute(
            `wasm2wat tmp_projects/${id}/build/${fileName}.wasm | sed -e 's|(memory |(memory (export "memory") |' > tmp_projects/${id}/build/${fileName}.wat`
        ).then(x => true).catch(err => {
            console.error("Error exporting memory", err);
            return false;
        })
        if(exportTmp) {
            await execute(
                `wat2wasm -o tmp_projects/${id}/build/${fileName}.wasm tmp_projects/${id}/build/${fileName}.wat`
            ).catch(err => {
                console.error("Error exporting memory 2", err);
            })
            try { await execute(`rm tmp_projects/${id}/build/${fileName}.wat`); } catch (error) {}
        }

    }

    timeTaken = Date.now() - timeTaken;
    console.log(`Time taken to build contract: ${timeTaken}ms`);

    const filesInBuildDir = fs.readdirSync(`tmp_projects/${id}/build`);
    if(filesInBuildDir.length === 0) return new BuildStatus(false, "No files in project's build directory");



    // remove any old zips
    try { await execute(`rm tmp_projects/${id}/*.zip`); } catch (error) {}
    try {
        const zipped = await execute(`cd tmp_projects/${id} && zip --junk-paths ${id}.zip -r ./build`);
    } catch (error) {
        console.error("error zipping files", error);
    }

    await rimraf(`tmp_projects/${id}/src`);

    return new BuildStatus(true, id);
}

const downloadProject = async (id:string) => {
    try {
        let project:any = fs.readFileSync(`tmp_projects/${id}/${id}.json`, 'utf8');
        project = JSON.parse(project);

        // Make new directory for project
        try { fs.mkdirSync(`tmp_projects/${id}/src`, { recursive: true }); } catch (error) {}

        // Write every file and create directories if the file is in a subdirectory
        project.files.forEach((file:any) => {
            if(file.path !== "") try { fs.mkdirSync(`tmp_projects/${id}/src/${file.path}`, { recursive: true }); } catch (error) {}
            fs.writeFileSync(`tmp_projects/${id}/src/${file.path}${file.name}`, file.content);
        });

        // zip everything in the src folder into a new zip
        await execute(`cd tmp_projects/${id} && zip project.zip -r src`);
        await execute(`rm -rf tmp_projects/${id}/src`).catch(() => {});

        setTimeout(() => {
            execute(`rm tmp_projects/${id}/project.zip`).catch(() => {});
        }, 60000);

        return new BuildStatus(true, id);
    } catch (error) {
        console.error("Error downloading project", error);
        return new BuildStatus(false, "Error downloading project")
    }
}

export default {
    buildContract,
    buildContractFromProject,
    deleteProject,
    downloadProject
} as const;
