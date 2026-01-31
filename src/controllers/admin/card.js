const Db = require('../../config/dbcon')

const deleteCard = async (req, res) => {
    try {
        const { card_id, user_id } = req.body;
        
        // Validation
        if (!card_id || !user_id) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: card_id and user_id"
            });
        }
        
        const value_date = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000)
            .toJSON().slice(0, 19).replace('T', ' ');
            
        console.log("************* CARD DELETE *****************");
        console.log("************* DATE TIME " + value_date + "*****************");
        console.log(`*************Payload: ${card_id} *****************`);
        
        // Use parameterized query for security
        const sqlCom = `UPDATE card SET card_isused = 2, update_user = ?, update_time = ? WHERE id = ?`;
        
        Db.query(sqlCom, [user_id, value_date, card_id], (er, re) => {
            if (er) {
                console.error("Error deleting card:", er);
                return res.status(500).json({
                    success: false,
                    message: "Error deleting card: " + er
                });
            }
            
            if (re.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Card not found"
                });
            }
            
            return res.status(200).json({
                success: true,
                message: "Transaction completed",
                affectedRows: re.affectedRows
            });
        });
    } catch (error) {
        console.error("Error in deleteCard:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const fetchCard = async (req, res) => {
    try {
        const proId = req.query.pro_id;
        const { fDate, tDate, userId, includeEnhanced, includeColorSize } = req.query;
        
        console.log("************* LOAD CARD *****************");
        console.log(`*************Payload: ${proId} *****************`);
        console.log(`Enhanced: ${includeEnhanced}, ColorSize: ${includeColorSize}`);
        
        if (!proId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }
        
        let whereConditions = ['c.product_id = ?'];
        let queryParams = [proId];
        
        // Date range filter
        if (fDate && tDate) {
            whereConditions.push('c.card_input_date BETWEEN ? AND ?');
            queryParams.push(`${fDate} 00:00:00`, `${tDate} 23:59:59`);
        }
        
        // User filter
        if (userId) {
            whereConditions.push('c.inputter = ?');
            queryParams.push(userId);
        }
        
        const whereClause = whereConditions.join(' AND ');
        console.log("WHERE clause:", whereClause);
        console.log("Query params:", queryParams);
        
        let sqlCom;
        
        if (includeColorSize === 'true') {
            // Full enhanced query with color and size relationships
            sqlCom = `
                SELECT 
                    c.*,
                    u.cus_name,
                    co.id as color_id,
                    co.color_name,
                    co.color_code,
                    co.hex_code,
                    co.rgb_code,
                    co.description as color_description,
                    s.id as size_id,
                    s.size_name,
                    s.size_code,
                    s.size_order,
                    s.description as size_description,
                    l.name as location_name,
                    curr.code as currency_code,
                    curr.name as currency_name
                FROM card c 
                LEFT JOIN user u ON u.id = c.inputter
                LEFT JOIN color co ON co.id = c.colorId AND co.isActive = 1
                LEFT JOIN size s ON s.id = c.sizeId AND s.isActive = 1
                LEFT JOIN location l ON l.id = c.locationId
                LEFT JOIN currency curr ON curr.id = c.currencyId
                WHERE ${whereClause}
                ORDER BY c.card_input_date DESC
            `;
        } else if (includeEnhanced === 'true') {
            // Enhanced query with additional fields but without relationships
            sqlCom = `
                SELECT 
                    c.*,
                    u.cus_name,
                    l.name as location_name,
                    curr.code as currency_code,
                    curr.name as currency_name
                FROM card c 
                LEFT JOIN user u ON u.id = c.inputter
                LEFT JOIN location l ON l.id = c.locationId
                LEFT JOIN currency curr ON curr.id = c.currencyId
                WHERE ${whereClause}
                ORDER BY c.card_input_date DESC
            `;
        } else {
            // Original basic query for backward compatibility
            sqlCom = `
                SELECT c.*, u.cus_name 
                FROM card c 
                LEFT JOIN user u ON u.id = c.inputter 
                WHERE ${whereClause}
                ORDER BY c.card_input_date DESC
            `;
        }
        
        console.log("Final SQL:", sqlCom);
        
        Db.query(sqlCom, queryParams, (er, re) => {
            if (er) {
                console.error("Database error in fetchCard:", er);
                return res.status(500).json({
                    success: false,
                    message: "Database error: " + er
                });
            }
            
            // Transform the result if enhanced data is requested
            if (includeColorSize === 'true' && re && re.length > 0) {
                const transformedResult = re.map(row => {
                    const result = {
                        ...row,
                        // Add nested color object if color data exists
                        color: row.color_id ? {
                            id: row.color_id,
                            color_name: row.color_name,
                            color_code: row.color_code,
                            hex_code: row.hex_code,
                            rgb_code: row.rgb_code,
                            description: row.color_description
                        } : null,
                        
                        // Add nested size object if size data exists
                        size: row.size_id ? {
                            id: row.size_id,
                            size_name: row.size_name,
                            size_code: row.size_code,
                            size_order: row.size_order,
                            description: row.size_description
                        } : null,
                        
                        // Add location object if location data exists
                        location: row.location_name ? {
                            name: row.location_name
                        } : null,
                        
                        // Add currency object if currency data exists
                        currency: row.currency_code ? {
                            code: row.currency_code,
                            name: row.currency_name
                        } : null
                    };
                    
                    // Clean up the flat fields that are now in nested objects
                    delete result.color_id;
                    delete result.color_name;
                    delete result.color_code;
                    delete result.hex_code;
                    delete result.rgb_code;
                    delete result.color_description;
                    delete result.size_id;
                    delete result.size_name;
                    delete result.size_code;
                    delete result.size_order;
                    delete result.size_description;
                    delete result.location_name;
                    delete result.currency_code;
                    delete result.currency_name;
                    
                    return result;
                });
                
                console.log(`Successfully returned ${transformedResult.length} enhanced records`);
                return res.status(200).json({
                    success: true,
                    data: transformedResult,
                    count: transformedResult.length
                });
            } else {
                console.log(`Successfully returned ${re.length} records`);
                return res.status(200).json({
                    success: true,
                    data: re,
                    count: re.length
                });
            }
        });
    } catch (error) {
        console.error("Error in fetchCard:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const fetchDeletedCard = async (req, res) => {
    try {
        const { fdate, tdate, userId } = req.query;
        
        console.log("SELECT DEL CARD: " + fdate + " tdate: " + tdate);
        
        if (!fdate || !tdate) {
            return res.status(400).json({
                success: false,
                message: "Start date (fdate) and end date (tdate) are required"
            });
        }
        
        let whereConditions = [
            'c.card_isused = 2',
            'c.update_time BETWEEN ? AND ?'
        ];
        let queryParams = [`${fdate} 00:00:00`, `${tdate} 23:59:59`];
        
        if (userId) {
            whereConditions.push('c.update_user = ?');
            queryParams.push(userId);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        let sqlCom = `
            SELECT 
                c.*,
                p.pro_name,
                p.pro_price,
                u.cus_name,
                co.color_name,
                co.hex_code,
                s.size_name,
                s.size_code
            FROM card c 
            LEFT JOIN product p ON p.pro_id = c.product_id 
            LEFT JOIN user u ON u.id = c.update_user
            LEFT JOIN color co ON co.id = c.colorId AND co.isActive = 1
            LEFT JOIN size s ON s.id = c.sizeId AND s.isActive = 1
            WHERE ${whereClause}
            ORDER BY c.update_time DESC
        `;
        
        Db.query(sqlCom, queryParams, (er, re) => {
            if (er) {
                console.error("Database error in fetchDeletedCard:", er);
                return res.status(500).json({
                    success: false,
                    message: "Database error: " + er
                });
            }
            
            console.log(`Successfully returned ${re.length} deleted card records`);
            return res.status(200).json({
                success: true,
                data: re,
                count: re.length
            });
        });
    } catch (error) {
        console.error("Error in fetchDeletedCard:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const fetchDeletedCardToday = async (req, res) => {
    try {
        const sqlDatetimeNow = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000)
            .toJSON().slice(0, 19).replace('T', ' ');
        const today = sqlDatetimeNow.substring(0, 10);
        
        console.log("SELECT DEL CARD TODAY: " + today);
        
        let sqlCom = `
            SELECT 
                c.*,
                p.pro_name,
                p.pro_price,
                u.cus_name,
                co.color_name,
                co.hex_code,
                s.size_name,
                s.size_code
            FROM card c 
            LEFT JOIN product p ON p.pro_id = c.product_id 
            LEFT JOIN user u ON u.id = c.update_user
            LEFT JOIN color co ON co.id = c.colorId AND co.isActive = 1
            LEFT JOIN size s ON s.id = c.sizeId AND s.isActive = 1
            WHERE c.card_isused = 2 
            AND DATE(c.update_time) = ?
            ORDER BY c.update_time DESC
        `;
        
        Db.query(sqlCom, [today], (er, re) => {
            if (er) {
                console.error("Database error in fetchDeletedCardToday:", er);
                return res.status(500).json({
                    success: false,
                    message: "Database error: " + er
                });
            }
            
            console.log(`Successfully returned ${re.length} deleted card records for today`);
            return res.status(200).json({
                success: true,
                data: re,
                count: re.length,
                date: today
            });
        });
    } catch (error) {
        console.error("Error in fetchDeletedCardToday:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// New enhanced functions for better card management

const fetchCardsByFilter = async (req, res) => {
    try {
        const { 
            productId, 
            colorId, 
            sizeId, 
            lotNumber, 
            serialNo,
            status,
            expiryStatus,
            locationId,
            limit = 100,
            offset = 0
        } = req.query;
        
        let whereConditions = ['c.isActive = 1'];
        let queryParams = [];
        
        if (productId) {
            whereConditions.push('c.product_id = ?');
            queryParams.push(productId);
        }
        
        if (colorId) {
            whereConditions.push('c.colorId = ?');
            queryParams.push(colorId);
        }
        
        if (sizeId) {
            whereConditions.push('c.sizeId = ?');
            queryParams.push(sizeId);
        }
        
        if (lotNumber) {
            whereConditions.push('c.lotNumber LIKE ?');
            queryParams.push(`%${lotNumber}%`);
        }
        
        if (serialNo) {
            whereConditions.push('c.serialNo LIKE ?');
            queryParams.push(`%${serialNo}%`);
        }
        
        if (status) {
            const statusMap = {
                'available': 0,
                'used': 1,
                'deleted': 2
            };
            whereConditions.push('c.card_isused = ?');
            queryParams.push(statusMap[status] || 0);
        }
        
        if (locationId) {
            whereConditions.push('c.locationId = ?');
            queryParams.push(locationId);
        }
        
        // Expiry status filtering
        if (expiryStatus) {
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            switch (expiryStatus) {
                case 'expired':
                    whereConditions.push('c.expiryDate < ?');
                    queryParams.push(today);
                    break;
                case 'expiring':
                    whereConditions.push('c.expiryDate BETWEEN ? AND ?');
                    queryParams.push(today, thirtyDaysLater);
                    break;
                case 'valid':
                    whereConditions.push('(c.expiryDate IS NULL OR c.expiryDate > ?)');
                    queryParams.push(thirtyDaysLater);
                    break;
            }
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const sqlCom = `
            SELECT 
                c.*,
                p.pro_name,
                co.color_name,
                co.hex_code,
                s.size_name,
                s.size_code,
                l.name as location_name,
                curr.code as currency_code
            FROM card c
            LEFT JOIN product p ON p.pro_id = c.product_id
            LEFT JOIN color co ON co.id = c.colorId AND co.isActive = 1
            LEFT JOIN size s ON s.id = c.sizeId AND s.isActive = 1
            LEFT JOIN location l ON l.id = c.locationId
            LEFT JOIN currency curr ON curr.id = c.currencyId
            WHERE ${whereClause}
            ORDER BY c.card_input_date DESC
            LIMIT ? OFFSET ?
        `;
        
        queryParams.push(parseInt(limit), parseInt(offset));
        
        Db.query(sqlCom, queryParams, (er, re) => {
            if (er) {
                console.error("Database error in fetchCardsByFilter:", er);
                return res.status(500).json({
                    success: false,
                    message: "Database error: " + er
                });
            }
            
            return res.status(200).json({
                success: true,
                data: re,
                count: re.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    } catch (error) {
        console.error("Error in fetchCardsByFilter:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const getCardSummary = async (req, res) => {
    try {
        const { productId, groupBy = 'status' } = req.query;
        
        let groupByField = 'c.card_isused';
        let selectFields = `
            CASE c.card_isused
                WHEN 0 THEN 'Available'
                WHEN 1 THEN 'Used'
                WHEN 2 THEN 'Deleted'
                ELSE 'Unknown'
            END as status,
            COUNT(*) as count,
            SUM(c.cost) as total_cost,
            AVG(c.cost) as avg_cost
        `;
        
        switch (groupBy) {
            case 'color':
                groupByField = 'c.colorId';
                selectFields = `
                    c.colorId,
                    co.color_name,
                    co.hex_code,
                    COUNT(*) as count,
                    SUM(c.cost) as total_cost,
                    AVG(c.cost) as avg_cost
                `;
                break;
            case 'size':
                groupByField = 'c.sizeId';
                selectFields = `
                    c.sizeId,
                    s.size_name,
                    s.size_code,
                    COUNT(*) as count,
                    SUM(c.cost) as total_cost,
                    AVG(c.cost) as avg_cost
                `;
                break;
            case 'date':
                groupByField = 'DATE(c.card_input_date)';
                selectFields = `
                    DATE(c.card_input_date) as input_date,
                    COUNT(*) as count,
                    SUM(c.cost) as total_cost,
                    AVG(c.cost) as avg_cost
                `;
                break;
        }
        
        let whereClause = 'c.isActive = 1';
        let queryParams = [];
        
        if (productId) {
            whereClause += ' AND c.product_id = ?';
            queryParams.push(productId);
        }
        
        const sqlCom = `
            SELECT ${selectFields}
            FROM card c
            LEFT JOIN color co ON co.id = c.colorId AND co.isActive = 1
            LEFT JOIN size s ON s.id = c.sizeId AND s.isActive = 1
            WHERE ${whereClause}
            GROUP BY ${groupByField}
            ORDER BY count DESC
        `;
        
        Db.query(sqlCom, queryParams, (er, re) => {
            if (er) {
                console.error("Database error in getCardSummary:", er);
                return res.status(500).json({
                    success: false,
                    message: "Database error: " + er
                });
            }
            
            return res.status(200).json({
                success: true,
                data: re,
                groupBy: groupBy,
                count: re.length
            });
        });
    } catch (error) {
        console.error("Error in getCardSummary:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    deleteCard,
    fetchCard,
    fetchDeletedCard,
    fetchDeletedCardToday,
    fetchCardsByFilter,
    getCardSummary
};