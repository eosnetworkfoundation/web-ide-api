import ChainService from '../src/services/ChainService';
import { expect } from 'chai';

describe('DeployService tests', () => { // the tests container
    it('should be able to generate valid EOS account names', () => { // the single tests
        for(let i = 0; i < 20; i++){
            const accountName = ChainService.generateEosAccountName();
            console.log(accountName);
        }
    });// the tests container
    it('should be able to deploy a contract', async () => { // the single tests
        console.log(JSON.stringify(await ChainService.deployProjectToTestnet('jungle', 'contract-9b876cb8-5dd2-4b5d-a5ef-037a79b42f2f'), null, 4));
    });
});