<?php
// Isolated test harness: synthetic JSON only; no legacy config or website requests.
declare(strict_types=1);
$root = dirname(__DIR__);
$legacy = $root . '/legacy/faktury.janpetrik.cz/www/';
$input = $argv[1] ?? '';
if (!str_starts_with(realpath($input) ?: '', $root . '/tests/fixtures/')) { throw new RuntimeException('Synthetic fixture required'); }
$d = json_decode(file_get_contents($input), true, 512, JSON_THROW_ON_ERROR);
require_once $legacy . 'application/third_party/dompdf/vendor/autoload.php';
define('APPPATH', $legacy . 'application/');
date_default_timezone_set('Europe/Prague');
$s=$d['snapshot']['supplier'];$b=$d['snapshot']['bank'];$contact=$d['snapshot']['customer'];
$contact['id']=$contact['end_customer']?1:2;$contact['zip']=substr_replace($contact['zip'],' ',3,0);
$store_info=['store_name'=>$s['company'],'address'=>$s['street'],'city'=>$s['city'],'country'=>$s['country'],'zip'=>$s['zip'],'store_id'=>$s['ico'],'store_vat'=>$s['dic'],'tel'=>$s['phone'],'mail'=>$s['email'],'bank_account_number'=>$b['account_number'],'bank_code'=>$b['bank_code']];
$date=new DateTime($d['source_created']);$due_date=new DateTime($d['due_date']);$invoice_id=$d['invoice_number'];$vat=$d['items'][0]['vat_rate'];$total=round((float)$d['net'],2);$total_only_vat=round((float)$d['vat'],2);$total_plus_vat=round((float)$d['gross'],2);
$items=[];foreach($d['items'] as $i){$items[]=(object)['description'=>$i['description'],'price'=>(float)$i['price'],'amount'=>(float)$i['quantity'],'price_plus_amount'=>(float)$i['net'],'vat_plus_amount'=>(float)$i['vat'],'price_plus_amount_plus_vat'=>(float)$i['gross']];}
$template=file_get_contents($legacy . 'application/views/themes/default/invoice/invoice_view.php');
// Replace only private fixed text with the same synthetic values used by Node.
$template=preg_replace('/www\.[A-Za-z0-9.-]+/',htmlspecialchars($s['website'],ENT_QUOTES,'UTF-8'),$template);
$start=strpos($template,'<div class="footer-wrapper">');
$template=substr($template,0,$start).'<div class="footer-wrapper"><div class="footer"><div class="width-50">Vystavil: <?php echo $store_info[\'store_name\'] ?><br><?php echo date_format($date,"j. n Y H:i:s") ?></div><!--
--><div class="text-right width-50">'.htmlspecialchars($s['footer'],ENT_QUOTES,'UTF-8').'</div></div></div></body></html>';
$template=str_replace('src="webimage/logo.jpg"','src="'.$legacy.'webimage/logo.jpg"',$template);
$tmp=$root.'/.private/pdf/reference-template.php';file_put_contents($tmp,$template);
ob_start();include $tmp;$html=ob_get_clean();
$options=new Dompdf\Options(['isRemoteEnabled'=>false,'isPhpEnabled'=>false,'isJavascriptEnabled'=>false,'defaultFont'=>'DejaVu Sans','chroot'=>[$legacy,$root.'/.private/pdf'],'fontCache'=>$root.'/.private/pdf/font-cache','tempDir'=>$root.'/.private/pdf']);
@mkdir($root.'/.private/pdf/font-cache',0700,true);
$pdf=new Dompdf\Dompdf($options);$pdf->setPaper('A4','portrait');$pdf->loadHtml($html);$pdf->render();file_put_contents($argv[2],$pdf->output());
