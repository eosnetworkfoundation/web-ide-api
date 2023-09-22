import { Router } from 'express';
import BuildService from "@src/services/BuildService";

const router = Router();


router.get('/', async (req, res) => {
    res.send('ok');
});

router.get('/download/wasm/:id', async (req, res) => {
    const {id} = req.params;
    res.download(`tmp_projects/${id}/${id}.wasm`);
});

router.get('/download/abi/:id', async (req, res) => {
    const {id} = req.params;
    res.download(`tmp_projects/${id}/${id}.abi`);
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
