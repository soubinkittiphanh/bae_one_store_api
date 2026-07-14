const IndochinaBankProvider = require('./IndochinaBankProvider');
const LaoVietBankProvider = require('./LaoVietBankProvider');

class ProviderFactory {
    constructor() {
        this.providers = {
            'IB': new IndochinaBankProvider(),
            'INDOCHINA': new IndochinaBankProvider(),
            'LVB': new LaoVietBankProvider(),
            'LAOVIETBANK': new LaoVietBankProvider()
        };
    }

    getProvider(bankCode) {
        if (!bankCode) {
            // Default provider fallback
            return this.providers['IB'];
        }
        
        const code = bankCode.toUpperCase().trim();
        const provider = this.providers[code];
        
        if (!provider) {
            throw new Error(`Unsupported bank payment provider code: ${bankCode}`);
        }
        
        return provider;
    }
}

module.exports = new ProviderFactory();
