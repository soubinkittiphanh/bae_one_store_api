const logger = require("../api/logger");
const { poHeader: PoHeader, poLine: PoLine, receivingLine: ReceivingLine, receivingHeader: ReceivingHeader } = require('../models');

const assignLineHeaderId = (headerId, lines) => {
    for (const iterator of lines) {
        iterator.headerId = headerId
        iterator.poHeaderId = headerId
    }
    logger.warn(`line tostring ${JSON.stringify(lines)}`)
    return lines;
}

const updatePoStatus = async (poHeaderId, transaction) => {
    if (!poHeaderId) return;
    try {
        const poHeader = await PoHeader.findByPk(poHeaderId, {
            include: [{ model: PoLine, as: 'lines', where: { isActive: true }, required: false }],
            transaction
        });

        if (!poHeader) {
            logger.warn(`PO Header with ID ${poHeaderId} not found for status update.`);
            return;
        }

        // Fetch all active receiving lines pointing to PO lines of this PO
        const activeReceivingLines = await ReceivingLine.findAll({
            include: [
                {
                    model: ReceivingHeader,
                    as: 'header',
                    where: { poHeaderId, isActive: true }
                }
            ],
            where: { isActive: true },
            transaction
        });

        // Sum received qty per PO line
        const receivedQtyMap = {};
        for (const line of activeReceivingLines) {
            const poLineId = line.poLineId;
            if (poLineId) {
                receivedQtyMap[poLineId] = (receivedQtyMap[poLineId] || 0) + (line.qty || 0);
            }
        }

        let allCompleted = true;
        let anyReceived = false;
        const activePoLines = poHeader.lines || [];

        for (const poLine of activePoLines) {
            const receivedQty = receivedQtyMap[poLine.id] || 0;
            if (receivedQty < poLine.qty) {
                allCompleted = false;
            }
            if (receivedQty > 0) {
                anyReceived = true;
            }
        }

        let newStatus = poHeader.status;
        if (activePoLines.length === 0) {
            // Keep as-is if no active lines exist
        } else if (allCompleted) {
            newStatus = 'COMPLETED';
        } else if (anyReceived) {
            newStatus = 'PARTIAL';
        } else {
            // Revert status if previously received but all receipts were removed/cancelled
            if (poHeader.status === 'PARTIAL' || poHeader.status === 'COMPLETED') {
                newStatus = 'APPROVED';
            }
        }

        if (newStatus !== poHeader.status) {
            logger.info(`Updating PO #${poHeaderId} status from ${poHeader.status} to ${newStatus}`);
            await poHeader.update({ status: newStatus }, { transaction });
        }
    } catch (error) {
        logger.error(`Error updating PO status for PO #${poHeaderId}: ${error}`);
        throw error;
    }
}

module.exports = {
    assignLineHeaderId,
    updatePoStatus,
}