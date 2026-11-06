import { it, expect } from 'vitest';
import { parseDump } from '../scripts/migration/dump.js';
const ddl =
  'CREATE TABLE `bbs_example` (\n`id` int NOT NULL,\n`description` varchar(100) NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';
it('čte běžný mysqldump jako data včetně pořadí sloupců a obalových příkazů', () => {
  const source =
    'DROP TABLE IF EXISTS `bbs_example`;\n' +
    ddl +
    "\nLOCK TABLES `bbs_example` WRITE;\nINSERT INTO `bbs_example` VALUES (1,'text; DROP DATABASE never;');\nUNLOCK TABLES;";
  expect(parseDump(source).tables.bbs_example).toEqual([
    { id: '1', description: 'text; DROP DATABASE never;' },
  ]);
});
it('nadále odmítá operace mimo deklarované tabulky, jiné databáze a spustitelná těla', () => {
  for (const operation of [
    'DROP TABLE IF EXISTS `foreign_table`;',
    'LOCK TABLES `foreign_table` WRITE;',
    'DROP DATABASE production;',
    'TRUNCATE TABLE `bbs_example`;',
    'CREATE PROCEDURE hidden() SELECT 1;',
  ])
    expect(() => parseDump(ddl + operation)).toThrow();
});
