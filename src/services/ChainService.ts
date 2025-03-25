import BuildQueueService from "./BuildQueueService";

require('dotenv').config();

// @ts-ignore
import ecc from 'eosjs-ecc';
// @ts-ignore
const accountCreator:string = process.env.TESTNET_ACCOUNT;
// @ts-ignore
const accountCreatorPrivateKey:string = process.env.TESTNET_ACCOUNT_KEY;
const publicKey = ecc.privateToPublic(accountCreatorPrivateKey);


import { Session, Serializer, ABI } from "@wharfkit/session"
import { WalletPluginPrivateKey } from "@wharfkit/wallet-plugin-privatekey"
import {TransactPluginResourceProvider} from '@wharfkit/transact-plugin-resource-provider'

const chain = {
    id: "73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d",
    url: "https://jungle4.greymass.com", // https://jungle4.cryptolions.io:443
}

const walletPlugin = new WalletPluginPrivateKey(accountCreatorPrivateKey)

import fs from 'fs';
import "isomorphic-fetch";

const sessionOpts = {
    transactPlugins: [
        new TransactPluginResourceProvider({
            endpoints: {
                '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d':
                    'https://jungle4.greymass.com',
            },
            allowFees: true,
        }),
    ],
};
const session = new Session({
    actor: accountCreator,
    permission: "active",
    chain,
    walletPlugin,
}, sessionOpts)

export class ChainStatus {
    constructor(public success:boolean, public data: any) {}
}

export default class ChainService {

    static spamFaucet() {
        setInterval(async () => {
            const result = await session.transact({
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
        return await session.client.v1.chain.get_account(accountName).then((result:any) => {
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
        const result = await session.transact({
            actions: [{
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
        });
        return accountName;
    }

    static async addCodePermissionToJungleAccount(account:string){
        // Add eosio.code permission to active permission
        const result = await session.transact({
            actions: [{
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
        });
    }

    static async trySetJungleContract(account:string, wasm:any, abi:any, tries:number = 0): Promise<boolean|string> {
        const estimatedRam = (wasm.length * 10) + JSON.stringify(abi).length + 100;
        const result = await session.transact({
            actions: [{
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
                    abi: Serializer.encode({
                        object: abi,
                        type: ABI
                    }),
                },
            }]
        }).then((result:any) => {
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

    static async setJungleContract(account:string, id:string, contract:string): Promise<boolean|string> {
        let wasm:any;
        let abi:any;

        try {
            wasm = fs.readFileSync(`tmp_projects/${id}/build/${contract}.wasm`).toString('hex');
        } catch (error) {
            throw new Error("You must build your project before deploying it");
        }

        try {
            abi = JSON.parse(fs.readFileSync(`tmp_projects/${id}/build/${contract}.abi`, 'utf8'))
        } catch (error) {
            throw new Error("You must build your project before deploying it");
        }

        return this.trySetJungleContract(account, wasm, abi);
    }

    static async deployProjectToTestnet(network:string, id:string, contract:string, build:boolean): Promise<ChainStatus> {
        if(network !== "jungle"){
            return new ChainStatus(false, "network not supported");
        }
        try {
            if(build) {
                const built = await BuildQueueService.buildContract(id);
                if (!built.success) return new ChainStatus(false, built.data);
            }

            // remove .cpp or .entry.cpp
            contract = contract.replace(/\.entry\.cpp/g, "").replace(/\.cpp/g, "");

            const newJungleAccount = await this.createJungleAccount();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.addCodePermissionToJungleAccount(newJungleAccount);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const result = await this.setJungleContract(newJungleAccount, id, contract);


            if(result === true){
                let abi = JSON.parse(fs.readFileSync(`tmp_projects/${id}/build/${contract}.abi`, 'utf8'))
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
        // REALLY hacky way to estimate possible RAM usage
        const estimatedRam = JSON.stringify(actionData.params).length + 1000;
        try {
            return await session.transact({
                actions: [{
                    account: 'eosio',
                    name: 'buyrambytes',
                    authorization: [{
                        actor: accountCreator,
                        permission: 'active',
                    }],
                    data: {
                        payer: accountCreator,
                        receiver: senderAccount,
                        bytes: estimatedRam,
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
            }).then(result => {
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
            const result = await session.client.v1.chain.get_table_rows({
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
