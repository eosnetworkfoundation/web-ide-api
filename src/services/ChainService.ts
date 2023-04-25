import BuildQueueService from "./BuildQueueService";

require('dotenv').config();
import fs from 'fs';
import {Api, JsonRpc, RpcError, Serialize} from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';
import { TextDecoder, TextEncoder } from 'util';
import "isomorphic-fetch";
import BuildService from './BuildService';
// @ts-ignore
import ecc from 'eosjs-ecc';

// @ts-ignore
const accountCreator:string = process.env.TESTNET_ACCOUNT;
// @ts-ignore
const accountCreatorPrivateKey:string = process.env.TESTNET_ACCOUNT_KEY;
const publicKey = ecc.privateToPublic(accountCreatorPrivateKey);
const signatureProvider = new JsSignatureProvider([accountCreatorPrivateKey]);

const newaccountPermission = {
    threshold: 1,
    keys: [],
    accounts: [
        {
            permission: {
                actor: accountCreator,
                permission: 'active'
            },
            weight: 1
        }
    ],
    waits: []
};

const JUNGLE_API = process.env.JUNGLE_API || "https://jungle4.cryptolions.io:443";
const jungleRpc = new JsonRpc(JUNGLE_API, { fetch });
// @ts-ignore
const jungleApi = new Api({ rpc:jungleRpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

export class ChainStatus {
    constructor(public success:boolean, public data: any) {}
}

export default class ChainService {

    static spamFaucet() {
        setInterval(async () => {
            const result = await jungleApi.transact({
                actions: [{
                    account: 'eosio.faucet',
                    name: 'send',
                    authorization: [{
                        actor: accountCreator,
                        permission: 'active',
                    }],
                    data: {
                        to: accountCreator,
                        nonce: null
                    },
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30,
            }).catch((error:any) => {});
        }, 1000);
    }

    static generateEosAccountName(): string {
        const regex = /(^[a-z1-5.]{0,11}[a-z1-5]$)|(^[a-z1-5.]{12}[a-j1-5]$)/;
        let accountName = "";
        while(!accountName.match(regex)){
            accountName = `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`.substring(0, 12);
        }
        return accountName;
    }

    static async jungleAccountExists(accountName:string): Promise<boolean> {
        return await jungleRpc.get_account(accountName).then((result:any) => {
            return true;
        }).catch((error:any) => {
            return false;
        });
    }

    static async findAvailableJungleAccountName(): Promise<string> {
        let accountName = this.generateEosAccountName();
        while(await this.jungleAccountExists(accountName)){
            accountName = this.generateEosAccountName();
        }
        return accountName;
    }

    static async createJungleAccount(): Promise<string> {
        const accountName = await this.findAvailableJungleAccountName();
        const result = await jungleApi.transact({
            actions: [{
                account: 'eosio',
                name: 'powerup',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    payer: accountCreator,
                    receiver: accountCreator,
                    days: 1,
                    net_frac: 100000000000,
                    cpu_frac: 100000000000,
                    max_payment: '1.0000 EOS',
                },
            },{
                account: 'eosio.faucet',
                name: 'create',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    account: accountName,
                    key: publicKey
                },
            }]
        }, {
            blocksBehind: 3,
            expireSeconds: 30,
        });
        return accountName;
    }

    static async addCodePermissionToJungleAccount(account:string){
        // Add eosio.code permission to active permission
        const result = await jungleApi.transact({
            actions: [{
                account: 'eosio',
                name: 'powerup',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    payer: accountCreator,
                    receiver: account,
                    days: 1,
                    net_frac: 100000000000,
                    cpu_frac: 100000000000,
                    max_payment: '1.0000 EOS',
                },
            },{
                account: 'eosio',
                name: 'updateauth',
                authorization: [{
                    actor: account,
                    permission: 'active',
                }],
                data: {
                    account: account,
                    permission: 'active',
                    parent: 'owner',
                    auth: {
                        threshold: 1,
                        keys: [
                            {
                                key: publicKey,
                                weight: 1
                            }
                        ],
                        accounts: [
                            {
                                permission: {
                                    actor: account,
                                    permission: 'eosio.code'
                                },
                                weight: 1

                            }
                        ],
                        waits: []
                    }
                }
            }]
        }, {
            blocksBehind: 3,
            expireSeconds: 30,
        });
    }

    static async trySetJungleContract(account:string, wasm:any, abi:any, tries:number = 0): Promise<boolean|string> {
        const estimatedRam = ((wasm.length/2) * 10) + 100;
        const result = await jungleApi.transact({
            actions: [{
                account: 'eosio',
                name: 'powerup',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    payer: accountCreator,
                    receiver: account,
                    days: 1,
                    net_frac: 100000000000,
                    cpu_frac: 100000000000,
                    max_payment: '2.0000 EOS',
                },
            },{
                account: 'eosio',
                name: 'powerup',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    payer: accountCreator,
                    receiver: accountCreator,
                    days: 1,
                    net_frac: 100000000000,
                    cpu_frac: 100000000000,
                    max_payment: '2.0000 EOS',
                },
            },{
                account: 'eosio',
                name: 'buyrambytes',
                authorization: [{
                    actor: accountCreator,
                    permission: 'active',
                }],
                data: {
                    payer: accountCreator,
                    receiver: account,
                    bytes: estimatedRam,
                },
            },{
                account: 'eosio',
                name: 'setcode',
                authorization: [{
                    actor: account,
                    permission: 'active',
                }],
                data: {
                    account: account,
                    vmtype: 0,
                    vmversion: 0,
                    code: wasm,
                },
            },{
                account: 'eosio',
                name: 'setabi',
                authorization: [{
                    actor: account,
                    permission: 'active',
                }],
                data: {
                    account: account,
                    abi,
                },
            }]
        }, {
            blocksBehind: 3,
            expireSeconds: 30,
        }).then((result:any) => {
            console.log("contract deployed to jungle", result);
            return true;
        }).catch((error:any) => {
            console.error("error deploying contract to jungle", error);
            return error;
        });

        if(result === true){
            return true;
        }

        if(tries < 3){
            return await this.trySetJungleContract(account, wasm, abi, tries + 1);
        }

        return result;
    }

    static async setJungleContract(account:string, id:string): Promise<boolean|string> {
        let wasm:any;
        let abi:any;

        try {
            wasm = fs.readFileSync(`tmp_projects/${id}/${id}.wasm`).toString('hex');
        } catch (error) {
            throw new Error("You must build your project before deploying it");
        }

        const buffer = new Serialize.SerialBuffer({
            textEncoder: jungleApi.textEncoder,
            textDecoder: jungleApi.textDecoder,
        })

        try {
            abi = JSON.parse(fs.readFileSync(`tmp_projects/${id}/${id}.abi`, 'utf8'))
        } catch (error) {
            throw new Error("You must build your project before deploying it");
        }

        const abiDefinitions = jungleApi.abiTypes.get('abi_def')

        // @ts-ignore
        abi = abiDefinitions.fields.reduce(
            (acc, { name: fieldName }) =>
                Object.assign(acc, { [fieldName]: acc[fieldName] || [] }),
            abi
        )
        // @ts-ignore
        abiDefinitions.serialize(buffer, abi)
        const serializedAbiHexString = Buffer.from(buffer.asUint8Array()).toString('hex')

        return this.trySetJungleContract(account, wasm, serializedAbiHexString);
    }

    static async deployProjectToTestnet(network:string, id:string, build:boolean): Promise<ChainStatus> {
        if(network !== "jungle"){
            return new ChainStatus(false, "network not supported");
        }
        try {
            if(build) {
                const built = await BuildQueueService.buildContract(id);
                if (!built.success) return new ChainStatus(false, built.data);
            }

            const newJungleAccount = await this.createJungleAccount();
            await this.addCodePermissionToJungleAccount(newJungleAccount);
            const result = await this.setJungleContract(newJungleAccount, id);

            if(result === true){
                let abi = JSON.parse(fs.readFileSync(`tmp_projects/${id}/${id}.abi`, 'utf8'))
                const details = {
                    account: newJungleAccount,
                    actions: abi.actions.map((action:any) => {
                        return {
                            name: action.name,
                            params: abi.structs.find((struct:any) => struct.name === action.type).fields.map((field:any) => {
                                return {
                                    name: field.name,
                                    type: field.type
                                }
                            })
                        }
                    }),
                    tables: abi.tables.map((table:any) => ({
                       name:table.name
                    }))
                }
                return new ChainStatus(true, details);
            }

            return new ChainStatus(false, result);
        } catch (error) {
            console.error("error deploying project files", error);
            if(typeof error === "string") return new ChainStatus(false, error);
            return new ChainStatus(false, error);
        }
    }


    static async interactWithContract(network:string, contract:string, actionData:any, senderAccount:string): Promise<any> {
        if(network !== "jungle"){
            return new ChainStatus(false, "network not supported");
        }
        try {
            console.log('contract', contract);
            return await jungleApi.transact({
                actions: [{
                    account: 'eosio',
                    name: 'powerup',
                    authorization: [{
                        actor: accountCreator,
                        permission: 'active',
                    }],
                    data: {
                        payer: accountCreator,
                        receiver: senderAccount,
                        days: 1,
                        net_frac: 100000000000,
                        cpu_frac: 100000000000,
                        max_payment: '2.0000 EOS',
                    },
                },{
                    account: contract,
                    name: actionData.action,
                    authorization: [{
                        actor: senderAccount,
                        permission: 'active',
                    }],
                    data: actionData.params,
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30,
            }).then(result => {
                console.log("contract deployed to jungle", result);
                return new ChainStatus(true, result);
            }).catch((error:any) => {
                console.error("error interacting with contract", error);
                return new ChainStatus(false, error.toString());
            });
        } catch (error) {
            console.error("error interacting with contract", error);
            return new ChainStatus(false, error);
        }
    }

    static async getTableData(network:string, contract:string, table:string, scope:string): Promise<any> {
        if(network !== "jungle"){
            return new ChainStatus(false, "network not supported");
        }
        try {
            const result = await jungleApi.rpc.get_table_rows({
                json: true,
                code: contract,
                scope: scope,
                table: table,
                limit: 1000,
            });
            return new ChainStatus(true, result.rows);
        } catch (error) {
            console.error("error getting table data", error);
            return new ChainStatus(false, error);
        }
    }

}