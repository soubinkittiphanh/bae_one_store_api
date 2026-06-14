const { SPF } = require('./src/models');

async function seed() {
    try {
        const params = [
            { code: 'LOYALTY_ENABLED', value: 'Y', remark: 'Enable/Disable Customer Loyalty Program (Y/N)' },
            { code: 'LOYALTY_EARN_RATE', value: '10000', remark: 'Amount of local currency spent per 1 point earned' },
            { code: 'LOYALTY_REDEEM_RATE', value: '10', remark: 'Discount amount in local currency per 1 point redeemed' }
        ];

        for (const param of params) {
            const [record, created] = await SPF.findOrCreate({
                where: { code: param.code },
                defaults: param
            });
            if (!created) {
                await record.update(param);
                console.log(`Updated ${param.code}`);
            } else {
                console.log(`Created ${param.code}`);
            }
        }
        process.exit(0);
    } catch (error) {
        console.error('Error seeding SPF:', error);
        process.exit(1);
    }
}

seed();
