ALTER TABLE invoices ADD COLUMN deleted_invoice_number VARCHAR(32) NULL DEFAULT NULL;
CREATE TABLE released_invoice_numbers (
 invoice_number VARCHAR(32) PRIMARY KEY,
 year SMALLINT UNSIGNED NOT NULL,
 sequence_value SMALLINT UNSIGNED NOT NULL,
 INDEX(year,sequence_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
UPDATE invoices SET deleted_invoice_number=invoice_number WHERE deleted_at IS NOT NULL AND invoice_number IS NOT NULL;
INSERT INTO released_invoice_numbers(invoice_number,year,sequence_value)
 SELECT deleted_invoice_number,CAST(LEFT(deleted_invoice_number,4) AS UNSIGNED),CAST(SUBSTRING(deleted_invoice_number,5) AS UNSIGNED)
 FROM invoices i WHERE deleted_at IS NOT NULL AND deleted_invoice_number REGEXP '^[0-9]{8}$'
 AND CAST(LEFT(deleted_invoice_number,4) AS UNSIGNED) BETWEEN 1900 AND 2199
 AND CAST(SUBSTRING(deleted_invoice_number,5) AS UNSIGNED)>0
 AND NOT EXISTS(SELECT 1 FROM invoices active_invoice WHERE active_invoice.deleted_at IS NULL AND active_invoice.invoice_number=i.deleted_invoice_number)
 ON DUPLICATE KEY UPDATE invoice_number=VALUES(invoice_number);
UPDATE invoices SET invoice_number=NULL WHERE deleted_at IS NOT NULL AND invoice_number IS NOT NULL;
