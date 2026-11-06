CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, role ENUM('admin') NOT NULL DEFAULT 'admin',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 csrf_hash CHAR(64) NOT NULL, expires_at DATETIME(6) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id), INDEX (expires_at)
) ENGINE=InnoDB;
CREATE TABLE customers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, legacy_contact_id VARCHAR(32) UNIQUE,
 company VARCHAR(200) NOT NULL, street VARCHAR(200) NOT NULL, street_number VARCHAR(25) NOT NULL,
 city VARCHAR(200) NOT NULL, zip VARCHAR(25) NOT NULL, country VARCHAR(100) NOT NULL,
 ico VARCHAR(25) NOT NULL, dic VARCHAR(25) NOT NULL, payment_id VARCHAR(255) NULL,
 end_customer BOOLEAN NOT NULL DEFAULT FALSE, archived BOOLEAN NOT NULL DEFAULT FALSE,
 version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE supplier_profiles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, data_json JSON NOT NULL,
 vat_rate DECIMAL(7,4) NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB;
CREATE TABLE bank_accounts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, label VARCHAR(100) NOT NULL,
 account_number VARCHAR(32) NOT NULL, bank_code VARCHAR(4) NOT NULL,
 variant ENUM('standard','alto') NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE catalog_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT NOT NULL,
 unit VARCHAR(30) NOT NULL, price DECIMAL(30,10) NOT NULL, vat_rate DECIMAL(7,4) NOT NULL,
 currency CHAR(3) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE invoice_sequences (year SMALLINT UNSIGNED PRIMARY KEY, last_value BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB;
CREATE TABLE invoices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, legacy_invoice_id VARCHAR(32) UNIQUE,
 invoice_number VARCHAR(32) UNIQUE, status ENUM('draft','issued','void') NOT NULL DEFAULT 'draft',
 customer_id BIGINT UNSIGNED NOT NULL, issue_date DATE NOT NULL, tax_date DATE NOT NULL,
 due_date DATE NOT NULL, due_days INT UNSIGNED NOT NULL,
 source_created VARCHAR(32) NULL, source_timezone VARCHAR(64) NULL,
 currency CHAR(3) NOT NULL, bank_account_id BIGINT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL, snapshot_origin VARCHAR(80) NOT NULL DEFAULT 'new_issue',
 net DECIMAL(30,2) NOT NULL, vat DECIMAL(30,2) NULL, gross DECIMAL(30,2) NULL,
 original_net VARCHAR(100) NULL, recalculated_net DECIMAL(30,10) NULL, difference DECIMAL(30,10) NULL,
 payment_status ENUM('unpaid','paid','unknown') NOT NULL DEFAULT 'unpaid', payment_date DATE NULL,
 payment_action_at DATETIME(6) NULL, legacy_alto VARCHAR(30) NULL,
 historical_vat_uncertain BOOLEAN NOT NULL DEFAULT FALSE,
 version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id),
 INDEX(issue_date,id), INDEX(payment_status,due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE invoice_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT UNSIGNED NOT NULL,
 legacy_item_id VARCHAR(32) UNIQUE, legacy_product_id VARCHAR(32) NULL,
 position INT UNSIGNED NOT NULL, description TEXT NOT NULL, unit VARCHAR(30) NOT NULL,
 price DECIMAL(30,10) NOT NULL, quantity DECIMAL(30,10) NOT NULL, vat_rate DECIMAL(7,4) NULL,
 net DECIMAL(30,10) NOT NULL, vat DECIMAL(30,10) NULL, gross DECIMAL(30,10) NULL,
 UNIQUE(invoice_id,position), FOREIGN KEY(invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE invoice_files (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT UNSIGNED NOT NULL,
 kind ENUM('original','generated') NOT NULL, relative_path VARCHAR(255) NOT NULL UNIQUE,
 sha256 CHAR(64) NOT NULL, template_version VARCHAR(80) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(invoice_id) REFERENCES invoices(id), UNIQUE(invoice_id,kind)
) ENGINE=InnoDB;
CREATE TABLE audit_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT UNSIGNED NULL,
 action VARCHAR(80) NOT NULL, entity_type VARCHAR(40) NOT NULL, entity_id VARCHAR(40) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE idempotency_keys (
 actor_id BIGINT UNSIGNED NOT NULL, request_key VARCHAR(80) NOT NULL, content_hash CHAR(64) NOT NULL,
 invoice_id BIGINT UNSIGNED NULL, PRIMARY KEY(actor_id,request_key),
 FOREIGN KEY(actor_id) REFERENCES users(id), FOREIGN KEY(invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB;
CREATE TABLE migration_runs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, source_id VARCHAR(80) NOT NULL UNIQUE,
 importer_version VARCHAR(30) NOT NULL, state ENUM('running','complete','failed') NOT NULL,
 manifest_hash CHAR(64) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE TABLE legacy_id_map (
 source_id VARCHAR(80) NOT NULL, source_table VARCHAR(80) NOT NULL, source_id_value VARCHAR(80) NOT NULL,
 target_table VARCHAR(80) NOT NULL, target_id VARCHAR(80) NOT NULL,
 source_hash CHAR(64) NOT NULL, target_hash CHAR(64) NOT NULL,
 PRIMARY KEY(source_id,source_table,source_id_value)
) ENGINE=InnoDB;
CREATE TABLE legacy_metadata (
 invoice_id BIGINT UNSIGNED PRIMARY KEY, data_json JSON NOT NULL,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB;
CREATE TABLE app_settings (
 setting_key VARCHAR(80) PRIMARY KEY, value_json JSON NOT NULL
) ENGINE=InnoDB;
CREATE TABLE revoked_mcp_tokens (
 jti_hash CHAR(64) PRIMARY KEY, expires_at DATETIME(6) NOT NULL
) ENGINE=InnoDB;
