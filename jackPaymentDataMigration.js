const transaction = [
    {'BookingDate': 20230630,'notes':'ຍອດຂາຍປະຈຳເດືອນ 5-6','totalAmount': 17704000,'drAccount': 1001,'crAccount': 4001
    },
    {'BookingDate': 20230630,'notes':'ຈ່າຍຄ່າລະບົບ Dcommerce ປະຈຳເດືອນ 07-2023','totalAmount': 800000,'drAccount': 5003,'crAccount': 1001
    },
    {'BookingDate': 20230630,'notes':'ຈ່າຍເງິນເດືອນ ພງ ປຈດ 06-2023','totalAmount': 2500000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230628,'notes':'ຄ່າບໍລິຫານ ເຄື່ອງດື່ມ ແລະ ເນັດ','totalAmount': 200000,'drAccount': 5005,'crAccount': 1001
    },
    {'BookingDate': 20230628,'notes':'ຄ່າຝາກສິນຄ້າ 98772222','totalAmount': 12000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230628,'notes':'ຄ່າຝາກສິນຄ້າ 56555666','totalAmount': 13000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230628,'notes':'ສັ່ງກະເປົາພາຍນ້ອຍ ຫນັງຈາກຈີນ 20 ຫນ່ວຍ','totalAmount': 1853000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230621,'notes':'ສັ່ງເຄື່ອງມາຂາຍ ເສື້ອ ແຈັກເກັດ','totalAmount': 4100000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230621,'notes':'ສັ່ງເຄືອງມາຂາຍ ຈາກຈີນ ກະເປົ່ານ້ອຍ 20 ຫນ່ວຍ','totalAmount': 1390000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230620,'notes':'ຈ່າຍຄ່າຂົນສົ່ງ ເຄື່ອງລາວ ຈີນ (ກະເປົາ ຫນັງ ມີລາຍ)','totalAmount': 351000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230613,'notes':'ຄ່າງຝາກເຄື່ອງຕົ້ນທາງ ໃຫ້ລູກຄ້າ','totalAmount': 12000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230609,'notes':'ຈ່າຍຄ່າຂົນສົ່ງເຄື່ອງ 2 ລາຍການ ( ເສື້ອ ແລະ ກະເປົາ )','totalAmount': 813000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230609,'notes':'ຈ່າຍຄ່າລະບົບ Dcommerce ປະຈຳເດືອນ 06-2023 ','totalAmount': 800000,'drAccount': 5003,'crAccount': 1001
    },
    {'BookingDate': 20230609,'notes':'ຊື້ ເງິນ USD 200$','totalAmount': 3860000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230609,'notes':'ຊື້ຖົງແພັກເຄື່ອງ x 2','totalAmount': 148000,'drAccount': 5007,'crAccount': 1001
    },
    {'BookingDate': 20230609,'notes':'ຮ່ວມລົງທືນ 4','totalAmount': 7000000,'drAccount': 1001,'crAccount': 3001
    },
    {'BookingDate': 20230606,'notes':'ຈ່າຍຄ່າຫ້ອງ ເກັບເຄື່ອງ','totalAmount': 325000,'drAccount': 5002,'crAccount': 1001
    },
    {'BookingDate': 20230602,'notes':'ຈ່າຍເງິນເດືອນ ພງ ປຈດ 05-2023','totalAmount': 864000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230602,'notes':'ຮ່ວມລົງທືນ 3','totalAmount': 864000,'drAccount': 1001,'crAccount': 3001
    },
    {'BookingDate': 20230526,'notes':'ຊື້ແມັກບຸກໂປ ປີ2014','totalAmount': 6000000,'drAccount': 1005,'crAccount': 1001
    },
    {'BookingDate': 20230526,'notes':'ຮ່ວມລົງທຶນ 2','totalAmount': 6000000,'drAccount': 1001,'crAccount': 3001
    },
    {'BookingDate': 20230524,'notes':'ສັ່ງເຄື່ອງມາຂາຍ','totalAmount': 14625000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230524,'notes':'ຮ່ວມລົງທຶນ 1','totalAmount': 14625000,'drAccount': 1001,'crAccount': 3001
    },
    {'BookingDate': 20230731,'notes':'ຄ່າອິນເຕີເນັດ','totalAmount': 200000,'drAccount': 5010,'crAccount': 1001
    },
    {'BookingDate': 20230731,'notes':'ເງິນເດືອນ ພງ ຕອບແຊັດ','totalAmount': 1500000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230731,'notes':'ຄ່າເຊີເວີ ລະບົບ','totalAmount': 800000,'drAccount': 5003,'crAccount': 1001
    },
    {'BookingDate': 20230730,'notes':'ຄ່າຝາກເສື້ອ','totalAmount': 19000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230727,'notes':'ສັ່ງກະເປົາເດີນທາງມາຂາຍ 45 ຫນ່ວຍ','totalAmount': 5133000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230725,'notes':'ຊື້ເຄື່ອງໃຊ້ຫ້ອງການ ປັກໄຟ','totalAmount': 200000,'drAccount': 1008,'crAccount': 1001
    },
    {'BookingDate': 20230725,'notes':'ກະແຈຫ້ອງ','totalAmount': 260000,'drAccount': 1008,'crAccount': 1001
    },
    {'BookingDate': 20230725,'notes':'ຄ່າຂົນສົ່ງ','totalAmount': 91000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230722,'notes':'ຄ່າຂົນສົ່ງ ເຄື່ອງຕີກັບ','totalAmount': 28000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230722,'notes':'ສັ່ງເຄື່ອງເສື້ອທົດລອງ','totalAmount': 965000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230720,'notes':'ຄ່າຂົນສົ່ງ ເຄື່ອງຕີກັບ','totalAmount': 26000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230720,'notes':'ສັ່ງເຄື່ອງ ມາຂາຍ ກະເປົາ YUYAUN 30 ຫນ່ວຍ','totalAmount': 2801000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230718,'notes':'ຊືໂດລາ 100$','totalAmount': 1930000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230717,'notes':'ເງິນເດືອນ ພງ ກາຟຟິກ','totalAmount': 1250000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230715,'notes':'ສັ່ງເຄື່ອງມາຂາຍ ກະເປົາ','totalAmount': 431000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230711,'notes':'ສັ່ງກະເປົານ້ອຍໃຫມ່ມາຂາຍ ກະເປົາຄ້າຍ Yuyuan ','totalAmount': 3709000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230711,'notes':'ຊືໂດລາ 100$','totalAmount': 1920000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230710,'notes':'ຄ່າຫ້ອງ','totalAmount': 325000,'drAccount': 5002,'crAccount': 1001
    },
    {'BookingDate': 20230710,'notes':'ຖົງແພັກເຄື່ອງ','totalAmount': 148000,'drAccount': 5007,'crAccount': 1001
    },
    {'BookingDate': 20230710,'notes':'ຄ່າຂົນສົ່ງເຄື່ອງ ມາແຕ່ຈີນ','totalAmount': 372000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230704,'notes':'ຄ່າຂົນສົ່ງເຄື່ອງ ມາແຕ່ຈີນ 2 ລາຍການ','totalAmount': 312000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230704,'notes':'ຄ່າອິນເຕີເນັດ ແລະ ກາເຟ','totalAmount': 200000,'drAccount': 5005,'crAccount': 1001
    },
    {'BookingDate': 20230704,'notes':'ຄ່າລາຍເດີ','totalAmount': 20000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230704,'notes':'ເຕີ່ມບັດ master card 100$','totalAmount': 1919000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230703,'notes':'ຊື້ພັດລົມ ຮັບໃຊ້ ຫ້ອງການ','totalAmount': 430000,'drAccount': 1007,'crAccount': 1001
    },
    {'BookingDate': 20230703,'notes':'ສັ່ງກະເປົາ ໂຄມີ ມາຂາຍຈາກຈີນ ','totalAmount': 4349000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230703,'notes':'ສັ່ງກະເປົາເດີນທາງ ເພີ່ມ 15 ຫນ່ວຍ','totalAmount': 685000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230730,'notes':'ຍອດຂາຍປະຈຳເດືອນ','totalAmount': 16570000,'drAccount': 1001,'crAccount': 4001
    },
    {'BookingDate': 20230826,'notes':'ຄ່າຂົນສົ່ງ ແຈັກ 6 ລາຍການ','totalAmount': 859000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230824,'notes':'ຊື້ເງິນ ໂດລາ 100usd','totalAmount': 1966000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230812,'notes':'ຄ່າເຄື່ອງຕີກັບ','totalAmount': 15000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230809,'notes':'ສັ່ງກະເປົາ ນ້ອຍ 40 ຫນ່ວຍ','totalAmount': 3614000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230809,'notes':'ຈ່າຍຄ່າຫ້ອງ ເກັບເຄື່ອງ AUG23','totalAmount': 325000,'drAccount': 5002,'crAccount': 1001
    },
    {'BookingDate': 20230808,'notes':'ສັ່ງເຄຶ່ອງ ຈາກຈີນ ມາຂາຍ / ກະເປົາເດີນທາງ 20ຫນ່ວຍ','totalAmount': 1534000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230808,'notes':'ເງິນເດືອນ ພງ ກາບຟິກ','totalAmount': 100000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230806,'notes':'ຄ່າຝາກເຄື່ອງລູກຄ້າ ຕົ້ນທາງ','totalAmount': 17000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230803,'notes':'ສັ່ງກະເປົາ ນ້ອຍ 20 ຫນ່ວຍ','totalAmount': 1476000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230803,'notes':'ເຄື່ອງຕີກັບ ຄ່າຝາກ','totalAmount': 17000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230802,'notes':'ຊື້ເງິນ ໂດລາ 100usd','totalAmount': 1960000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230801,'notes':'ສັ່ງເຄື່ອງມາຂາຍ ','totalAmount': 552000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230901,'notes':'ເຄື່ອງຕີກັບ 3 ລາຍການ','totalAmount': 45000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230901,'notes':'Server Sep Jack42','totalAmount': 800000,'drAccount': 5003,'crAccount': 1001
    },
    {'BookingDate': 20230901,'notes':'ເງິນເດືອນ ພງ ແອັດມິນ','totalAmount': 1000000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230901,'notes':'ສັ່ງເຄື່ອງມາຂາຍ 1 ລາຍການ','totalAmount': 3015000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230905,'notes':'ສັ່ງເຄື່ອງມາຂາຍ 2 ລາຍການ','totalAmount': 3088000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230905,'notes':'ຊື້ ໂດລາ 100$','totalAmount': 1995000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230907,'notes':'ຄ່າແປັງຊິບ ກະເປົ່າໃຫ້ລູກຄ້າ','totalAmount': 25000,'drAccount': 5011,'crAccount': 1001
    },
    {'BookingDate': 20230909,'notes':'ຄ່າຂົນສົ່ງ','totalAmount': 9000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230911,'notes':'ຊື້ຖົງ 2 packs','totalAmount': 145000,'drAccount': 5007,'crAccount': 1001
    },
    {'BookingDate': 20230911,'notes':'ເງິນເດືອນ ພງ ກາບຟິກ / JUL23','totalAmount': 1000000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20230911,'notes':'ຄ່າຫ້ອງ ນ້ຳ ແລະ ໄຟ','totalAmount': 354000,'drAccount': 5002,'crAccount': 1001
    },
    {'BookingDate': 20230912,'notes':'ຊື້ໂດລາ 100$','totalAmount': 1990000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20230912,'notes':'ຊື້ເຄື່ອງມາຂາຍ','totalAmount': 8188000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20230914,'notes':'ຄ່າຝາກເຄື່ອງພາຍໃນ ລາຍເດີ','totalAmount': 29000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230914,'notes':'ຄ່າຝາກເຄື່ອງ','totalAmount': 14000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230917,'notes':'ຄ່າຂົນສົ່ງໄປເອົາເຄື່ອງ','totalAmount': 20000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20230918,'notes':'ເຄື່ອງມາແຕ່ຈີນ ຫນື່ງລາຍການ','totalAmount': 197000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230927,'notes':'ຄ່າເຄື່ອງເຂົ້າ 2 ລາຍການ','totalAmount': 375000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230929,'notes':'ຄ່າເຄື່ອງເຂົ້າ 2 ລາຍການ','totalAmount': 462000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230929,'notes':'ຄ່ານຳເຄື່ອງຈາກຂົນສົ່ງມາສາງ ','totalAmount': 20000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20230929,'notes':'ເຄື່ອງຕີກັບ','totalAmount': 15000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20231030,'notes':'ຍອດຂາຍປະຈຳເດືອນ','totalAmount': 31264000,'drAccount': 1001,'crAccount': 4001
    },
    {'BookingDate': 20231001,'notes':'ຊື້ ໂດລາ 100','totalAmount': 2355000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231001,'notes':'ໂອນຄືນລູກຄ້າ','totalAmount': 9000,'drAccount': 5012,'crAccount': 1001
    },
    {'BookingDate': 20231004,'notes':'ເງິນເດືອນ ພງ ','totalAmount': 1500000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20231004,'notes':'ຊື້ ເຈ້ຍ ພິມຕິກເກັດ ແລະ ຄ່າເນັດ','totalAmount': 300000,'drAccount': 5010,'crAccount': 1001
    },
    {'BookingDate': 20231004,'notes':'ສັ່ງເຄື່ອງມາຂາຍ 3 ລາຍການ','totalAmount': 8281000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20231005,'notes':'ສັ່ງເຄື່ອງ ທາໂນສ ມາທົດລອງ','totalAmount': 1907000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20231005,'notes':'ຊື້ໂດລາ 100','totalAmount': 2061000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231010,'notes':'ຄ່າຂົນສົ່ງເຄື່ອງ ຈາກຈີນ','totalAmount': 383000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20231010,'notes':'ຄ່າ ຣາຍເດີ','totalAmount': 20000,'drAccount': 5006,'crAccount': 1001
    },
    {'BookingDate': 20231011,'notes':'ຊື້ໂດລາ 60','totalAmount': 1235000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231012,'notes':'ຄ່າງຫ້ອງ ນ້ຳ ໄຟ','totalAmount': 353000,'drAccount': 5002,'crAccount': 1001
    },
    {'BookingDate': 20231013,'notes':'ຄ່າລະບົບ OCT23','totalAmount': 200000,'drAccount': 5003,'crAccount': 1001
    },
    {'BookingDate': 20231014,'notes':'ຄ່າຝາກເຄື່ອງ ທາໂນສ ມາແຕ່ວຽດ','totalAmount': 100000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20231016,'notes':'ຊື້ໂດລາ 100','totalAmount': 2400000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231016,'notes':'ຄ່າຝາກເຄື່ອງ ມາແຕ່ຈີນ','totalAmount': 682000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20231016,'notes':'ຖົງແພັກເຄື່ອງ','totalAmount': 180000,'drAccount': 5007,'crAccount': 1001
    },
    {'BookingDate': 20231016,'notes':'ສັ່ງເຄື່ອງສອງລາຍການ ມາຂາຍ','totalAmount': 5716000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20231017,'notes':'ຊື້ໂດລາ 100','totalAmount': 2200000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231018,'notes':'ສັ່ງເຄື່ອງມາຂາຍ','totalAmount': 3572000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20231028,'notes':'ຄ່າຝາກເຄື່ອງ ມາແຕ່ຈີນ','totalAmount': 568000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20231030,'notes':'ຊື້ໂດລາ 100','totalAmount': 2390000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231030,'notes':'ຍອດຂາຍປະຈຳເດືອນ','totalAmount': 32993000,'drAccount': 1001,'crAccount': 4001
    },
    {'BookingDate': 20231103,'notes':'ຊື້ ໂດລາ 100','totalAmount': 2070000,'drAccount': 5009,'crAccount': 1001
    },
    {'BookingDate': 20231103,'notes':'ຄ່າເຄື່ອງມາແຕ່ຈີນ','totalAmount': 547000,'drAccount': 5008,'crAccount': 1001
    },
    {'BookingDate': 20231103,'notes':'ສັ່ງກະເປົາ KIMO ມາຂາຍ','totalAmount': 3891000,'drAccount': 1006,'crAccount': 1001
    },
    {'BookingDate': 20231104,'notes':'ເງິນເດືອນ ພງ ແອັດມິນ','totalAmount': 1500000,'drAccount': 5004,'crAccount': 1001
    },
    {'BookingDate': 20231108,'notes':'ຍອດຂາຍປະຈຳເດືອນ ນະວັນທີ 08-11-23','totalAmount': 10849000,'drAccount': 1001,'crAccount': 4001
    },
]