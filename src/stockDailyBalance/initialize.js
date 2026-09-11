const { Op } = require('sequelize');
const db = require('../models');
const { captureDailyBalance } = require('./service');

(async () => {
    try {
        console.log('--- Starting One-Time Historical Initialization ---');
        await db.sequelize.authenticate();

        // Target: Day before yesterday (to establish the initial broughtForward for yesterday)
        const dayBeforeYesterday = new Date();
        dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
        
        const startOfTime = new Date('2000-01-01T00:00:00.000Z');
        const endOfDayBeforeYesterday = new Date(dayBeforeYesterday);
        endOfDayBeforeYesterday.setHours(23, 59, 59, 999);
        
        const dateStr = endOfDayBeforeYesterday.toISOString().split('T')[0];
        
        console.log(`Calculating all historical stock movements from beginning of time up to ${dateStr}...`);

        const products = await db.product.findAll({ attributes: ['id'] });
        const locations = await db.location.findAll({ attributes: ['id'] });

        for (const product of products) {
            for (const location of locations) {
                
                let inAddStock = 0, inSaleReversal = 0, inTransfer = 0, inPurchase = 0;
                let outDeleteStock = 0, outSale = 0, outTransfer = 0;
                
                // 1. Check SALES (outSale)
                const saleLines = await db.saleLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        isActive: true
                    },
                    include: [{
                        model: db.saleHeader,
                        as: 'header',
                        where: { locationId: location.id } 
                    }]
                });
                saleLines.forEach(line => outSale += (line.quantity || 0));

                // 2. Check RECEIVING (inPurchase)
                const receivingLines = await db.receivingLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        isActive: true
                    },
                    include: [{
                        model: db.receivingHeader,
                        as: 'header',
                        where: { locationId: location.id } 
                    }]
                });
                receivingLines.forEach(line => inPurchase += (line.qty || 0));

                // 3. Check TRANSFERS
                const transferInLines = await db.transferLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        isActive: true
                    },
                    include: [{
                        model: db.transferHeader,
                        as: 'header',
                        where: { desLocationId: location.id } 
                    }]
                });
                transferInLines.forEach(line => inTransfer += (line.quantity || 0));

                const transferOutLines = await db.transferLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        isActive: true
                    },
                    include: [{
                        model: db.transferHeader,
                        as: 'header',
                        where: { srcLocationId: location.id } 
                    }]
                });
                transferOutLines.forEach(line => outTransfer += (line.quantity || 0));

                // 4. Check CARDS
                const inCards = await db.card.findAll({
                    where: {
                        productId: product.id,
                        locationId: location.id,
                        createdAt: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        receivingLineId: null,
                        transferLineId: null,
                        saleLineId: null 
                    }
                });
                inCards.forEach(card => inAddStock += (card.stockCardQty || 1));
                
                const outCards = await db.card.findAll({
                    where: {
                        productId: product.id,
                        locationId: location.id,
                        card_isused: { [Op.ne]: 0 },
                        update_time: { [Op.between]: [startOfTime, endOfDayBeforeYesterday] },
                        saleLineId: null,
                        ticketLineId: null,
                        transferLineId: null
                    }
                });
                outCards.forEach(card => outDeleteStock += (card.stockCardQty || 1));
                
                const inMovement = inAddStock + inSaleReversal + inTransfer + inPurchase;
                const outMovement = outDeleteStock + outSale + outTransfer;
                const balance = inMovement - outMovement; // broughtForward is 0 since this is the start of time
                
                if (balance !== 0 || inMovement !== 0 || outMovement !== 0) {
                    await db.stockDailyBalance.upsert({
                        productId: product.id,
                        locationId: location.id,
                        date: dateStr,
                        broughtForward: 0,
                        inMovement,
                        outMovement,
                        balance,
                        inAddStock,
                        inSaleReversal,
                        inTransfer,
                        inPurchase,
                        outDeleteStock,
                        outSale,
                        outTransfer
                    });
                }
            }
        }
        
        console.log(`Historical baseline established up to ${dateStr}!`);
        
        // NOW we can calculate yesterday's data normally, which will correctly pick up the baseline!
        console.log('--- Now capturing standard daily balance for Yesterday ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await captureDailyBalance(yesterday);

        console.log('All done! System is fully initialized and ready for future cron jobs.');
        process.exit(0);
        
    } catch (error) {
        console.error('Initialization failed:', error);
        process.exit(1);
    }
})();
