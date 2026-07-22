<?php
/**
 * Colourbond.cz chatbot proxy for PrestaShop 9.1.4.
 *
 * Upload this file to the PrestaShop installation root, next to config/ and init.php.
 * It is a public visitor endpoint, but the private backend token stays on the server.
 */

const COLOURBOND_AI_MAX_MESSAGE_LENGTH = 2000;
const COLOURBOND_AI_PROXY_VERSION = 'bilingual-assistant-v8';

require_once __DIR__ . '/config/config.inc.php';
require_once __DIR__ . '/init.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');

function colourbond_chatbot_error($status, $message)
{
    http_response_code($status);
    echo json_encode(array('error' => $message));
    exit;
}

/**
 * Reads configuration only from server-side sources; never accept these values
 * from the browser. Environment variables are preferred. On shared hosting
 * without PHP-FPM environment support, fall back to PrestaShop Configuration.
 */
function colourbond_chatbot_server_config($key)
{
    $value = getenv($key);
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    if (isset($_ENV[$key]) && is_string($_ENV[$key]) && trim($_ENV[$key]) !== '') {
        return trim($_ENV[$key]);
    }

    if (isset($_SERVER[$key]) && is_string($_SERVER[$key]) && trim($_SERVER[$key]) !== '') {
        return trim($_SERVER[$key]);
    }

    // Configuration is stored server-side in PrestaShop's database. It is not
    // exposed to JavaScript, HTML, or the public proxy response.
    if (class_exists('Configuration')) {
        $value = Configuration::get($key);
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }
    }

    return '';
}

function colourbond_chatbot_same_origin_request()
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string) $_SERVER['HTTP_ORIGIN']) : '';
    if ($origin === '') {
        return false;
    }

    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(trim((string) $_SERVER['HTTP_HOST'])) : '';
    if ($host === '') {
        return false;
    }

    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $originScheme = strtolower((string) parse_url($origin, PHP_URL_SCHEME));
    $requestIsSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    return $originHost === preg_replace('/:\d+$/', '', $host)
        && ($originScheme === 'https' || (!$requestIsSecure && $originScheme === 'http'));
}

/**
 * Resolves a PrestaShop cover image on this server. The browser receives only
 * the public image URL, never any backend token or image configuration secret.
 */
function colourbond_chatbot_enrich_product_images($payload)
{
    if (!is_array($payload) || empty($payload['products']) || !is_array($payload['products'])) {
        return $payload;
    }

    $context = Context::getContext();
    $languageId = isset($context->language->id) ? (int) $context->language->id : null;
    $productUrlsByTitle = array();
    $requestIsSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $requestHost = isset($_SERVER['HTTP_HOST'])
        ? preg_replace('/:\d+$/', '', strtolower(trim((string) $_SERVER['HTTP_HOST'])))
        : '';
    $shopBaseUrl = ($requestIsSecure ? 'https://' : 'http://') . $requestHost;
    $localProductPaths = array(
        'Vzorník barev' => '/46-vzorkovnik-farieb-.html',
        'JOLLYNATOR – koncovka na míchací trysku' => '/45-jollynator-koncovka-na-zmiesavaciu-dyzu.html',
        'JOLLYNATOR SET 90' => '/44-jollynator-set-90.html',
        'Míchací tryska pro kartuše EVERCLEAR 300' => '/43-miesacia-dyza-pre-kartuse-everclear-300.html',
        'Míchací tryska pro 250ml a 490ml kartuše 10:1' => '/42-miesacia-dyza-pre-250ml-490ml-kartus-101.html',
        'Aplikační pistole pro EVERCLEAR 300' => '/41-aplikacna-pistol-pre-everclear-300.html',
        'Aplikační pistole pro COLOUR BOND' => '/40-aplikacna-pistol-pre-colour-bond-.html',
        'Acryclean – odstraňovač silikonu' => '/39-acryclean-odstranovac-silikonu.html',
        'ACID čistič' => '/38-acid-cistic.html',
        'Čistič A' => '/37-cistic-a.html',
        'Čistič I' => '/36-cistic-i.html',
        'CERAMIC Smart Repair Set – sada na opravu keramiky' => '/35-ceramic-smart-repair-set-sada-na-opravu-keramiky.html',
        'Pigmenty pro AKEPOX®' => '/34-178-pigmenty-pre-akepox.html#/147-varianta-30_ml/150-barva-cervena',
        'Polyesterové pigmenty' => '/33-169-pigmenty-polyesterove.html#/142-barva-cerna/147-varianta-30_ml',
        'EVERCLEAR 300' => '/32-160-everclear-300.html#/82-barevna_kombinace-cc_1020_cerna',
        'EVERCLEAR 510' => '/31-eerclear-510.html',
        'AKENOVA® CLEAR 300' => '/30-akenova-clear-300-.html',
        'AKENOVA® ROCKET 200' => '/29-158-akenova-rocket-200.html#/143-barva-bila',
        'AKENOVA® ELASTIC 100' => '/28-154-akenova-elastic-100-.html#/143-barva-bila',
        'Akepox 5010' => '/27-150-akepox-5010.html#/137-varianta-50_ml/138-baleni-kartuse',
        'Akepox 2040' => '/26-148-akepox-2040.html#/134-baleni-plechovka/135-varianta-750_g',
        'PLATINUM Maxi Power tekuté' => '/25-platinum-tekute.html',
        'PLATINUM Maxi Power' => '/24-146-platinum-l-spezial.html#/132-baleni-170_g',
        'Colour Bond P+ 6min' => '/23-94-colour-bond-p-6min.html#/80-barevna_kombinace-cc_1000_cerny',
    );
    $localProductIds = array(
        'Vzorník barev' => 46, 'JOLLYNATOR – koncovka na míchací trysku' => 45,
        'JOLLYNATOR SET 90' => 44, 'Míchací tryska pro kartuše EVERCLEAR 300' => 43,
        'Míchací tryska pro 250ml a 490ml kartuše 10:1' => 42,
        'Aplikační pistole pro EVERCLEAR 300' => 41, 'Aplikační pistole pro COLOUR BOND' => 40,
        'Acryclean – odstraňovač silikonu' => 39, 'ACID čistič' => 38, 'Čistič A' => 37, 'Čistič I' => 36,
        'CERAMIC Smart Repair Set – sada na opravu keramiky' => 35, 'Pigmenty pro AKEPOX®' => 34,
        'Polyesterové pigmenty' => 33, 'EVERCLEAR 300' => 32, 'EVERCLEAR 510' => 31,
        'AKENOVA® CLEAR 300' => 30, 'AKENOVA® ROCKET 200' => 29, 'AKENOVA® ELASTIC 100' => 28,
        'Akepox 5010' => 27, 'Akepox 2040' => 26, 'PLATINUM Maxi Power tekuté' => 25,
        'PLATINUM Maxi Power' => 24, 'Colour Bond P+ 6min' => 23,
    );

    foreach ($payload['products'] as $index => $product) {
        if (!is_array($product)) {
            continue;
        }

        // Product IDs can differ between the production shop and a cloned or
        // rebuilt development shop. Resolve the local product by its exact
        // translated name before falling back to the ID returned by the AI
        // backend.
        $productId = 0;
        $localProductRewrite = '';
        $localCoverImageId = 0;
        $productTitle = isset($product['title']) ? trim((string) $product['title']) : '';

        if (isset($localProductPaths[$productTitle])) {
            $product['url'] = $shopBaseUrl . $localProductPaths[$productTitle];
        }

        if ($productTitle !== '' && $languageId) {
            try {
                $productSql = 'SELECT pl.id_product, pl.link_rewrite,'
                    . ' (SELECT image_shop.id_image FROM `' . _DB_PREFIX_ . 'image_shop` image_shop'
                    . ' WHERE image_shop.id_product = pl.id_product AND image_shop.cover = 1 LIMIT 1) AS cover_image_id'
                    . ' FROM `' . _DB_PREFIX_ . 'product_lang` pl'
                    . ' WHERE pl.id_lang = ' . (int) $languageId
                    . (isset($localProductIds[$productTitle])
                        ? ' AND pl.id_product = ' . (int) $localProductIds[$productTitle]
                        : " AND pl.name = '" . pSQL($productTitle) . "'");
                if (isset($context->shop->id)) {
                    $productSql .= ' AND pl.id_shop = ' . (int) $context->shop->id;
                }
                $productSql .= ' LIMIT 1';
                $localProduct = Db::getInstance()->getRow($productSql);
            } catch (Throwable $error) {
                // Product enrichment must never make an otherwise valid chat
                // response fail. The backend URL remains as a safe fallback.
                $localProduct = false;
            }
            if (is_array($localProduct) && !empty($localProduct['id_product'])) {
                $productId = (int) $localProduct['id_product'];
                $localProductRewrite = isset($localProduct['link_rewrite'])
                    ? (string) $localProduct['link_rewrite']
                    : '';
                $localCoverImageId = isset($localProduct['cover_image_id']) ? (int) $localProduct['cover_image_id'] : 0;
            }
        }

        if ($productId > 0 && $localProductRewrite !== '' && !isset($localProductPaths[$productTitle])) {
            $shopBasePath = defined('__PS_BASE_URI__') ? trim((string) __PS_BASE_URI__, '/') : '';
            if ($shopBasePath !== '') {
                $shopBaseUrl .= '/' . $shopBasePath;
            }
            $product['url'] = $shopBaseUrl
                . '/' . $productId
                . '-' . rawurlencode($localProductRewrite)
                . '.html';
        }

        if ($productId > 0 && $localProductRewrite !== '' && $languageId && isset($context->language->iso_code)
            && strtolower((string) $context->language->iso_code) === 'en') {
            $product['url'] = $shopBaseUrl . '/en/' . $productId . '-' . rawurlencode($localProductRewrite) . '.html';
        }

        if ($localCoverImageId <= 0 && $productId > 0) {
            try {
                $cover = Product::getCover($productId);
                if (is_array($cover) && !empty($cover['id_image'])) {
                    $localCoverImageId = (int) $cover['id_image'];
                }
            } catch (Throwable $error) {
                $localCoverImageId = 0;
            }
        }

        if ($localCoverImageId > 0 && $localProductRewrite !== '') {
            $product['image_url'] = $shopBaseUrl . '/' . $localCoverImageId
                . '-home_default/' . rawurlencode($localProductRewrite) . '.jpg';
        }

        // These are server-side lookup fields, not part of the public widget contract.
        unset($product['product_id'], $product['cover_image_id']);
        $payload['products'][$index] = $product;

        if (!empty($product['title']) && !empty($product['url'])) {
            $productUrlsByTitle[(string) $product['title']] = (string) $product['url'];
        }
    }

    // Sources are not technical data in the widget, but their links must lead
    // to the same canonical PrestaShop product detail as the product card.
    if (!empty($payload['sources']) && is_array($payload['sources'])) {
        foreach ($payload['sources'] as $index => $source) {
            if (!is_array($source) || empty($source['title'])) {
                continue;
            }
            $title = (string) $source['title'];
            if (isset($productUrlsByTitle[$title])) {
                $source['url'] = $productUrlsByTitle[$title];
                $payload['sources'][$index] = $source;
            }
        }
    }

    return $payload;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    colourbond_chatbot_error(405, 'Method not allowed.');
}

if (!colourbond_chatbot_same_origin_request()) {
    colourbond_chatbot_error(403, 'Invalid request origin.');
}

// Configure these values in the web server/PHP-FPM environment or PrestaShop
// Configuration database, never in this file.
$siteToken = colourbond_chatbot_server_config('COLOURBOND_AI_SITE_TOKEN');
$backendBaseUrl = rtrim(colourbond_chatbot_server_config('AI_BACKEND_URL'), '/');
if ($siteToken === '' || $backendBaseUrl === '') {
    colourbond_chatbot_error(503, 'Chatbot proxy is not configured.');
}

$rawBody = file_get_contents('php://input');
$request = json_decode($rawBody, true);

if (!is_array($request)) {
    colourbond_chatbot_error(400, 'Invalid JSON request body.');
}

$message = isset($request['message']) && is_string($request['message']) ? trim($request['message']) : '';
$conversationId = isset($request['conversation_id']) && is_string($request['conversation_id']) ? trim($request['conversation_id']) : '';
$sessionId = isset($request['session_id']) && is_string($request['session_id']) ? trim($request['session_id']) : '';
$sourcePageUrl = isset($request['source_page_url']) && is_string($request['source_page_url'])
    ? trim($request['source_page_url'])
    : '';
$language = isset($request['language']) && is_string($request['language'])
    ? strtolower(trim($request['language']))
    : 'cs';
if ($language !== 'cs' && $language !== 'en') {
    $language = 'cs';
}
$assistantName = $language === 'en'
    ? 'COLOUR BOND Product Adviser'
    : 'Produktový poradce COLOUR BOND';

if ($message === '' || Tools::strlen($message) > COLOURBOND_AI_MAX_MESSAGE_LENGTH) {
    colourbond_chatbot_error(400, 'Message must be 1-2000 characters.');
}

if (Tools::strlen($conversationId) > 80 || Tools::strlen($sessionId) > 120 || Tools::strlen($sourcePageUrl) > 500) {
    colourbond_chatbot_error(400, 'Invalid chat request fields.');
}

$backendPayload = array(
    'session_id' => $sessionId,
    'message' => $message,
    'language' => $language,
    'assistant_name' => $assistantName,
    'source_page_url' => $sourcePageUrl,
);

if ($conversationId !== '') {
    $backendPayload['conversation_id'] = $conversationId;
}

$curl = curl_init($backendBaseUrl . '/api/chat/message');
curl_setopt_array($curl, array(
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($backendPayload),
    CURLOPT_HTTPHEADER => array(
        'Content-Type: application/json',
        'Accept: application/json',
        'x-site-token: ' . $siteToken,
    ),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
));

$backendResponse = curl_exec($curl);
$backendStatus = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
$curlError = curl_error($curl);
curl_close($curl);

if ($backendResponse === false) {
    colourbond_chatbot_error(502, 'Chat service is temporarily unavailable.');
}

if ($backendStatus < 100) {
    colourbond_chatbot_error(502, $curlError !== '' ? 'Chat service connection failed.' : 'Invalid chat service response.');
}

// Keep the backend JSON and HTTP status unchanged for the browser widget.
http_response_code($backendStatus);
$decodedResponse = json_decode($backendResponse, true);
if (is_array($decodedResponse)) {
    try {
        echo json_encode(colourbond_chatbot_enrich_product_images($decodedResponse));
    } catch (Throwable $error) {
        error_log('Colourbond chatbot product enrichment failed: ' . $error->getMessage());
        echo json_encode($decodedResponse);
    }
} else {
    echo $backendResponse;
}
