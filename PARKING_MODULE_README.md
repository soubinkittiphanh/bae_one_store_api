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
| `/admin/parking/vehicle-types` | ປະເພດຍານພາຫະນະ | Customer-maintained Vehicle Types |
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

---

## 6. Vehicle Types (ປະເພດຍານພາຫະນະ)

Vehicle types are no longer a hard-coded ENUM. Each customer maintains their own list in
`parking_vehicle_types` from **Web Admin → Car Parking → ປະເພດຍານພາຫະນະ** (`/admin/parking/vehicle-types`).

- Tickets, slots, vehicles, pricing rules and monthly passes reference a type by its string **`code`**
  (`car`, `motorbike`, `van`, …). The code is **immutable** after creation; names, icon, colour and order are editable.
- Exactly one type is the **default** (pre-selected at entry). A type can't be deactivated while it is the default,
  while vehicles of that type are parked, or while active slots use it.
- API: `GET /api/parking/vehicle-types[?includeInactive=1]`, `POST /api/parking/vehicle-types`,
  `PUT /api/parking/vehicle-types/:id`, `PATCH /api/parking/vehicle-types/:id/status` (writes are admin-only).
- Migration: `20261106_create_parking_vehicle_types.sql` (rollback: `20261106_create_parking_vehicle_types_down.sql`).
  `node seed_parking_data.js` runs it automatically. Re-run `node seed_parking_menus.js` to add the menu entry.
- Icons are mdi names (`mdi-car`, `mdi-van-utility`, …). The POS maps them to Flutter icons in
  `dc_pos/lib/helper/parking_vehicle_icons.dart`; keep that map in sync with the web page's `iconOptions`.

## 7. Pricing Rules per Vehicle Type

- Each vehicle type uses **exactly one active default rule**. Saving a rule as default un-defaults the others of that
  type, and the first active rule of a type always becomes its default. The current default can't be switched off
  directly; make another rule the default instead.
- A type **without** an active rule is still allowed in, but the API's built-in fallback rate is charged
  (5,000/day-hour, 10,000/night-hour, 50,000 cap). Entry, fee and pay responses then include a `warnings` array,
  the fee breakdown has `usedFallbackRule: true`, and the vehicle-type list has `hasPricingRule: false` (shown as
  "ບໍ່ມີລາຄາ" on the web and POS vehicle-type screens).
