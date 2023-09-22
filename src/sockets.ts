import fs from "fs";
import BuildService from "@src/services/BuildService";
import { uuid } from 'uuidv4';
import ChainService from "@src/services/ChainService";
import BuildQueueService from "@src/services/BuildQueueService";

export default (ws:any) => {
    //connection is up, let's add a simple simple event
    ws.on('message', (message: string) => {

        if(!message.includes("{")) return console.error("invalid message", message);

        let json;
        try {
            json = JSON.parse(message);
        } catch (error) {
            return console.error("error parsing json", message);
        }

        console.log(json.type);

        if(json.type === "build") return build(ws, json);
        if(json.type === "load") return load(ws, json);
        if(json.type === "save") return save(ws, json);
        if(json.type === "deploy") return deploy(ws, json);
        if(json.type === "interact") return interact(ws, json);
        if(json.type === "table-data") return getTableData(ws, json);
        if(json.type === "download-project") return downloadProject(ws, json);
        console.error("unknown message type", json.type);
    });

    ws.send(JSON.stringify({type: 'connected', data: true}));
}

const save = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid save message", json);
    if(!json.data.id){
        json.data.id = `contract-${uuid()}`;
    }

    try { fs.mkdirSync(`tmp_projects/${json.data.id}/`, { recursive: true });
    } catch (error) {}
    fs.writeFileSync(`tmp_projects/${json.data.id}/${json.data.id}.json`, JSON.stringify(json.data));

    ws.send(JSON.stringify({type: 'saved', data: json.data.id}));
}

const load = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid load message", json);
    try {
        const project = fs.readFileSync(`tmp_projects/${json.data}/${json.data}.json`, 'utf8');
        ws.send(JSON.stringify({type: 'loaded', data: project}));
    } catch (error) {
        console.error("error loading project files", error);
        ws.send(JSON.stringify({type: 'no-project', data: null}));
    }
}

const build = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data || !json.data.id) return console.error("invalid build message", json);
    const {id} = json.data;

    // Only 1 cpp file for now
    try {
        // BuildService.buildContract(id).then((result:any) => {
        BuildQueueService.buildContract(id).then((result:any) => {
            ws.send(JSON.stringify({type: 'build-status', data: result}));
        });
    } catch (error) {
        console.error("error building project files", error);
    }
}

const deploy = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid deploy message", json);
    const {network, id, build} = json.data;
    if(!network || !id || !build) return console.error("invalid deploy message", json);

    try {
        ChainService.deployProjectToTestnet(network, id, build).then((result:any) => {
            ws.send(JSON.stringify({type: 'deploy-status', data: result}));
        });
    } catch (error) {
        console.error("error deploying project files", error);
    }
}

const interact = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid interact message", json);
    const {network, contract, actionData, senderAccount} = json.data;
    if(!network || !contract || !actionData || !senderAccount) return console.error("invalid interact message", json);

    try {
        ChainService.interactWithContract(network, contract, actionData, senderAccount).then((result:any) => {
            ws.send(JSON.stringify({type: 'interaction-status', data: result}));
        });
    } catch (error) {
        console.error("error interacting", error);
    }
}
const getTableData = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid table-data message", json);
    const {network, contract, table, scope} = json.data;
    if(!network || !contract || !table || !scope) return console.error("invalid table-data message", json);

    try {
        ChainService.getTableData(network, contract, table, scope).then((result:any) => {
            ws.send(JSON.stringify({type: 'table-result', data: result}));
        });
    } catch (error) {
        console.error("error getting table data", error);
    }
}
const downloadProject = async (ws:any, json:any): Promise<void> => {
    if(!json || !json.data) return console.error("invalid download-project message", json);
    const {id} = json.data;
    if(!id) return console.error("invalid download-project message", json);

    try {
        BuildService.downloadProject(id).then((result:any) => {
            ws.send(JSON.stringify({type: 'download-result', data: result}));
        });
    } catch (error) {
        console.error("error getting table data", error);
    }
}