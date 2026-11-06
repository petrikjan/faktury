import { expect, it } from 'vitest';
import { extractTemplateText } from '../scripts/migration/template-text.js';

const template = `<table class="head"><tr><td>www.example.test</td></tr></table>
<div class="footer-wrapper">
 <div class="width-50">Vystavil: <?php echo $store_info['store_name']; ?><br>
 <?php echo date_format($date,"j. n Y H:i:s"); ?></div>
 <div class="text-right width-50">Ukázkový rejstřík &amp; evidence<br>Oddíl &#268;, vložka 123</div>
</div>`;

it('přenese pevné texty z aktivní šablony bez spuštění PHP', () => {
  expect(extractTemplateText(template)).toEqual({
    website: 'www.example.test',
    footer: 'Ukázkový rejstřík & evidence\nOddíl Č, vložka 123',
    footer_left: 'Vystavil: {{supplier}}\n{{issued_at}}',
  });
});

it('odmítne neznámý dynamický obsah a chybějící části', () => {
  expect(() =>
    extractTemplateText(template.replace('Ukázkový rejstřík', '<?php dangerous(); ?>')),
  ).toThrow('TEMPLATE_TEXT_UNSUPPORTED');
  expect(() =>
    extractTemplateText(template.replace('echo $store_info', 'custom $store_info')),
  ).toThrow('TEMPLATE_LEFT_UNSUPPORTED');
  expect(() => extractTemplateText('<html></html>')).toThrow('TEMPLATE_TEXT_UNSUPPORTED');
});
