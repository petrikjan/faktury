# Úplná matice legacy → nové umístění

Inventarizováno pouze DDL: 34 tabulek, 242 sloupců. Čítače AUTO_INCREMENT nejsou počty. Každá tabulka i každý sloupec se navíc zachová v odděleném privátním archivu s manifestem; původní dump je beze změn. Archiv není součástí provozního UI ani MCP.

| Tabulka                     | Sloupec                   | Umístění / výjimka                                                                      |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| bbs_autologins              | al_id                     | Pouze privátní archiv: tables/bbs_autologins.json; neobnovovat starý modul              |
| bbs_autologins              | al_key                    | Pouze privátní archiv: tables/bbs_autologins.json; neobnovovat starý modul              |
| bbs_autologins              | al_hash                   | Pouze privátní archiv: tables/bbs_autologins.json; neobnovovat starý modul              |
| bbs_autologins              | al_lifetime               | Pouze privátní archiv: tables/bbs_autologins.json; neobnovovat starý modul              |
| bbs_blog                    | blog_id                   | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_heading              | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_image                | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_metadesc             | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_urlname              | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_content              | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_categoryid           | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_tags                 | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_update               | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_publish              | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog                    | blog_status               | Pouze privátní archiv: tables/bbs_blog.json; neobnovovat starý modul                    |
| bbs_blog_categories         | bcat_id                   | Pouze privátní archiv: tables/bbs_blog_categories.json; neobnovovat starý modul         |
| bbs_blog_categories         | bcat_name                 | Pouze privátní archiv: tables/bbs_blog_categories.json; neobnovovat starý modul         |
| bbs_blog_categories         | bcat_urlname              | Pouze privátní archiv: tables/bbs_blog_categories.json; neobnovovat starý modul         |
| bbs_blog_categories         | bcat_metadesc             | Pouze privátní archiv: tables/bbs_blog_categories.json; neobnovovat starý modul         |
| bbs_blog_categories         | bcat_status               | Pouze privátní archiv: tables/bbs_blog_categories.json; neobnovovat starý modul         |
| bbs_categories              | cate_id                   | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_name_english         | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_name_česky           | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_urlname              | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_metadesc             | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_parent               | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_position             | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_status               | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_filters              | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories              | cate_filter_options       | Pouze privátní archiv: tables/bbs_categories.json; neobnovovat starý modul              |
| bbs_categories_products_rel | rel_id                    | Pouze privátní archiv: tables/bbs_categories_products_rel.json; neobnovovat starý modul |
| bbs_categories_products_rel | rel_cateid                | Pouze privátní archiv: tables/bbs_categories_products_rel.json; neobnovovat starý modul |
| bbs_categories_products_rel | rel_prodid                | Pouze privátní archiv: tables/bbs_categories_products_rel.json; neobnovovat starý modul |
| bbs_contacts                | id                        | customers.legacy_contact_id + explicitní end_customer pro staré id=1                    |
| bbs_contacts                | company                   | customers.company + snapshot odběratele                                                 |
| bbs_contacts                | street                    | customers.street + snapshot odběratele                                                  |
| bbs_contacts                | street_number             | customers.street_number + snapshot odběratele                                           |
| bbs_contacts                | city                      | customers.city + snapshot odběratele                                                    |
| bbs_contacts                | zip                       | customers.zip + snapshot odběratele                                                     |
| bbs_contacts                | country                   | customers.country + snapshot odběratele                                                 |
| bbs_contacts                | ico                       | customers.ico + snapshot odběratele                                                     |
| bbs_contacts                | dic                       | customers.dic + snapshot odběratele                                                     |
| bbs_contacts                | payment_id                | customers.payment_id + snapshot odběratele                                              |
| bbs_countries               | country_id                | Pouze privátní archiv: tables/bbs_countries.json; neobnovovat starý modul               |
| bbs_countries               | country_name              | Pouze privátní archiv: tables/bbs_countries.json; neobnovovat starý modul               |
| bbs_countries               | country_code              | Pouze privátní archiv: tables/bbs_countries.json; neobnovovat starý modul               |
| bbs_coupons                 | id                        | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | title                     | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | credit                    | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | valid_from                | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | valid_until               | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | used                      | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | user_id                   | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | created_by_user_id        | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_coupons                 | coupon_code               | Pouze privátní archiv: tables/bbs_coupons.json; neobnovovat starý modul                 |
| bbs_credit_orders           | id                        | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | user_id                   | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | amount                    | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | user_currency             | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | payed                     | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | created_date              | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | payed_date                | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders           | invoice_id                | Pouze privátní archiv: tables/bbs_credit_orders.json; neobnovovat starý modul           |
| bbs_credit_orders_cache     | id                        | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | user_id                   | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | amount                    | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | user_currency             | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | created_date              | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | payment_fee_in_user_cur   | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_credit_orders_cache     | payment_fee_in_system_cur | Pouze privátní archiv: tables/bbs_credit_orders_cache.json; neobnovovat starý modul     |
| bbs_currencies              | cur_id                    | Pouze privátní archiv: tables/bbs_currencies.json; neobnovovat starý modul              |
| bbs_currencies              | cur_name                  | Pouze privátní archiv: tables/bbs_currencies.json; neobnovovat starý modul              |
| bbs_currencies              | cur_code                  | invoices.currency a snapshot; ostatní také v archivu                                    |
| bbs_currencies              | cur_symbol                | Pouze privátní archiv: tables/bbs_currencies.json; neobnovovat starý modul              |
| bbs_emaillists              | e_id                      | Pouze privátní archiv: tables/bbs_emaillists.json; neobnovovat starý modul              |
| bbs_emaillists              | e_email                   | Pouze privátní archiv: tables/bbs_emaillists.json; neobnovovat starý modul              |
| bbs_emaillists              | e_type                    | Pouze privátní archiv: tables/bbs_emaillists.json; neobnovovat starý modul              |
| bbs_emaillists              | e_date                    | Pouze privátní archiv: tables/bbs_emaillists.json; neobnovovat starý modul              |
| bbs_eplists                 | eplist_id                 | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_eplists                 | eplist_uniqid             | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_eplists                 | eplist_name               | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_eplists                 | eplist_contactsub         | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_eplists                 | eplist_registeredsub      | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_eplists                 | eplist_newslettersub      | Pouze privátní archiv: tables/bbs_eplists.json; neobnovovat starý modul                 |
| bbs_exchange_rates          | ex_id                     | Pouze privátní archiv: tables/bbs_exchange_rates.json; neobnovovat starý modul          |
| bbs_exchange_rates          | ex_from                   | Pouze privátní archiv: tables/bbs_exchange_rates.json; neobnovovat starý modul          |
| bbs_exchange_rates          | ex_to                     | Pouze privátní archiv: tables/bbs_exchange_rates.json; neobnovovat starý modul          |
| bbs_exchange_rates          | ex_value                  | Pouze privátní archiv: tables/bbs_exchange_rates.json; neobnovovat starý modul          |
| bbs_invoices                | id                        | invoices.legacy_invoice_id                                                              |
| bbs_invoices                | invoice_id                | invoices.invoice_number (text)                                                          |
| bbs_invoices                | created                   | invoices.source_created + issue_date, zdrojové pásmo explicitně                         |
| bbs_invoices                | contact_id                | customers + invoices.customer_id + snapshot                                             |
| bbs_invoices                | payed                     | invoices.payment_status, datum platby NULL                                              |
| bbs_invoices                | currency_id               | invoices.currency přes bbs_currencies.cur_code                                          |
| bbs_invoices                | total                     | original_net, net, recalculated_net, difference                                         |
| bbs_invoices                | filename                  | legacy_metadata + soukromý manifest souborů                                             |
| bbs_invoices                | due_days                  | invoices.due_days + due_date                                                            |
| bbs_invoices                | alto                      | invoices.legacy_alto + bank_account_id + snapshot                                       |
| bbs_invoices_details        | id                        | invoice_items.legacy_item_id                                                            |
| bbs_invoices_details        | invoice_id                | invoice_items.invoice_id přes obchodní číslo rodiče                                     |
| bbs_invoices_details        | description               | invoice_items.description beze zkrácení                                                 |
| bbs_invoices_details        | price                     | invoice_items.price + privátní původní reprezentace FLOAT                               |
| bbs_invoices_details        | product_id                | invoice_items.legacy_product_id + privátní archiv produktů                              |
| bbs_invoices_details        | amount                    | invoice_items.quantity + privátní původní reprezentace FLOAT                            |
| bbs_languages               | language_id               | Pouze privátní archiv: tables/bbs_languages.json; neobnovovat starý modul               |
| bbs_languages               | language_key              | Pouze privátní archiv: tables/bbs_languages.json; neobnovovat starý modul               |
| bbs_languages               | language_type             | Pouze privátní archiv: tables/bbs_languages.json; neobnovovat starý modul               |
| bbs_languages               | language_english          | Pouze privátní archiv: tables/bbs_languages.json; neobnovovat starý modul               |
| bbs_languages               | language_česky            | Pouze privátní archiv: tables/bbs_languages.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_id                   | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_name                 | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_name_english         | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_name_česky           | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_routeid              | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_parentid             | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_pageid               | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_show                 | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_menuitems               | menu_position             | Pouze privátní archiv: tables/bbs_menuitems.json; neobnovovat starý modul               |
| bbs_pages                   | page_id                   | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_heading_english      | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_metadesc_english     | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_urlname              | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_content_english      | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_heading_česky        | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_metadesc_česky       | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_content_česky        | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_update               | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_pages                   | page_status               | Pouze privátní archiv: tables/bbs_pages.json; neobnovovat starý modul                   |
| bbs_products                | prod_id                   | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_idkey                | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_name                 | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_image                | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_filename             | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_tags                 | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_featured             | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_shortdesc            | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_longdesc             | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_adultbook            | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_booklang             | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_pagesno              | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_wordsno              | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_price_max_buys       | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_price_max            | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_actual_price         | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_commission           | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_status               | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_publish              | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_create               | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_update               | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_download_count       | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_view_count           | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_products                | prod_uid                  | Pouze privátní archiv: tables/bbs_products.json; neobnovovat starý modul                |
| bbs_purchase                | pur_id                    | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_user_id               | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_total_price           | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_total_user_price      | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_system_currency       | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_user_currency         | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_date                  | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchase                | pur_invoice_id            | Pouze privátní archiv: tables/bbs_purchase.json; neobnovovat starý modul                |
| bbs_purchaserecord          | pur_id                    | Pouze privátní archiv: tables/bbs_purchaserecord.json; neobnovovat starý modul          |
| bbs_purchaserecord          | pur_code                  | Pouze privátní archiv: tables/bbs_purchaserecord.json; neobnovovat starý modul          |
| bbs_purchaserecord          | pur_prodid                | Pouze privátní archiv: tables/bbs_purchaserecord.json; neobnovovat starý modul          |
| bbs_purchaserecord          | pur_uid                   | Pouze privátní archiv: tables/bbs_purchaserecord.json; neobnovovat starý modul          |
| bbs_purchaserecord          | pur_date                  | Pouze privátní archiv: tables/bbs_purchaserecord.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_id                    | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_user_id               | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_total_price           | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_total_user_price      | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_system_currency       | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_user_currency         | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | payment_fee_in_user_cur   | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | payment_fee_in_system_cur | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_cache          | pur_date                  | Pouze privátní archiv: tables/bbs_purchase_cache.json; neobnovovat starý modul          |
| bbs_purchase_details        | pur_id                    | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details        | pur_parent_id             | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details        | pur_product_id            | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details        | pur_user_id               | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details        | pur_price                 | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details        | pur_user_price            | Pouze privátní archiv: tables/bbs_purchase_details.json; neobnovovat starý modul        |
| bbs_purchase_details_cache  | pur_id                    | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_purchase_details_cache  | pur_parent_id             | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_purchase_details_cache  | pur_product_id            | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_purchase_details_cache  | pur_user_id               | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_purchase_details_cache  | pur_price                 | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_purchase_details_cache  | pur_user_price            | Pouze privátní archiv: tables/bbs_purchase_details_cache.json; neobnovovat starý modul  |
| bbs_ratings                 | rate_id                   | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_ratings                 | rate_uid                  | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_ratings                 | rate_pid                  | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_ratings                 | rate_stars                | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_ratings                 | rate_text                 | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_ratings                 | rate_create               | Pouze privátní archiv: tables/bbs_ratings.json; neobnovovat starý modul                 |
| bbs_routes                  | id                        | Pouze privátní archiv: tables/bbs_routes.json; neobnovovat starý modul                  |
| bbs_routes                  | controller                | Pouze privátní archiv: tables/bbs_routes.json; neobnovovat starý modul                  |
| bbs_routes                  | slug_english              | Pouze privátní archiv: tables/bbs_routes.json; neobnovovat starý modul                  |
| bbs_routes                  | slug_česky                | Pouze privátní archiv: tables/bbs_routes.json; neobnovovat starý modul                  |
| bbs_settings                | uniq_id                   | privátní archiv + odvozené supplier_profiles/bank_accounts                              |
| bbs_settings                | key_text                  | privátní archiv; známé klíče explicitně mapuje importer                                 |
| bbs_settings                | value_text                | privátní archiv; aktuální supplier_profiles/bank_accounts, ne historický důkaz          |
| bbs_testimonial             | testi_id                  | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_name                | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_desig               | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_msg                 | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_showdesig           | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_image               | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_status              | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_testimonial             | testi_order               | Pouze privátní archiv: tables/bbs_testimonial.json; neobnovovat starý modul             |
| bbs_themes                  | theme_id                  | Pouze privátní archiv: tables/bbs_themes.json; neobnovovat starý modul                  |
| bbs_themes                  | theme_displayname         | Pouze privátní archiv: tables/bbs_themes.json; neobnovovat starý modul                  |
| bbs_themes                  | theme_name                | Pouze privátní archiv: tables/bbs_themes.json; neobnovovat starý modul                  |
| bbs_themes                  | theme_status              | Pouze privátní archiv: tables/bbs_themes.json; neobnovovat starý modul                  |
| bbs_users                   | user_id                   | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_idkey                | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_username             | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_nickname             | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_fname                | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_lname                | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_email                | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_pwd                  | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_registerdate         | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_status               | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_key                  | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_accesslevel          | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_language             | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users                   | user_currency             | Pouze privátní archiv: tables/bbs_users.json; neobnovovat starý modul                   |
| bbs_users_facebook          | user_id                   | Pouze privátní archiv: tables/bbs_users_facebook.json; neobnovovat starý modul          |
| bbs_users_facebook          | user_facebook_id          | Pouze privátní archiv: tables/bbs_users_facebook.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_id                   | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_birthyear            | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_gender               | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_interests            | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_mobile               | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_address              | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_country              | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_state                | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_city                 | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_zip                  | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_social               | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_ico                  | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_profiles          | user_dic                  | Pouze privátní archiv: tables/bbs_users_profiles.json; neobnovovat starý modul          |
| bbs_users_wallet            | user_id                   | Pouze privátní archiv: tables/bbs_users_wallet.json; neobnovovat starý modul            |
| bbs_users_wallet            | user_credit               | Pouze privátní archiv: tables/bbs_users_wallet.json; neobnovovat starý modul            |

## Vazby a výjimky

- Kompletní indexy a cizí klíče jsou v `legacy-constraints.json`. V produkčním schématu nevytváříme staré moduly.
- bbs_credit_orders.invoice_id a bbs_purchase.pur_invoice_id jsou validovány proti obchodnímu číslu a jejich id jsou v privátních metadata faktury.
- product_id zůstává samostatnou legacy referencí; původní produkty nejsou ceník.
- Všechny účty, profily a staré autentizační tokeny se jen archivují. Nový správce vzniká samostatným lokálním příkazem. Žádný starý token není aktivní.
- V položkách není zdrojové pořadí. Aktivní model nemá explicitní ORDER BY; nové deterministické pořadí je id ASC s původem `legacy_id_ascending_inferred`. Nelze jej vydávat za doložené historické pořadí.
- Neznámé příznaky úhrady: unknown + migrační výjimka. Neznámé alto je blokující, aby se nevybral chybný účet.
- Zdrojové FLOAT se archivuje doslova. Pro cílový DECIMAL(30,10) HALF_UP, součty DECIMAL(30,2); originál a kontrolní rozdíl zůstávají oddělené. Hodnoty mimo rozsah import zastaví.
- Historická DPH: NULL, součty DPH/gross NULL. Aktuální nastavení není historický důkaz. Rekonstrukce je výslovně označena.
- Pevné soukromé texty hlavičky/patičky a logo vyžadují schválený provozní přenos; model je nekopíruje do veřejné dokumentace.
