import { Router } from 'express';
import BuildService from "@src/services/BuildService";
import fs from "fs";

const router = Router();


router.get('/', async (req, res) => {
    res.send('ok');
});

router.get('/download/wasm/:id', async (req, res) => {
    const {id} = req.params;
    const allFilesInBuildFolder = fs.readdirSync(`tmp_projects/${id}/build`);
    const wasmFile = allFilesInBuildFolder.find((file:any)  => file.endsWith('.wasm'));
    res.download(`tmp_projects/${id}/build/${wasmFile}`);
});

router.get('/download/abi/:id', async (req, res) => {
    const {id} = req.params;
    const allFilesInBuildFolder = fs.readdirSync(`tmp_projects/${id}/build`);
    const abiFile = allFilesInBuildFolder.find((file:any) => file.endsWith('.abi'));
    res.download(`tmp_projects/${id}/build/${abiFile}`);
});

router.get('/download/wasm/:id/:contract', async (req, res) => {
    const {id, contract} = req.params;
    res.download(`tmp_projects/${id}/build/${contract}.wasm`);
});

router.get('/download/abi/:id/:contract', async (req, res) => {
    const {id, contract} = req.params;
    res.download(`tmp_projects/${id}/build/${contract}.abi`);
});

router.get('/download/zip/:id', async (req, res) => {
    const {id} = req.params;
    res.download(`tmp_projects/${id}/${id}.zip`);
});

router.get('/download/project/:id', async (req, res) => {
    const {id} = req.params;
    res.download(`tmp_projects/${id}/project.zip`);
});

router.post('/build', async (req, res) => {
    const project = req.body;
    const result = await BuildService.buildContractFromProject(project);
    setTimeout(() => {
        BuildService.deleteProject(result.data);
    }, 60000);
    res.send(result);
});

export default router;
