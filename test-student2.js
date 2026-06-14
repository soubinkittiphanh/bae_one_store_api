const { student, bankAccount, nfcCard } = require("./src/models");

async function test() {
  try {
    const students = await student.findAll({
        include: [
            { model: bankAccount, as: 'bankAccount' },
            { model: nfcCard, as: 'nfcCards', where: { isActive: true }, required: false }
        ],
        order: [['createdAt', 'DESC']]
    });
    console.log(JSON.stringify(students.slice(0, 2), null, 2));
  } catch (err) {
    console.error("DB ERROR:", err.message);
  } finally {
    process.exit();
  }
}
test();
