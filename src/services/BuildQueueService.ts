import BuildService, {BuildStatus} from "@src/services/BuildService";
import * as process from "process";

let queue:Array<any> = [];
let processing = 0;

const MAX_PROCESSING = process.env.MAX_PROCESSING || 5;
export default class BuildQueueService {

    static setup = () => {
        setInterval(async () => {
            if(processing > 5) return;
            if(queue.length > 0) {
                processing++;
                console.log(`Processing ${processing}/${queue.length} items in build queue`);
                const queueItem = queue.shift();
                const result = await BuildService.buildContract(queueItem.id);
                queueItem.res(result);
                processing--;
            }
        }, 20);
    }

    static buildContract = async (id:string): Promise<BuildStatus> => {
        console.log(`Added ${id} to build queue`);
        return new Promise((res, rej) => {
            queue.push({id, res, rej});
        });
    }

}