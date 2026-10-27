# Car Parking Management Module (ລະບົບຄຸ້ມຄອງບ່ອນຈອດລົດ)

Cross-platform Parking Management Module integrated across `dc_api` (Backend), `dc_web` (Nuxt 2 Admin Web), and `dc_pos` (Flutter Mobile POS App).

---

## 1. Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              MariaDB / MySQL           │
                      │  7 Normalized Tables + Audit Trails   │
                      └──────────────────┬─────────────────────┘
                                         │
                      ┌──────────────────▼─────────────────────┐
                      │      dc_api (Node.js / Express)        │
                      │  - Transactional Slot Locking          │
                      │  - Time-of-Day Fee Engine (Day/Night)  │
                      │  - Multi-vehicle & Monthly Pass support│
                      └─────────────┬─────────────────┬────────┘
                                    │                 │
            ┌───────────────────────┘                 └───────────────────────┐
            │                                                                 │
┌───────────▼──────────────────────────┐          ┌───────────────────────────▼─────────────────────────┐
│     dc_web (Nuxt 2 / Vuetify)        │          │          dc_pos (Flutter / GetX)                    │
│ - Admin Dashboard & Analytics        │          │ - Attendant Gate In / Gate Out Checkpoints          │
│ - Visual Zones & Interactive Grid    │          │ - Camera Barcode / QR Scanner                       │
│ - Day / Night Hourly Pricing Rules   │          │ - Live Slot Grid & Ticket Search                    │
│ - Monthly Passes & Subscriptions     │          │ - Thermal Ticket Printing & Receipt Sharing         │
│ - Lao UI Design (Noto Sans Lao)      │          │ - Lao UI Design (Noto Sans Lao)                     │
└──────────────────────────────────────┘          └─────────────────────────────────────────────────────┘
```

---

## 2. Lao Language UI (`ພາສາລາວ`)

All menu items, labels, dialogs, ticket receipts, and badges across the Web Admin and Mobile POS are rendered in Lao language (`Noto Sans Lao`) with English secondary subtitles:

| Web Admin Route | Lao Menu Title | English Description |
|-----------------|----------------|---------------------|
| `/admin/parking` | ພາບລວມບ່ອນຈອດລົດ | Parking Dashboard & Live Status |
| `/admin/parking/zones` | ຜັງລົດ ແລະ ຊ່ອງຈອດ | Zones & Interactive Slot Grid |
| `/admin/parking/pricing` | ກຳນົດລາຄາຄ່າຈອດ | Day / Night Pricing Rules Setup |
| `/admin/parking/passes` | ປີ້ລາຍເດືອນ | Monthly Pass Subscriptions |
| `/admin/parking/tickets` | ປະຫວັດປີ້ລົດ | Ticket History & Transactions |
| `/admin/parking/reports` | ລາຍງານລາຍຮັບ | Revenue & Peak Hours Analytics |

---

## 3. Database & Seeding

### Execute Migration
```bash
cd dc_api
# Run the migration SQL script
mysql -u root -p dcommerce_demo < 20261025_create_parking_tables.sql
```

### Seed Default Data & Menus
```bash
cd dc_api

# 1. Seed Zones, Slots, Pricing Rules, Demo Pass
node seed_parking_data.js

# 2. Seed Web Admin Navigation Menus (Header & Lines in Lao)
node seed_parking_menus.js
```

---

## 4. Automated Tests

Run the test suite verifying fee calculations, day/night rates, slot locking, and tickets:
```bash
cd dc_api
node test_parking_services.js
# Output: 📊 TEST RESULTS: 17 PASSED, 0 FAILED
```

---

## 5. Mobile App Features (`dc_pos`)
- **Main Drawer Entry**: `ລະບົບຄຸ້ມຄອງບ່ອນຈອດລົດ (Car Parking)`
- **Gate In**: Fast entry form with automatic plate uppercase formatting, vehicle type selector (Car, Motorbike, Truck, Van), zone & slot assignment, and printable thermal entry QR ticket.
- **Gate Out**: Scan QR code or search plate, real-time fee calculation with day & night rate itemized breakdown, payment method selection (Cash, OnePay / QR transfer), and thermal receipt preview with share sheet.
