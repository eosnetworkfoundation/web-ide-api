// create a promise based on the child process
import childProcess from "child_process";

const exec = (cmd:string, options = {timeout:60*1000}) => new Promise((res, rej) => {
    childProcess.exec(cmd, options, (err, stdout, stderr) => {
        if (err) rej(stderr)
        else res(stdout)
    });
});

export default exec;