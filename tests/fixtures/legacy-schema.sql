-- DDL only; string defaults/comments removed; no source data or counters.
CREATE TABLE `bbs_autologins` (
  `al_id` int(11) UNSIGNED NOT NULL,
  `al_key` varchar(250) NOT NULL,
  `al_hash` char(40) NOT NULL,
  `al_lifetime` int(11) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_blog` (
  `blog_id` int(11) UNSIGNED NOT NULL,
  `blog_heading` varchar(250) NOT NULL,
  `blog_image` varchar(50) NOT NULL,
  `blog_metadesc` varchar(160) NOT NULL,
  `blog_urlname` varchar(100) NOT NULL,
  `blog_content` longtext NOT NULL,
  `blog_categoryid` int(11) UNSIGNED NOT NULL,
  `blog_tags` varchar(250) NOT NULL DEFAULT '',
  `blog_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `blog_publish` date NOT NULL,
  `blog_status` tinyint(1) UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_blog_categories` (
  `bcat_id` int(11) UNSIGNED NOT NULL,
  `bcat_name` varchar(100) NOT NULL,
  `bcat_urlname` varchar(100) NOT NULL,
  `bcat_metadesc` varchar(160) NOT NULL DEFAULT '',
  `bcat_status` tinyint(1) UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_categories` (
  `cate_id` int(11) UNSIGNED NOT NULL,
  `cate_name_english` varchar(100) NOT NULL,
  `cate_name_česky` varchar(100) NOT NULL,
  `cate_urlname` varchar(100) NOT NULL,
  `cate_metadesc` varchar(160) NOT NULL DEFAULT '',
  `cate_parent` int(11) UNSIGNED DEFAULT NULL,
  `cate_position` tinyint(4) UNSIGNED NOT NULL DEFAULT 0,
  `cate_status` tinyint(1) UNSIGNED NOT NULL DEFAULT 1,
  `cate_filters` smallint(1) UNSIGNED NOT NULL DEFAULT 0,
  `cate_filter_options` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_categories_products_rel` (
  `rel_id` int(11) UNSIGNED NOT NULL,
  `rel_cateid` int(11) UNSIGNED NOT NULL,
  `rel_prodid` int(11) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_contacts` (
  `id` int(11) UNSIGNED NOT NULL,
  `company` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `street` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `street_number` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `city` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `zip` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `country` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `ico` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `dic` varchar(25) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `payment_id` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

CREATE TABLE `bbs_countries` (
  `country_id` int(11) UNSIGNED NOT NULL,
  `country_name` varchar(32) DEFAULT NULL,
  `country_code` char(2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_coupons` (
  `id` int(11) NOT NULL,
  `title` varchar(200) NOT NULL,
  `credit` float NOT NULL,
  `valid_from` date NOT NULL,
  `valid_until` date NOT NULL,
  `used` tinyint(1) NOT NULL,
  `user_id` int(11) UNSIGNED DEFAULT NULL,
  `created_by_user_id` int(11) UNSIGNED NOT NULL,
  `coupon_code` varchar(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_credit_orders` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(11) UNSIGNED NOT NULL,
  `amount` float NOT NULL,
  `user_currency` int(11) UNSIGNED NOT NULL,
  `payed` tinyint(1) NOT NULL,
  `created_date` datetime NOT NULL,
  `payed_date` datetime DEFAULT NULL,
  `invoice_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_credit_orders_cache` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(11) UNSIGNED NOT NULL,
  `amount` float NOT NULL,
  `user_currency` int(11) UNSIGNED NOT NULL,
  `created_date` datetime NOT NULL,
  `payment_fee_in_user_cur` float DEFAULT NULL,
  `payment_fee_in_system_cur` float DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_currencies` (
  `cur_id` int(11) UNSIGNED NOT NULL,
  `cur_name` varchar(50) NOT NULL,
  `cur_code` char(3) NOT NULL,
  `cur_symbol` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_emaillists` (
  `e_id` int(11) UNSIGNED NOT NULL,
  `e_email` varchar(100) NOT NULL,
  `e_type` varchar(50) NOT NULL,
  `e_date` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_eplists` (
  `eplist_id` int(11) UNSIGNED NOT NULL,
  `eplist_uniqid` varchar(250) NOT NULL,
  `eplist_name` varchar(50) NOT NULL,
  `eplist_contactsub` tinyint(1) UNSIGNED NOT NULL DEFAULT 0,
  `eplist_registeredsub` tinyint(1) UNSIGNED NOT NULL DEFAULT 0,
  `eplist_newslettersub` tinyint(1) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_exchange_rates` (
  `ex_id` int(11) UNSIGNED NOT NULL,
  `ex_from` int(11) UNSIGNED NOT NULL,
  `ex_to` int(11) UNSIGNED NOT NULL,
  `ex_value` decimal(10,4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_invoices` (
  `id` int(11) UNSIGNED NOT NULL,
  `invoice_id` bigint(20) UNSIGNED NOT NULL,
  `created` datetime NOT NULL DEFAULT current_timestamp(),
  `contact_id` int(11) UNSIGNED NOT NULL,
  `payed` tinyint(4) NOT NULL,
  `currency_id` int(11) UNSIGNED NOT NULL,
  `total` float NOT NULL,
  `filename` varchar(16) NOT NULL,
  `due_days` int(10) UNSIGNED NOT NULL,
  `alto` tinyint(4) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_invoices_details` (
  `id` int(11) NOT NULL,
  `invoice_id` bigint(20) UNSIGNED NOT NULL,
  `description` text NOT NULL,
  `price` float NOT NULL,
  `product_id` int(11) UNSIGNED DEFAULT NULL,
  `amount` float NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_languages` (
  `language_id` int(11) UNSIGNED NOT NULL,
  `language_key` varchar(50) NOT NULL,
  `language_type` varchar(50) NOT NULL,
  `language_english` text NOT NULL,
  `language_česky` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_menuitems` (
  `menu_id` int(11) UNSIGNED NOT NULL,
  `menu_name` varchar(50) NOT NULL DEFAULT '',
  `menu_name_english` varchar(50) NOT NULL,
  `menu_name_česky` varchar(50) NOT NULL,
  `menu_routeid` int(11) UNSIGNED DEFAULT NULL,
  `menu_parentid` int(11) UNSIGNED DEFAULT NULL,
  `menu_pageid` int(11) UNSIGNED DEFAULT NULL,
  `menu_show` tinyint(1) UNSIGNED NOT NULL DEFAULT 1,
  `menu_position` tinyint(5) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_pages` (
  `page_id` int(11) UNSIGNED NOT NULL,
  `page_heading_english` varchar(250) NOT NULL,
  `page_metadesc_english` varchar(160) NOT NULL DEFAULT '',
  `page_urlname` varchar(100) NOT NULL,
  `page_content_english` longtext NOT NULL,
  `page_heading_česky` varchar(250) NOT NULL,
  `page_metadesc_česky` varchar(160) NOT NULL,
  `page_content_česky` longtext NOT NULL,
  `page_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `page_status` tinyint(1) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_products` (
  `prod_id` int(11) UNSIGNED NOT NULL,
  `prod_idkey` char(10) NOT NULL,
  `prod_name` varchar(100) NOT NULL,
  `prod_image` varchar(100) NOT NULL DEFAULT '',
  `prod_filename` varchar(15) NOT NULL DEFAULT '',
  `prod_tags` varchar(250) NOT NULL DEFAULT '',
  `prod_featured` tinyint(1) UNSIGNED NOT NULL DEFAULT 0,
  `prod_shortdesc` varchar(150) NOT NULL,
  `prod_longdesc` text NOT NULL,
  `prod_adultbook` tinyint(1) UNSIGNED NOT NULL DEFAULT 0,
  `prod_booklang` varchar(30) NOT NULL DEFAULT '',
  `prod_pagesno` tinyint(4) UNSIGNED NOT NULL DEFAULT 0,
  `prod_wordsno` int(11) UNSIGNED NOT NULL DEFAULT 0,
  `prod_price_max_buys` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `prod_price_max` decimal(10,2) NOT NULL DEFAULT 0.00,
  `prod_actual_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `prod_commission` tinyint(3) UNSIGNED DEFAULT NULL,
  `prod_status` tinyint(1) UNSIGNED DEFAULT 3,
  `prod_publish` int(11) UNSIGNED NOT NULL DEFAULT 0,
  `prod_create` date NOT NULL,
  `prod_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `prod_download_count` int(11) UNSIGNED NOT NULL DEFAULT 0,
  `prod_view_count` int(11) UNSIGNED NOT NULL DEFAULT 0,
  `prod_uid` int(11) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_purchase` (
  `pur_id` int(11) UNSIGNED NOT NULL,
  `pur_user_id` int(11) UNSIGNED NOT NULL,
  `pur_total_price` float DEFAULT NULL,
  `pur_total_user_price` float NOT NULL,
  `pur_system_currency` int(11) UNSIGNED NOT NULL,
  `pur_user_currency` int(11) UNSIGNED NOT NULL,
  `pur_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `pur_invoice_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_purchaserecord` (
  `pur_id` int(11) UNSIGNED NOT NULL,
  `pur_code` varchar(100) NOT NULL,
  `pur_prodid` int(11) UNSIGNED NOT NULL,
  `pur_uid` int(11) UNSIGNED NOT NULL,
  `pur_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_purchase_cache` (
  `pur_id` int(11) UNSIGNED NOT NULL,
  `pur_user_id` int(11) UNSIGNED NOT NULL,
  `pur_total_price` float DEFAULT NULL,
  `pur_total_user_price` float NOT NULL,
  `pur_system_currency` int(11) UNSIGNED NOT NULL,
  `pur_user_currency` int(11) UNSIGNED NOT NULL,
  `payment_fee_in_user_cur` float DEFAULT 0,
  `payment_fee_in_system_cur` float DEFAULT 0,
  `pur_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_purchase_details` (
  `pur_id` int(11) UNSIGNED NOT NULL,
  `pur_parent_id` int(11) UNSIGNED NOT NULL,
  `pur_product_id` int(11) UNSIGNED NOT NULL,
  `pur_user_id` int(11) UNSIGNED NOT NULL,
  `pur_price` float DEFAULT NULL,
  `pur_user_price` int(11) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_purchase_details_cache` (
  `pur_id` int(11) UNSIGNED NOT NULL,
  `pur_parent_id` int(11) UNSIGNED NOT NULL,
  `pur_product_id` int(11) UNSIGNED NOT NULL,
  `pur_user_id` int(11) UNSIGNED NOT NULL,
  `pur_price` float DEFAULT NULL,
  `pur_user_price` float NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_ratings` (
  `rate_id` int(11) UNSIGNED NOT NULL,
  `rate_uid` int(11) UNSIGNED NOT NULL,
  `rate_pid` int(11) UNSIGNED NOT NULL,
  `rate_stars` tinyint(1) UNSIGNED NOT NULL DEFAULT 0,
  `rate_text` varchar(250) NOT NULL DEFAULT '',
  `rate_create` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_routes` (
  `id` int(11) UNSIGNED NOT NULL,
  `controller` varchar(50) NOT NULL,
  `slug_english` varchar(50) NOT NULL,
  `slug_česky` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_settings` (
  `uniq_id` int(11) UNSIGNED NOT NULL,
  `key_text` varchar(250) NOT NULL,
  `value_text` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_testimonial` (
  `testi_id` int(11) UNSIGNED NOT NULL,
  `testi_name` varchar(50) NOT NULL,
  `testi_desig` varchar(50) NOT NULL,
  `testi_msg` varchar(250) NOT NULL,
  `testi_showdesig` tinyint(1) NOT NULL DEFAULT 0,
  `testi_image` varchar(100) NOT NULL DEFAULT '',
  `testi_status` tinyint(1) NOT NULL DEFAULT 1,
  `testi_order` tinyint(4) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_themes` (
  `theme_id` int(11) UNSIGNED NOT NULL,
  `theme_displayname` varchar(50) NOT NULL,
  `theme_name` varchar(50) NOT NULL,
  `theme_status` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_users` (
  `user_id` int(11) UNSIGNED NOT NULL,
  `user_idkey` bigint(11) UNSIGNED NOT NULL,
  `user_username` varchar(50) NOT NULL,
  `user_nickname` varchar(50) NOT NULL DEFAULT '',
  `user_fname` varchar(50) NOT NULL,
  `user_lname` varchar(50) NOT NULL,
  `user_email` varchar(100) NOT NULL,
  `user_pwd` char(60) NOT NULL,
  `user_registerdate` timestamp NOT NULL DEFAULT current_timestamp(),
  `user_status` tinyint(1) UNSIGNED NOT NULL,
  `user_key` varchar(250) NOT NULL,
  `user_accesslevel` tinyint(1) UNSIGNED NOT NULL DEFAULT 3,
  `user_language` varchar(30) NOT NULL DEFAULT '',
  `user_currency` int(11) UNSIGNED NOT NULL DEFAULT 2
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_users_facebook` (
  `user_id` int(11) UNSIGNED NOT NULL,
  `user_facebook_id` bigint(11) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_users_profiles` (
  `user_id` int(11) UNSIGNED NOT NULL,
  `user_birthyear` smallint(4) UNSIGNED NOT NULL,
  `user_gender` char(1) NOT NULL DEFAULT '',
  `user_interests` varchar(250) NOT NULL DEFAULT '',
  `user_mobile` varchar(30) NOT NULL DEFAULT '',
  `user_address` varchar(250) NOT NULL DEFAULT '',
  `user_country` int(11) UNSIGNED DEFAULT NULL,
  `user_state` varchar(50) NOT NULL DEFAULT '',
  `user_city` varchar(50) NOT NULL DEFAULT '',
  `user_zip` varchar(10) NOT NULL DEFAULT '',
  `user_social` text DEFAULT NULL,
  `user_ico` int(11) UNSIGNED NOT NULL,
  `user_dic` varchar(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

CREATE TABLE `bbs_users_wallet` (
  `user_id` int(11) UNSIGNED NOT NULL,
  `user_credit` float UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

ALTER TABLE `bbs_autologins`
  ADD PRIMARY KEY (`al_id`),
  ADD KEY `al_key` (`al_key`);

ALTER TABLE `bbs_blog`
  ADD PRIMARY KEY (`blog_id`),
  ADD KEY `blog_categoryid` (`blog_categoryid`);

ALTER TABLE `bbs_blog_categories`
  ADD PRIMARY KEY (`bcat_id`),
  ADD UNIQUE KEY `bcat_slug` (`bcat_urlname`);

ALTER TABLE `bbs_categories`
  ADD PRIMARY KEY (`cate_id`),
  ADD UNIQUE KEY `cate_urlname` (`cate_urlname`),
  ADD KEY `cate_parent` (`cate_parent`);

ALTER TABLE `bbs_categories_products_rel`
  ADD PRIMARY KEY (`rel_id`),
  ADD KEY `rel_cateid` (`rel_cateid`),
  ADD KEY `rel_prodid` (`rel_prodid`);

ALTER TABLE `bbs_contacts`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `bbs_countries`
  ADD PRIMARY KEY (`country_id`);

ALTER TABLE `bbs_coupons`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `coupon_code` (`coupon_code`),
  ADD KEY `bbs_coupons_fk1` (`user_id`),
  ADD KEY `bbs_coupons_fk2` (`created_by_user_id`);

ALTER TABLE `bbs_credit_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bbs_credit_orders_fk2` (`user_id`),
  ADD KEY `bbs_credit_orders_fk3` (`invoice_id`);

ALTER TABLE `bbs_credit_orders_cache`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bbs_credit_orders_fk2` (`user_id`);

ALTER TABLE `bbs_currencies`
  ADD PRIMARY KEY (`cur_id`);

ALTER TABLE `bbs_emaillists`
  ADD PRIMARY KEY (`e_id`);

ALTER TABLE `bbs_eplists`
  ADD PRIMARY KEY (`eplist_id`);

ALTER TABLE `bbs_exchange_rates`
  ADD PRIMARY KEY (`ex_id`),
  ADD KEY `ex_from` (`ex_from`),
  ADD KEY `ex_to` (`ex_to`);

ALTER TABLE `bbs_invoices`
  ADD UNIQUE KEY `id` (`id`) USING BTREE,
  ADD UNIQUE KEY `invoice_id` (`invoice_id`),
  ADD KEY `bbs_invoices_fk1` (`contact_id`),
  ADD KEY `bbs_invoices_fk2` (`currency_id`);

ALTER TABLE `bbs_invoices_details`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bbs_invoices_details_fk1` (`invoice_id`),
  ADD KEY `bbs_invoices_details_fk2` (`product_id`);

ALTER TABLE `bbs_languages`
  ADD PRIMARY KEY (`language_id`),
  ADD KEY `language_key` (`language_key`),
  ADD KEY `language_key_language_type` (`language_key`,`language_type`);

ALTER TABLE `bbs_menuitems`
  ADD PRIMARY KEY (`menu_id`),
  ADD KEY `menu_parentid` (`menu_parentid`),
  ADD KEY `menu_pageid` (`menu_pageid`),
  ADD KEY `menu_routeid` (`menu_routeid`);

ALTER TABLE `bbs_pages`
  ADD PRIMARY KEY (`page_id`),
  ADD UNIQUE KEY `slug_česky` (`page_urlname`);

ALTER TABLE `bbs_products`
  ADD PRIMARY KEY (`prod_id`),
  ADD UNIQUE KEY `prod_idkey` (`prod_idkey`),
  ADD KEY `prod_user_id` (`prod_uid`);

ALTER TABLE `bbs_purchase`
  ADD PRIMARY KEY (`pur_id`),
  ADD UNIQUE KEY `pur_id` (`pur_id`),
  ADD UNIQUE KEY `pur_invoice_id` (`pur_invoice_id`),
  ADD KEY `pur_user_id` (`pur_user_id`),
  ADD KEY `bbs_purchase_fk3` (`pur_system_currency`),
  ADD KEY `bbs_purchase_fk4` (`pur_user_currency`);

ALTER TABLE `bbs_purchaserecord`
  ADD PRIMARY KEY (`pur_id`),
  ADD UNIQUE KEY `pur_code` (`pur_code`),
  ADD KEY `pur_prodid` (`pur_prodid`),
  ADD KEY `pur_uid` (`pur_uid`);

ALTER TABLE `bbs_purchase_cache`
  ADD PRIMARY KEY (`pur_id`),
  ADD UNIQUE KEY `pur_id` (`pur_id`),
  ADD KEY `pur_user_id` (`pur_user_id`);

ALTER TABLE `bbs_purchase_details`
  ADD PRIMARY KEY (`pur_id`),
  ADD UNIQUE KEY `pur_id` (`pur_id`) USING BTREE,
  ADD KEY `pur_parent_id` (`pur_parent_id`),
  ADD KEY `pur_user_id` (`pur_user_id`),
  ADD KEY `pur_product_id` (`pur_product_id`);

ALTER TABLE `bbs_purchase_details_cache`
  ADD PRIMARY KEY (`pur_id`),
  ADD UNIQUE KEY `pur_id` (`pur_id`) USING BTREE,
  ADD KEY `pur_parent_id` (`pur_parent_id`),
  ADD KEY `pur_user_id` (`pur_user_id`),
  ADD KEY `pur_product_id` (`pur_product_id`);

ALTER TABLE `bbs_ratings`
  ADD PRIMARY KEY (`rate_id`),
  ADD KEY `rate_uid` (`rate_uid`),
  ADD KEY `rate_pid` (`rate_pid`);

ALTER TABLE `bbs_routes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `controller` (`controller`);

ALTER TABLE `bbs_settings`
  ADD PRIMARY KEY (`uniq_id`),
  ADD UNIQUE KEY `key_text` (`key_text`);

ALTER TABLE `bbs_testimonial`
  ADD PRIMARY KEY (`testi_id`);

ALTER TABLE `bbs_themes`
  ADD PRIMARY KEY (`theme_id`),
  ADD KEY `theme_status` (`theme_status`);

ALTER TABLE `bbs_users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `user_unique_user_email` (`user_email`),
  ADD UNIQUE KEY `user_unique_user_idkey` (`user_idkey`),
  ADD UNIQUE KEY `user_unique_user_username` (`user_username`),
  ADD UNIQUE KEY `user_unique_user_nickname` (`user_nickname`),
  ADD KEY `user_key` (`user_key`),
  ADD KEY `user_key_user_status` (`user_key`,`user_status`),
  ADD KEY `user_currency` (`user_currency`);

ALTER TABLE `bbs_users_facebook`
  ADD UNIQUE KEY `user_facebook_id` (`user_facebook_id`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `bbs_users_profiles`
  ADD KEY `user_id` (`user_id`),
  ADD KEY `user_country` (`user_country`);

ALTER TABLE `bbs_users_wallet`
  ADD UNIQUE KEY `user_id_2` (`user_id`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `bbs_autologins`
  MODIFY `al_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_blog`
  MODIFY `blog_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_blog_categories`
  MODIFY `bcat_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_categories`
  MODIFY `cate_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_categories_products_rel`
  MODIFY `rel_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_contacts`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_countries`
  MODIFY `country_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_coupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_credit_orders`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_credit_orders_cache`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_currencies`
  MODIFY `cur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_emaillists`
  MODIFY `e_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_eplists`
  MODIFY `eplist_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_exchange_rates`
  MODIFY `ex_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_invoices`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_invoices_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_languages`
  MODIFY `language_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_menuitems`
  MODIFY `menu_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_pages`
  MODIFY `page_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_products`
  MODIFY `prod_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_purchase`
  MODIFY `pur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_purchaserecord`
  MODIFY `pur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_purchase_cache`
  MODIFY `pur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_purchase_details`
  MODIFY `pur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_purchase_details_cache`
  MODIFY `pur_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_ratings`
  MODIFY `rate_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_routes`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_settings`
  MODIFY `uniq_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_testimonial`
  MODIFY `testi_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_themes`
  MODIFY `theme_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_users`
  MODIFY `user_id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `bbs_blog`
  ADD CONSTRAINT `bbs_blog_ibfk_1` FOREIGN KEY (`blog_categoryid`) REFERENCES `bbs_blog_categories` (`bcat_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_categories`
  ADD CONSTRAINT `bbs_categories_ibfk_1` FOREIGN KEY (`cate_parent`) REFERENCES `bbs_categories` (`cate_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_categories_products_rel`
  ADD CONSTRAINT `bbs_categories_products_rel_ibfk_3` FOREIGN KEY (`rel_prodid`) REFERENCES `bbs_products` (`prod_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_categories_products_rel_ibfk_4` FOREIGN KEY (`rel_cateid`) REFERENCES `bbs_categories` (`cate_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_coupons`
  ADD CONSTRAINT `bbs_coupons_fk1` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_coupons_fk2` FOREIGN KEY (`created_by_user_id`) REFERENCES `bbs_users` (`user_id`);

ALTER TABLE `bbs_credit_orders`
  ADD CONSTRAINT `bbs_credit_orders_fk2` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`),
  ADD CONSTRAINT `bbs_credit_orders_fk3` FOREIGN KEY (`invoice_id`) REFERENCES `bbs_invoices` (`invoice_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_credit_orders_cache`
  ADD CONSTRAINT `bbs_credit_orders_cache_fk2` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`);

ALTER TABLE `bbs_exchange_rates`
  ADD CONSTRAINT `bbs_exchange_rates_ibfk_1` FOREIGN KEY (`ex_from`) REFERENCES `bbs_currencies` (`cur_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_exchange_rates_ibfk_2` FOREIGN KEY (`ex_to`) REFERENCES `bbs_currencies` (`cur_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_invoices`
  ADD CONSTRAINT `bbs_invoices_fk1` FOREIGN KEY (`contact_id`) REFERENCES `bbs_contacts` (`id`),
  ADD CONSTRAINT `bbs_invoices_fk2` FOREIGN KEY (`currency_id`) REFERENCES `bbs_currencies` (`cur_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `bbs_invoices_details`
  ADD CONSTRAINT `bbs_invoices_details_fk1` FOREIGN KEY (`invoice_id`) REFERENCES `bbs_invoices` (`invoice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_invoices_details_fk2` FOREIGN KEY (`product_id`) REFERENCES `bbs_products` (`prod_id`);

ALTER TABLE `bbs_menuitems`
  ADD CONSTRAINT `bbs_menuitems_ibfk_1` FOREIGN KEY (`menu_parentid`) REFERENCES `bbs_menuitems` (`menu_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_menuitems_ibfk_2` FOREIGN KEY (`menu_pageid`) REFERENCES `bbs_pages` (`page_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_menuitems_ibfk_3` FOREIGN KEY (`menu_routeid`) REFERENCES `bbs_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_products`
  ADD CONSTRAINT `bbs_products_ibfk_1` FOREIGN KEY (`prod_uid`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_purchase`
  ADD CONSTRAINT `bbs_purchase_fk1` FOREIGN KEY (`pur_user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_fk2` FOREIGN KEY (`pur_invoice_id`) REFERENCES `bbs_invoices` (`invoice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_fk3` FOREIGN KEY (`pur_system_currency`) REFERENCES `bbs_currencies` (`cur_id`),
  ADD CONSTRAINT `bbs_purchase_fk4` FOREIGN KEY (`pur_user_currency`) REFERENCES `bbs_currencies` (`cur_id`);

ALTER TABLE `bbs_purchaserecord`
  ADD CONSTRAINT `bbs_purchaserecord_ibfk_1` FOREIGN KEY (`pur_prodid`) REFERENCES `bbs_products` (`prod_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_purchaserecord_ibfk_2` FOREIGN KEY (`pur_uid`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_purchase_cache`
  ADD CONSTRAINT `bbs_purchase_cache_fk1` FOREIGN KEY (`pur_user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_purchase_details`
  ADD CONSTRAINT `bbs_purchase_details_fk1` FOREIGN KEY (`pur_user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_details_fk2` FOREIGN KEY (`pur_parent_id`) REFERENCES `bbs_purchase` (`pur_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_details_fk3` FOREIGN KEY (`pur_product_id`) REFERENCES `bbs_products` (`prod_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_purchase_details_cache`
  ADD CONSTRAINT `bbs_purchase_details_cache_fk1` FOREIGN KEY (`pur_user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_details_cache_fk2` FOREIGN KEY (`pur_parent_id`) REFERENCES `bbs_purchase_cache` (`pur_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_purchase_details_cache_fk3` FOREIGN KEY (`pur_product_id`) REFERENCES `bbs_products` (`prod_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_ratings`
  ADD CONSTRAINT `bbs_ratings_ibfk_1` FOREIGN KEY (`rate_uid`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `bbs_ratings_ibfk_2` FOREIGN KEY (`rate_pid`) REFERENCES `bbs_products` (`prod_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_users`
  ADD CONSTRAINT `bbs_users_ibfk_1` FOREIGN KEY (`user_currency`) REFERENCES `bbs_currencies` (`cur_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bbs_users_facebook`
  ADD CONSTRAINT `bbs_users_facebook_fk1` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_users_profiles`
  ADD CONSTRAINT `bbs_credit_orders_fk1` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_users_profile_fk1` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bbs_users_profile_fk2` FOREIGN KEY (`user_country`) REFERENCES `bbs_countries` (`country_id`) ON DELETE CASCADE;

ALTER TABLE `bbs_users_wallet`
  ADD CONSTRAINT `bbs_users_wallet_fk1` FOREIGN KEY (`user_id`) REFERENCES `bbs_users` (`user_id`) ON DELETE CASCADE;
