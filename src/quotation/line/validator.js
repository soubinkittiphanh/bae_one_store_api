
const { body, validationResult } = require('express-validator');

exports.createQuotationLine = [
  body('quantity').isNumeric().withMessage('Quantity must be a number'),
  body('unitRate').isNumeric().withMessage('Unit rate must be a number'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('discount').isNumeric().withMessage('Discount must be a number'),
  body('total').isNumeric().withMessage('Total must be a number'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean'),
  // async (req, res) => {
  //   const errors = validationResult(req);

  //   if (!errors.isEmpty()) {
  //     return res.status(400).json({ errors: errors.array() });
  //   }

  //   try {
  //     const { quantity, unitRate, price, discount, total, isActive } = req.body;

  //     const newSaleLine = await SaleLine.create({
  //       quantity,
  //       unitRate,
  //       price,
  //       discount,
  //       total,
  //       isActive,
  //     });

  //     res.status(201).json(newSaleLine);
  //   } catch (error) {
  //     console.error(error);
  //     res.status(500).json({ message: 'Server Error' });
  //   }
  // },
];
