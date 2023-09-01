import fs from 'fs';

let interval: any;
export default class CleaningService {
    public static setup(): void {
        clearInterval(interval);

        interval = setInterval(() => {
            CleaningService.clean();
        }, 60 * 60 * 1000); // Every hour

        // Once on startup
        CleaningService.clean();
    }

    public static clean(): void {
        console.log("Attempting to clean old projects from tmp_projects");

        const folders = fs.readdirSync('tmp_projects', { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // open each json file and check if the createdAt is older than 2 months
        folders.forEach(folder => {
            try {
                const json = fs.readFileSync(`tmp_projects/${folder}/${folder}.json`, 'utf8');
                const project = JSON.parse(json);
                const createdAt = new Date(project.createdAt);
                const now = new Date();
                const diff = now.getTime() - createdAt.getTime();
                const days = diff / (1000 * 3600 * 24);
                if(days > 60){
                    console.log("Found old project, deleting: ", folder);
                    fs.rmSync(`tmp_projects/${folder}`, { recursive: true });
                }
            } catch (error) {
                console.error("error loading project files", error);
            }
        });
    }
}
