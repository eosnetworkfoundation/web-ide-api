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


const findContractName = (project:any) => {
  // project example: { files: [{name: "filename", path:"subdir path", content: "filecontent"}]
    let contractName;
    for(let file of project.files){
      try {
        if(file.content.includes('CONTRACT')){
          contractName = file.content.split("CONTRACT")[1].split(":")[0].trim()
        }
        else if(file.content.includes('[[eosio::contract')) {
          contractName = file.content.split(`[[eosio::contract("`)[1].split(`")]]`)[0].trim();
        }
      } catch (error) {
        console.error("Error splitting file", file);
      }

      if(contractName) return contractName;
    }

    return null;
}

const buildContractFromSource = async (project:any, id:string): Promise<BuildStatus> => {

  // Must have only one cpp entry file in the root
  const rootCppFile = project.files.filter((x:any) => x.name.endsWith(".cpp") && x.path === "");
  if(rootCppFile.length !== 1)
    return new BuildStatus(false, "No contract file found.");

  const contractName = findContractName(project);
  if(!contractName) return new BuildStatus(false, "No contract name found.");

  let timeTaken = Date.now();
  let buildResult:string = await execute(`cdt-cpp -I include -o tmp_projects/${id}/${id}.wasm tmp_projects/${id}/src/${rootCppFile[0].name} --contract=${contractName} --abigen --no-missing-ricardian-clause`).catch(x => x) as string;
  timeTaken = Date.now() - timeTaken;
  console.log(`Time taken to build contract: ${timeTaken}ms`);

  // export memory from wasm
  // something is not working with piping in the wat on my env, so using a temp file
  const export_tmp = await execute(
      `wasm2wat tmp_projects/${id}/${id}.wasm | sed -e 's|(memory |(memory (export "memory") |' > tmp_projects/${id}/${id}.wat`
  ).then(x => true).catch(err => {
    console.error("Error exporting memory", err);
    return false;
  })
  if(export_tmp) {
    await execute(
        `wat2wasm -o tmp_projects/${id}/${id}.wasm tmp_projects/${id}/${id}.wat`
    ).catch(err => {
      console.error("Error exporting memory 2", err);
    })
    try { await execute(`rm tmp_projects/${id}/${id}.wat`); } catch (error) {}
  }

  const success = buildResult === "";
  if(success) {
    // remove any old zips
    try { await execute(`rm tmp_projects/${id}/*.zip`); } catch (error) {}
    try {
      await execute(`cd tmp_projects/${id}/ && zip --junk-paths ${id}.zip ${id}.wasm ${id}.abi`);
    } catch (error) {
      console.error("error zipping files", error);
    }
  }

  await rimraf(`tmp_projects/${id}/src`);


  // Stripping off local path for security reasons
  if(!localPath) {
    localPath = (await execute('pwd')) + `/tmp_projects/${id}`;
    localPath = `\\/`+localPath. replace(/(\r\n|\n|\r)/gm, "").split('/').filter((x:any) => !!x).join('\\/');
  }
  const stripped = buildResult.replace(new RegExp(localPath, "g"), "").replace(new RegExp("/"+id+".cpp", "g"), `contract.cpp`);
  return new BuildStatus(success, !success ? stripped : id);
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
