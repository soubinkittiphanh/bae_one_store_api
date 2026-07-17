const db = require('./src/models');

async function seed() {
    console.log("Starting Dynamic QR parameter and bank configuration seeding...");
    try {
        // 1. Seed Indochina Bank (IB) UAT configuration
        const ibConfig = {
            apiUrl: 'https://ibapigwuat.iblaos.com/IBInterBankServices',
            memberId: 'KOKKOKMOV',
            password: '2RBKKUO6PHZ3XYOUSIGFH5W8Y5T71X362EWJ0DFYBYKNANABW4',
            merchantId: '000000000001749'
        };

        const [ibBank, ibCreated] = await db.bank.findOrCreate({
            where: { code: 'IB' },
            defaults: {
                bank_name: 'Indochina Bank',
                bank_remark: 'Indochina Bank dynamic QR integration',
                config: ibConfig,
                isActive: true
            }
        });

        if (ibCreated) {
            console.log("- Successfully seeded Indochina Bank (IB) configuration.");
        } else {
            console.log("- Indochina Bank (IB) already exists. Updating configuration to UAT defaults...");
            ibBank.config = ibConfig;
            await ibBank.save();
        }

        // 2. Seed LaoVietBank (LVB) UAT configuration
        const lvbConfig = {
            apiUrl: 'https://laovietbank.com.la:5678',
            privateKey: 'eaYKHfjmy9UZ4KqdEs2uIpXgsEKYqj',
            serviceId: '055022',
            merchantId: '055022_1',
            merchantName: 'SATHAPHONE MINI MART',
            username: '055022_1',
            password: 'ZIvsHAQyRJ2RfvcE'
        };

        const [lvbBank, lvbCreated] = await db.bank.findOrCreate({
            where: { code: 'LVB' },
            defaults: {
                bank_name: 'LaoVietBank',
                bank_remark: 'LaoVietBank dynamic QR integration',
                config: lvbConfig,
                isActive: true
            }
        });

        if (lvbCreated) {
            console.log("- Successfully seeded LaoVietBank (LVB) configuration.");
        } else {
            console.log("- LaoVietBank (LVB) already exists. Updating configuration to UAT defaults...");
            lvbBank.config = lvbConfig;
            await lvbBank.save();
        }

        // 3. Seed DYN_QR = Y (Enable Dynamic QR payments)
        const [dynQrRecord, dynQrCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_QR' },
            defaults: {
                value: 'Y',
                remark: 'Enable dynamic QR code generation (Y/N)',
                isActive: true
            }
        });
        if (dynQrCreated) {
            console.log("- Seeded DYN_QR system parameter enabled (Y).");
        } else {
            console.log("- DYN_QR system parameter already exists. Ensuring it is enabled (Y)...");
            dynQrRecord.value = 'Y';
            await dynQrRecord.save();
        }

        // 4. Seed DYN_QR_BankCode = IB (Default Active Bank Provider)
        const [spfRecord, spfCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_QR_BankCode' },
            defaults: {
                value: 'IB',
                remark: 'Active dynamic QR bank code: IB or LVB',
                isActive: true
            }
        });
        if (spfCreated) {
            console.log("- Seeded DYN_QR_BankCode system parameter. Default: IB");
        } else {
            console.log("- DYN_QR_BankCode system parameter already exists.");
        }

        // 5. Seed DYN_MemberId (Fallback Override)
        const [memberIdRecord, memberIdCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_MemberId' },
            defaults: {
                value: 'KOKKOKMOV',
                remark: 'Dynamic QR Bank Member ID fallback override',
                isActive: true
            }
        });
        if (memberIdCreated) {
            console.log("- Seeded DYN_MemberId system parameter.");
        }

        // 6. Seed DYN_MerchantId (Fallback Override)
        const [merchantIdRecord, merchantIdCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_MerchantId' },
            defaults: {
                value: '000000000001749',
                remark: 'Dynamic QR Bank Merchant ID fallback override',
                isActive: true
            }
        });
        if (merchantIdCreated) {
            console.log("- Seeded DYN_MerchantId system parameter.");
        }

        // 7. Seed DYN_Password (Fallback Override)
        const [pwdRecord, pwdCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_Password' },
            defaults: {
                value: '2RBKKUO6PHZ3XYOUSIGFH5W8Y5T71X362EWJ0DFYBYKNANABW4',
                remark: 'Dynamic QR Bank Password fallback override',
                isActive: true
            }
        });
        if (pwdCreated) {
            console.log("- Seeded DYN_Password system parameter.");
        }

        // 8. Seed DYN_CallbackUrl (Fallback Override)
        const [callbackRecord, callbackCreated] = await db.spf.findOrCreate({
            where: { code: 'DYN_CallbackUrl' },
            defaults: {
                value: 'http://150.95.31.23:8026/api/v1/direct/callback',
                remark: 'Dynamic QR payment status callback URL override',
                isActive: true
            }
        });
        if (callbackCreated) {
            console.log("- Seeded DYN_CallbackUrl system parameter.");
        }

        console.log("Seeding complete!");
        process.exit(0);
    } catch (error) {
        console.error("Error during dynamic QR seeding:", error);
        process.exit(1);
    }
}

seed();
