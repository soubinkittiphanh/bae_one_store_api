const { Op } = require('sequelize');
const db = require('../models');

const captureDailyBalance = async (targetDate = new Date()) => {
    try {
        console.log(`Starting daily balance capture for date: ${targetDate.toISOString()}`);
        
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const dateOnly = startOfDay.toISOString().split('T')[0];

        // Get all distinct products and locations
        const products = await db.product.findAll({ attributes: ['id'] });
        const locations = await db.location.findAll({ attributes: ['id'] });
        
        for (const product of products) {
            for (const location of locations) {
                // Fetch previous day's balance
                const prevDate = new Date(startOfDay);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateStr = prevDate.toISOString().split('T')[0];
                
                const prevRecord = await db.stockDailyBalance.findOne({
                    where: { productId: product.id, locationId: location.id, date: prevDateStr }
                });
                const broughtForward = prevRecord ? prevRecord.balance : 0;
                
                // Initialize counters
                let inAddStock = 0, inSaleReversal = 0, inTransfer = 0, inPurchase = 0;
                let outDeleteStock = 0, outSale = 0, outTransfer = 0;
                
                // 1. Check SALES (outSale)
                const saleLines = await db.saleLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfDay, endOfDay] },
                        isActive: true
                    },
                    include: [{
                        model: db.saleHeader,
                        as: 'header',
                        where: { locationId: location.id } // Match location
                    }]
                });
                saleLines.forEach(line => {
                    // Assuming quantity is stored in `quantity` field
                    outSale += (line.quantity || 0); 
                });

                // 2. Check RECEIVING (inPurchase)
                const receivingLines = await db.receivingLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfDay, endOfDay] },
                        isActive: true
                    },
                    include: [{
                        model: db.receivingHeader,
                        as: 'header',
                        where: { locationId: location.id } // Match location
                    }]
                });
                receivingLines.forEach(line => {
                    // Assuming quantity is stored in `qty` field as per model
                    inPurchase += (line.qty || 0);
                });

                // 3. Check TRANSFERS (inTransfer & outTransfer)
                // IN Transfers (destination is this location)
                const transferInLines = await db.transferLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfDay, endOfDay] },
                        isActive: true
                    },
                    include: [{
                        model: db.transferHeader,
                        as: 'header',
                        where: { desLocationId: location.id } // IN to this location
                    }]
                });
                transferInLines.forEach(line => {
                    inTransfer += (line.quantity || 0);
                });

                // OUT Transfers (source is this location)
                const transferOutLines = await db.transferLine.findAll({
                    where: {
                        productId: product.id,
                        createdAt: { [Op.between]: [startOfDay, endOfDay] },
                        isActive: true
                    },
                    include: [{
                        model: db.transferHeader,
                        as: 'header',
                        where: { srcLocationId: location.id } // OUT from this location
                    }]
                });
                transferOutLines.forEach(line => {
                    outTransfer += (line.quantity || 0);
                });

                // 4. Check CARDS for manual adjustments / unlinked movements
                // Using createdAt instead of card_input_date as requested
                const inCards = await db.card.findAll({
                    where: {
                        productId: product.id,
                        locationId: location.id,
                        createdAt: { [Op.between]: [startOfDay, endOfDay] },
                        receivingLineId: null, // Ignore cards already counted via receiving
                        transferLineId: null, // Ignore cards already counted via transfer
                        saleLineId: null // Ignore cards already counted via sales (e.g. sale reversals)
                    }
                });
                inCards.forEach(card => {
                    inAddStock += (card.stockCardQty || 1); 
                });
                
                const outCards = await db.card.findAll({
                    where: {
                        productId: product.id,
                        locationId: location.id,
                        card_isused: { [Op.ne]: 0 },
                        update_time: { [Op.between]: [startOfDay, endOfDay] },
                        saleLineId: null, // Ignore if linked to sale
                        ticketLineId: null, // Ignore if linked to ticket
                        transferLineId: null // Ignore if linked to transfer
                    }
                });
                outCards.forEach(card => {
                    outDeleteStock += (card.stockCardQty || 1);
                });
                
                const inMovement = inAddStock + inSaleReversal + inTransfer + inPurchase;
                const outMovement = outDeleteStock + outSale + outTransfer;
                const balance = broughtForward + inMovement - outMovement;
                
                // Record the daily snapshot
                if (balance !== 0 || inMovement !== 0 || outMovement !== 0 || broughtForward !== 0) {
                    await db.stockDailyBalance.upsert({
                        productId: product.id,
                        locationId: location.id,
                        date: dateOnly,
                        broughtForward,
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

        console.log(`Successfully completed daily balance capture for ${dateOnly}`);
    } catch (error) {
        console.error('Error capturing daily stock balances:', error);
    }
};

module.exports = {
    captureDailyBalance
};
