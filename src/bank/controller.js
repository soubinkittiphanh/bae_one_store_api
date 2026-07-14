const db = require("../models");
const Bank = db.bank;

// 1. Create a new Bank
exports.create = async (req, res) => {
  try {
    // Mapping frontend fields (bnk_*) to model fields
    const bankData = {
      code: req.body.bnk_code,
      bank_name: req.body.bnk_name,
      bank_remark: req.body.bnk_remark,
      config: req.body.bnk_config ? (typeof req.body.bnk_config === 'string' ? JSON.parse(req.body.bnk_config) : req.body.bnk_config) : null,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };

    const data = await Bank.create(bankData);
    res.status(201).send({
      success: true,
      message: "ບັນທຶກຂໍ້ມູນສຳເລັດ",
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || "ເກີດຂໍ້ຜິດພາດໃນການສ້າງຂໍ້ມູນ"
    });
  }
};

// 2. Get All Banks (Used by your GET api/bank_com_f)
exports.findAll = async (req, res) => {
  try {
    const data = await Bank.findAll({
      order: [['id', 'ASC']]
    });
    res.status(200).send(data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "ເກີດຂໍ້ຜິດພາດໃນການດຶງຂໍ້ມູນ"
    });
  }
};

// 3. Update a Bank by ID
exports.update = async (req, res) => {
  const id = req.body.bnk_id; // Using ID from body as per your Vue code

  try {
    const bankData = {
      code: req.body.bnk_code,
      bank_name: req.body.bnk_name,
      bank_remark: req.body.bnk_remark,
      config: req.body.bnk_config ? (typeof req.body.bnk_config === 'string' ? JSON.parse(req.body.bnk_config) : req.body.bnk_config) : null
    };

    const [updated] = await Bank.update(bankData, {
      where: { id: id }
    });

    if (updated) {
      res.send({ success: true, message: "ອັບເດດຂໍ້ມູນສຳເລັດ" });
    } else {
      res.send({ success: false, message: `ບໍ່ສາມາດອັບເດດໄດ້ (ID: ${id})` });
    }
  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Error updating Bank with id=" + id
    });
  }
};

// 4. Delete a Bank
exports.delete = async (req, res) => {
  const id = req.params.id;

  try {
    const deleted = await Bank.destroy({
      where: { id: id }
    });

    if (deleted) {
      res.send({ success: true, message: "ລຶບຂໍ້ມູນສຳເລັດ" });
    } else {
      res.send({ success: false, message: "ບໍ່ພົບຂໍ້ມູນທີ່ຈະລຶບ" });
    }
  } catch (err) {
    res.status(500).send({
      message: "Could not delete Bank with id=" + id
    });
  }
};