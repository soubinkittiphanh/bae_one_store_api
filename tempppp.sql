Enter password: *********
ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)

C:\Program Files\MariaDB 12.3\bin>mysqldump -u root -psdat@3480 dcommerce_dev>kaisonminimart.sql
Access is denied.

C:\Program Files\MariaDB 12.3\bin>mysql -u root -psdat@3480
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 221
Server version: 12.3.2-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> show databases;
+--------------------+
| Database           |
+--------------------+
| dcommerce_dev      |
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test               |
| tutorial_db        |
+--------------------+
7 rows in set (0.004 sec)

MariaDB [(none)]> exit;
Bye

C:\Program Files\MariaDB 12.3\bin>mysqldump -u root -psdat@3480 dcommerce_dev>dcommerce_dev.kaison.sql
Access is denied.

C:\Program Files\MariaDB 12.3\bin>mysqldump -u root -psdat@3480 dcommerce_dev > "D:\dcommerce_dev.kaison.sql"

C:\Program Files\MariaDB 12.3\bin>mysql -u root -psdat@3480
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 223
Server version: 12.3.2-MariaDB MariaDB Server

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> create database dcommerce_pro;
Query OK, 1 row affected (0.003 sec)

MariaDB [(none)]>
MariaDB [(none)]>
MariaDB [(none)]>
MariaDB [(none)]> show databasesS
    -> ;
ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'databasesS' at line 1
MariaDB [(none)]> show databases;
+--------------------+
| Database           |
+--------------------+
| dcommerce_dev      |
| dcommerce_pro      |
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test               |
| tutorial_db        |
+--------------------+
8 rows in set (0.002 sec)

MariaDB [(none)]> use dcommerce_pro;
Database changed
MariaDB [dcommerce_pro]> insert into product as select * from dcommerce_dev.product;
ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'as select * from dcommerce_dev.product' at line 1
MariaDB [dcommerce_pro]> insert into product select * from dcommerce_dev.product;
ERROR 1048 (23000): Column 'duration_minutes' cannot be null
MariaDB [dcommerce_pro]> SELECT CONCAT('INSERT IGNORE INTO dcommerce_pro.', table_name, ' SELECT * FROM dcommerce_dev.', table_name, ';') FROM information_schema.tables WHERE table_schema = 'dcommerce_dev' AND table_type = 'BASE TABLE';
+-----------------------------------------------------------------------------------------------------------------------+
| CONCAT('INSERT IGNORE INTO dcommerce_pro.', table_name, ' SELECT * FROM dcommerce_dev.', table_name, ';')             |
+-----------------------------------------------------------------------------------------------------------------------+
| INSERT IGNORE INTO dcommerce_pro.academicyear SELECT * FROM dcommerce_dev.academicyear;                               |
| INSERT IGNORE INTO dcommerce_pro.accountdailybalance SELECT * FROM dcommerce_dev.accountdailybalance;                 |
| INSERT IGNORE INTO dcommerce_pro.accountstatement SELECT * FROM dcommerce_dev.accountstatement;                       |
| INSERT IGNORE INTO dcommerce_pro.agency SELECT * FROM dcommerce_dev.agency;                                           |
| INSERT IGNORE INTO dcommerce_pro.apinvoice SELECT * FROM dcommerce_dev.apinvoice;                                     |
| INSERT IGNORE INTO dcommerce_pro.apinvoiceaudit SELECT * FROM dcommerce_dev.apinvoiceaudit;                           |
| INSERT IGNORE INTO dcommerce_pro.apinvoicesettlement SELECT * FROM dcommerce_dev.apinvoicesettlement;                 |
| INSERT IGNORE INTO dcommerce_pro.applicant SELECT * FROM dcommerce_dev.applicant;                                     |
| INSERT IGNORE INTO dcommerce_pro.app_info SELECT * FROM dcommerce_dev.app_info;                                       |
| INSERT IGNORE INTO dcommerce_pro.apsettlementaudit SELECT * FROM dcommerce_dev.apsettlementaudit;                     |
| INSERT IGNORE INTO dcommerce_pro.arinvoiceheader SELECT * FROM dcommerce_dev.arinvoiceheader;                         |
| INSERT IGNORE INTO dcommerce_pro.arinvoiceheaderaudit SELECT * FROM dcommerce_dev.arinvoiceheaderaudit;               |
| INSERT IGNORE INTO dcommerce_pro.arinvoiceline SELECT * FROM dcommerce_dev.arinvoiceline;                             |
| INSERT IGNORE INTO dcommerce_pro.arreceiveheader SELECT * FROM dcommerce_dev.arreceiveheader;                         |
| INSERT IGNORE INTO dcommerce_pro.arreceiveheaderaudit SELECT * FROM dcommerce_dev.arreceiveheaderaudit;               |
| INSERT IGNORE INTO dcommerce_pro.arreceiveline SELECT * FROM dcommerce_dev.arreceiveline;                             |
| INSERT IGNORE INTO dcommerce_pro.ar_receive_header SELECT * FROM dcommerce_dev.ar_receive_header;                     |
| INSERT IGNORE INTO dcommerce_pro.authority SELECT * FROM dcommerce_dev.authority;                                     |
| INSERT IGNORE INTO dcommerce_pro.bank SELECT * FROM dcommerce_dev.bank;                                               |
| INSERT IGNORE INTO dcommerce_pro.bankaccount SELECT * FROM dcommerce_dev.bankaccount;                                 |
| INSERT IGNORE INTO dcommerce_pro.benefit SELECT * FROM dcommerce_dev.benefit;                                         |
| INSERT IGNORE INTO dcommerce_pro.businessdate SELECT * FROM dcommerce_dev.businessdate;                               |
| INSERT IGNORE INTO dcommerce_pro.campaign SELECT * FROM dcommerce_dev.campaign;                                       |
| INSERT IGNORE INTO dcommerce_pro.campaignentry SELECT * FROM dcommerce_dev.campaignentry;                             |
| INSERT IGNORE INTO dcommerce_pro.card SELECT * FROM dcommerce_dev.card;                                               |
| INSERT IGNORE INTO dcommerce_pro.cardaudit SELECT * FROM dcommerce_dev.cardaudit;                                     |
| INSERT IGNORE INTO dcommerce_pro.card_19feb_26 SELECT * FROM dcommerce_dev.card_19feb_26;                             |
| INSERT IGNORE INTO dcommerce_pro.card_sale SELECT * FROM dcommerce_dev.card_sale;                                     |
| INSERT IGNORE INTO dcommerce_pro.card_type SELECT * FROM dcommerce_dev.card_type;                                     |
| INSERT IGNORE INTO dcommerce_pro.cashiershift SELECT * FROM dcommerce_dev.cashiershift;                               |
| INSERT IGNORE INTO dcommerce_pro.category SELECT * FROM dcommerce_dev.category;                                       |
| INSERT IGNORE INTO dcommerce_pro.chart_of_account SELECT * FROM dcommerce_dev.chart_of_account;                       |
| INSERT IGNORE INTO dcommerce_pro.chat SELECT * FROM dcommerce_dev.chat;                                               |
| INSERT IGNORE INTO dcommerce_pro.chat_type SELECT * FROM dcommerce_dev.chat_type;                                     |
| INSERT IGNORE INTO dcommerce_pro.cifcustomer SELECT * FROM dcommerce_dev.cifcustomer;                                 |
| INSERT IGNORE INTO dcommerce_pro.client SELECT * FROM dcommerce_dev.client;                                           |
| INSERT IGNORE INTO dcommerce_pro.clientaudit SELECT * FROM dcommerce_dev.clientaudit;                                 |
| INSERT IGNORE INTO dcommerce_pro.color SELECT * FROM dcommerce_dev.color;                                             |
| INSERT IGNORE INTO dcommerce_pro.company SELECT * FROM dcommerce_dev.company;                                         |
| INSERT IGNORE INTO dcommerce_pro.country SELECT * FROM dcommerce_dev.country;                                         |
| INSERT IGNORE INTO dcommerce_pro.currency SELECT * FROM dcommerce_dev.currency;                                       |
| INSERT IGNORE INTO dcommerce_pro.currencyaudit SELECT * FROM dcommerce_dev.currencyaudit;                             |
| INSERT IGNORE INTO dcommerce_pro.district SELECT * FROM dcommerce_dev.district;                                       |
| INSERT IGNORE INTO dcommerce_pro.dynamic_customer SELECT * FROM dcommerce_dev.dynamic_customer;                       |
| INSERT IGNORE INTO dcommerce_pro.feeitem SELECT * FROM dcommerce_dev.feeitem;                                         |
| INSERT IGNORE INTO dcommerce_pro.feestructure SELECT * FROM dcommerce_dev.feestructure;                               |
| INSERT IGNORE INTO dcommerce_pro.fixed_asset_contract SELECT * FROM dcommerce_dev.fixed_asset_contract;               |
| INSERT IGNORE INTO dcommerce_pro.fixed_asset_depreciation SELECT * FROM dcommerce_dev.fixed_asset_depreciation;       |
| INSERT IGNORE INTO dcommerce_pro.fixed_asset_product SELECT * FROM dcommerce_dev.fixed_asset_product;                 |
| INSERT IGNORE INTO dcommerce_pro.general_ledger SELECT * FROM dcommerce_dev.general_ledger;                           |
| INSERT IGNORE INTO dcommerce_pro.geography SELECT * FROM dcommerce_dev.geography;                                     |
| INSERT IGNORE INTO dcommerce_pro.gl_posting_batch SELECT * FROM dcommerce_dev.gl_posting_batch;                       |
| INSERT IGNORE INTO dcommerce_pro.groupauthorities SELECT * FROM dcommerce_dev.groupauthorities;                       |
| INSERT IGNORE INTO dcommerce_pro.groupmenuheader SELECT * FROM dcommerce_dev.groupmenuheader;                         |
| INSERT IGNORE INTO dcommerce_pro.image_path SELECT * FROM dcommerce_dev.image_path;                                   |
| INSERT IGNORE INTO dcommerce_pro.image_path_ad SELECT * FROM dcommerce_dev.image_path_ad;                             |
| INSERT IGNORE INTO dcommerce_pro.image_path_master SELECT * FROM dcommerce_dev.image_path_master;                     |
| INSERT IGNORE INTO dcommerce_pro.invoicelineitem SELECT * FROM dcommerce_dev.invoicelineitem;                         |
| INSERT IGNORE INTO dcommerce_pro.invoicesettlementline SELECT * FROM dcommerce_dev.invoicesettlementline;             |
| INSERT IGNORE INTO dcommerce_pro.invoice_settlement_lines SELECT * FROM dcommerce_dev.invoice_settlement_lines;       |
| INSERT IGNORE INTO dcommerce_pro.jobadvertise SELECT * FROM dcommerce_dev.jobadvertise;                               |
| INSERT IGNORE INTO dcommerce_pro.jobbatch SELECT * FROM dcommerce_dev.jobbatch;                                       |
| INSERT IGNORE INTO dcommerce_pro.location SELECT * FROM dcommerce_dev.location;                                       |
| INSERT IGNORE INTO dcommerce_pro.loyalty_transaction SELECT * FROM dcommerce_dev.loyalty_transaction;                 |
| INSERT IGNORE INTO dcommerce_pro.maincategory SELECT * FROM dcommerce_dev.maincategory;                               |
| INSERT IGNORE INTO dcommerce_pro.member_offer SELECT * FROM dcommerce_dev.member_offer;                               |
| INSERT IGNORE INTO dcommerce_pro.menuheader SELECT * FROM dcommerce_dev.menuheader;                                   |
| INSERT IGNORE INTO dcommerce_pro.menuheaderlines SELECT * FROM dcommerce_dev.menuheaderlines;                         |
| INSERT IGNORE INTO dcommerce_pro.menuline SELECT * FROM dcommerce_dev.menuline;                                       |
| INSERT IGNORE INTO dcommerce_pro.mfcollateral SELECT * FROM dcommerce_dev.mfcollateral;                               |
| INSERT IGNORE INTO dcommerce_pro.mfjournalentry SELECT * FROM dcommerce_dev.mfjournalentry;                           |
| INSERT IGNORE INTO dcommerce_pro.mfloanaccount SELECT * FROM dcommerce_dev.mfloanaccount;                             |
| INSERT IGNORE INTO dcommerce_pro.mfloanproduct SELECT * FROM dcommerce_dev.mfloanproduct;                             |
| INSERT IGNORE INTO dcommerce_pro.mfrepaymentschedule SELECT * FROM dcommerce_dev.mfrepaymentschedule;                 |
| INSERT IGNORE INTO dcommerce_pro.microfinancegroup SELECT * FROM dcommerce_dev.microfinancegroup;                     |
| INSERT IGNORE INTO dcommerce_pro.ministry SELECT * FROM dcommerce_dev.ministry;                                       |
| INSERT IGNORE INTO dcommerce_pro.ministry20250825 SELECT * FROM dcommerce_dev.ministry20250825;                       |
| INSERT IGNORE INTO dcommerce_pro.moneyadvance SELECT * FROM dcommerce_dev.moneyadvance;                               |
| INSERT IGNORE INTO dcommerce_pro.moneyadvance20250904 SELECT * FROM dcommerce_dev.moneyadvance20250904;               |
| INSERT IGNORE INTO dcommerce_pro.moneyadvanceaudit SELECT * FROM dcommerce_dev.moneyadvanceaudit;                     |
| INSERT IGNORE INTO dcommerce_pro.mou SELECT * FROM dcommerce_dev.mou;                                                 |
| INSERT IGNORE INTO dcommerce_pro.nfccard SELECT * FROM dcommerce_dev.nfccard;                                         |
| INSERT IGNORE INTO dcommerce_pro.orders SELECT * FROM dcommerce_dev.orders;                                           |
| INSERT IGNORE INTO dcommerce_pro.orders_history SELECT * FROM dcommerce_dev.orders_history;                           |
| INSERT IGNORE INTO dcommerce_pro.ordertable SELECT * FROM dcommerce_dev.ordertable;                                   |
| INSERT IGNORE INTO dcommerce_pro.order_payment SELECT * FROM dcommerce_dev.order_payment;                             |
| INSERT IGNORE INTO dcommerce_pro.order_status SELECT * FROM dcommerce_dev.order_status;                               |
| INSERT IGNORE INTO dcommerce_pro.org_card SELECT * FROM dcommerce_dev.org_card;                                       |
| INSERT IGNORE INTO dcommerce_pro.org_card_sale SELECT * FROM dcommerce_dev.org_card_sale;                             |
| INSERT IGNORE INTO dcommerce_pro.org_dynamic_customer SELECT * FROM dcommerce_dev.org_dynamic_customer;               |
| INSERT IGNORE INTO dcommerce_pro.org_product SELECT * FROM dcommerce_dev.org_product;                                 |
| INSERT IGNORE INTO dcommerce_pro.org_product_category SELECT * FROM dcommerce_dev.org_product_category;               |
| INSERT IGNORE INTO dcommerce_pro.org_user_order SELECT * FROM dcommerce_dev.org_user_order;                           |
| INSERT IGNORE INTO dcommerce_pro.outlet SELECT * FROM dcommerce_dev.outlet;                                           |
| INSERT IGNORE INTO dcommerce_pro.payment SELECT * FROM dcommerce_dev.payment;                                         |
| INSERT IGNORE INTO dcommerce_pro.payment_callback SELECT * FROM dcommerce_dev.payment_callback;                       |
| INSERT IGNORE INTO dcommerce_pro.payment_header SELECT * FROM dcommerce_dev.payment_header;                           |
| INSERT IGNORE INTO dcommerce_pro.poheader SELECT * FROM dcommerce_dev.poheader;                                       |
| INSERT IGNORE INTO dcommerce_pro.poheaderhis SELECT * FROM dcommerce_dev.poheaderhis;                                 |
| INSERT IGNORE INTO dcommerce_pro.poline SELECT * FROM dcommerce_dev.poline;                                           |
| INSERT IGNORE INTO dcommerce_pro.polinehis SELECT * FROM dcommerce_dev.polinehis;                                     |
| INSERT IGNORE INTO dcommerce_pro.po_header SELECT * FROM dcommerce_dev.po_header;                                     |
| INSERT IGNORE INTO dcommerce_pro.po_line SELECT * FROM dcommerce_dev.po_line;                                         |
| INSERT IGNORE INTO dcommerce_pro.pricelist SELECT * FROM dcommerce_dev.pricelist;                                     |
| INSERT IGNORE INTO dcommerce_pro.pricelist_bak SELECT * FROM dcommerce_dev.pricelist_bak;                             |
| INSERT IGNORE INTO dcommerce_pro.printermodel SELECT * FROM dcommerce_dev.printermodel;                               |
| INSERT IGNORE INTO dcommerce_pro.product SELECT * FROM dcommerce_dev.product;                                         |
| INSERT IGNORE INTO dcommerce_pro.productaudit SELECT * FROM dcommerce_dev.productaudit;                               |
| INSERT IGNORE INTO dcommerce_pro.productoption SELECT * FROM dcommerce_dev.productoption;                             |
| INSERT IGNORE INTO dcommerce_pro.productoptiongroup SELECT * FROM dcommerce_dev.productoptiongroup;                   |
| INSERT IGNORE INTO dcommerce_pro.productreservation SELECT * FROM dcommerce_dev.productreservation;                   |
| INSERT IGNORE INTO dcommerce_pro.producttemp SELECT * FROM dcommerce_dev.producttemp;                                 |
| INSERT IGNORE INTO dcommerce_pro.product_bak SELECT * FROM dcommerce_dev.product_bak;                                 |
| INSERT IGNORE INTO dcommerce_pro.product_category SELECT * FROM dcommerce_dev.product_category;                       |
| INSERT IGNORE INTO dcommerce_pro.product_size SELECT * FROM dcommerce_dev.product_size;                               |
| INSERT IGNORE INTO dcommerce_pro.product_units SELECT * FROM dcommerce_dev.product_units;                             |
| INSERT IGNORE INTO dcommerce_pro.promotion SELECT * FROM dcommerce_dev.promotion;                                     |
| INSERT IGNORE INTO dcommerce_pro.pwt_projects SELECT * FROM dcommerce_dev.pwt_projects;                               |
| INSERT IGNORE INTO dcommerce_pro.pwt_project_budgets SELECT * FROM dcommerce_dev.pwt_project_budgets;                 |
| INSERT IGNORE INTO dcommerce_pro.pwt_project_contracts SELECT * FROM dcommerce_dev.pwt_project_contracts;             |
| INSERT IGNORE INTO dcommerce_pro.pwt_project_invoices SELECT * FROM dcommerce_dev.pwt_project_invoices;               |
| INSERT IGNORE INTO dcommerce_pro.pwt_withdrawal_applications SELECT * FROM dcommerce_dev.pwt_withdrawal_applications; |
| INSERT IGNORE INTO dcommerce_pro.qr_request SELECT * FROM dcommerce_dev.qr_request;                                   |
| INSERT IGNORE INTO dcommerce_pro.qr_response SELECT * FROM dcommerce_dev.qr_response;                                 |
| INSERT IGNORE INTO dcommerce_pro.quotationheader SELECT * FROM dcommerce_dev.quotationheader;                         |
| INSERT IGNORE INTO dcommerce_pro.quotationline SELECT * FROM dcommerce_dev.quotationline;                             |
| INSERT IGNORE INTO dcommerce_pro.receive_header SELECT * FROM dcommerce_dev.receive_header;                           |
| INSERT IGNORE INTO dcommerce_pro.receivingheader SELECT * FROM dcommerce_dev.receivingheader;                         |
| INSERT IGNORE INTO dcommerce_pro.receivingline SELECT * FROM dcommerce_dev.receivingline;                             |
| INSERT IGNORE INTO dcommerce_pro.recipe SELECT * FROM dcommerce_dev.recipe;                                           |
| INSERT IGNORE INTO dcommerce_pro.reservation SELECT * FROM dcommerce_dev.reservation;                                 |
| INSERT IGNORE INTO dcommerce_pro.reservationline SELECT * FROM dcommerce_dev.reservationline;                         |
| INSERT IGNORE INTO dcommerce_pro.revenue_target SELECT * FROM dcommerce_dev.revenue_target;                           |
| INSERT IGNORE INTO dcommerce_pro.rider SELECT * FROM dcommerce_dev.rider;                                             |
| INSERT IGNORE INTO dcommerce_pro.role SELECT * FROM dcommerce_dev.role;                                               |
| INSERT IGNORE INTO dcommerce_pro.saleheader SELECT * FROM dcommerce_dev.saleheader;                                   |
| INSERT IGNORE INTO dcommerce_pro.saleline SELECT * FROM dcommerce_dev.saleline;                                       |
| INSERT IGNORE INTO dcommerce_pro.salepayment SELECT * FROM dcommerce_dev.salepayment;                                 |
| INSERT IGNORE INTO dcommerce_pro.schoolclass SELECT * FROM dcommerce_dev.schoolclass;                                 |
| INSERT IGNORE INTO dcommerce_pro.schoolinvoice SELECT * FROM dcommerce_dev.schoolinvoice;                             |
| INSERT IGNORE INTO dcommerce_pro.schoolinvoiceline SELECT * FROM dcommerce_dev.schoolinvoiceline;                     |
| INSERT IGNORE INTO dcommerce_pro.schoolpayment SELECT * FROM dcommerce_dev.schoolpayment;                             |
| INSERT IGNORE INTO dcommerce_pro.schoolroom SELECT * FROM dcommerce_dev.schoolroom;                                   |
| INSERT IGNORE INTO dcommerce_pro.service SELECT * FROM dcommerce_dev.service;                                         |
| INSERT IGNORE INTO dcommerce_pro.settlement SELECT * FROM dcommerce_dev.settlement;                                   |
| INSERT IGNORE INTO dcommerce_pro.settlement20250904 SELECT * FROM dcommerce_dev.settlement20250904;                   |
| INSERT IGNORE INTO dcommerce_pro.shipping SELECT * FROM dcommerce_dev.shipping;                                       |
| INSERT IGNORE INTO dcommerce_pro.shipping_checkout_batches SELECT * FROM dcommerce_dev.shipping_checkout_batches;     |
| INSERT IGNORE INTO dcommerce_pro.shipping_orders SELECT * FROM dcommerce_dev.shipping_orders;                         |
| INSERT IGNORE INTO dcommerce_pro.size SELECT * FROM dcommerce_dev.size;                                               |
| INSERT IGNORE INTO dcommerce_pro.spf SELECT * FROM dcommerce_dev.spf;                                                 |
| INSERT IGNORE INTO dcommerce_pro.stockdailybalance SELECT * FROM dcommerce_dev.stockdailybalance;                     |
| INSERT IGNORE INTO dcommerce_pro.stock_transactions SELECT * FROM dcommerce_dev.stock_transactions;                   |
| INSERT IGNORE INTO dcommerce_pro.student SELECT * FROM dcommerce_dev.student;                                         |
| INSERT IGNORE INTO dcommerce_pro.studentfeeitem SELECT * FROM dcommerce_dev.studentfeeitem;                           |
| INSERT IGNORE INTO dcommerce_pro.table SELECT * FROM dcommerce_dev.table;                                             |
| INSERT IGNORE INTO dcommerce_pro.tax SELECT * FROM dcommerce_dev.tax;                                                 |
| INSERT IGNORE INTO dcommerce_pro.terminal SELECT * FROM dcommerce_dev.terminal;                                       |
| INSERT IGNORE INTO dcommerce_pro.terminalaudit SELECT * FROM dcommerce_dev.terminalaudit;                             |
| INSERT IGNORE INTO dcommerce_pro.ticket SELECT * FROM dcommerce_dev.ticket;                                           |
| INSERT IGNORE INTO dcommerce_pro.ticketline SELECT * FROM dcommerce_dev.ticketline;                                   |
| INSERT IGNORE INTO dcommerce_pro.transaction SELECT * FROM dcommerce_dev.transaction;                                 |
| INSERT IGNORE INTO dcommerce_pro.transactionentry SELECT * FROM dcommerce_dev.transactionentry;                       |
| INSERT IGNORE INTO dcommerce_pro.transaction_code SELECT * FROM dcommerce_dev.transaction_code;                       |
| INSERT IGNORE INTO dcommerce_pro.transaction_history SELECT * FROM dcommerce_dev.transaction_history;                 |
| INSERT IGNORE INTO dcommerce_pro.transferheader SELECT * FROM dcommerce_dev.transferheader;                           |
| INSERT IGNORE INTO dcommerce_pro.transferline SELECT * FROM dcommerce_dev.transferline;                               |
| INSERT IGNORE INTO dcommerce_pro.txn_code SELECT * FROM dcommerce_dev.txn_code;                                       |
| INSERT IGNORE INTO dcommerce_pro.unitmodel SELECT * FROM dcommerce_dev.unitmodel;                                     |
| INSERT IGNORE INTO dcommerce_pro.user SELECT * FROM dcommerce_dev.user;                                               |
| INSERT IGNORE INTO dcommerce_pro.usergroup SELECT * FROM dcommerce_dev.usergroup;                                     |
| INSERT IGNORE INTO dcommerce_pro.userterminals SELECT * FROM dcommerce_dev.userterminals;                             |
| INSERT IGNORE INTO dcommerce_pro.user_account SELECT * FROM dcommerce_dev.user_account;                               |
| INSERT IGNORE INTO dcommerce_pro.user_activity SELECT * FROM dcommerce_dev.user_activity;                             |
| INSERT IGNORE INTO dcommerce_pro.user_order SELECT * FROM dcommerce_dev.user_order;                                   |
| INSERT IGNORE INTO dcommerce_pro.user_order_head SELECT * FROM dcommerce_dev.user_order_head;                         |
| INSERT IGNORE INTO dcommerce_pro.vendor SELECT * FROM dcommerce_dev.vendor;                                           |
| INSERT IGNORE INTO dcommerce_pro.village SELECT * FROM dcommerce_dev.village;                                         |
| INSERT IGNORE INTO dcommerce_pro.washjob SELECT * FROM dcommerce_dev.washjob;                                         |
| INSERT IGNORE INTO dcommerce_pro.washjobhistories SELECT * FROM dcommerce_dev.washjobhistories;                       |
| INSERT IGNORE INTO dcommerce_pro.washjobline SELECT * FROM dcommerce_dev.washjobline;                                 |
| INSERT IGNORE INTO dcommerce_pro.webgroupproduct SELECT * FROM dcommerce_dev.webgroupproduct;                         |
| INSERT IGNORE INTO dcommerce_pro.webheadermenu SELECT * FROM dcommerce_dev.webheadermenu;                             |
| INSERT IGNORE INTO dcommerce_pro.webproductgroup SELECT * FROM dcommerce_dev.webproductgroup;                         |
+-----------------------------------------------------------------------------------------------------------------------+
184 rows in set (0.011 sec)

MariaDB [dcommerce_pro]>