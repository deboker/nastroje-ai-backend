<?php
/**
 * Plugin Name: Nastroje AI Assistant for WordPress
 * Plugin URI: https://example.com/nastroje-ai-assistant
 * Description: Modern AI assistant plugin for WordPress with Supabase-backed content sync and chat.
 * Version: 0.1.16
 * Author: Nastroje
 * Text Domain: nastroje-ai-assistant
 * Requires PHP: 8.0
 * Requires at least: 6.2
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NASTROJE_AI_VERSION', '0.1.16' );
define( 'NASTROJE_AI_PLUGIN_FILE', __FILE__ );
define( 'NASTROJE_AI_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'NASTROJE_AI_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-activator.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-settings.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-sync.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-api.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-admin.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-widget.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-shortcode.php';
require_once NASTROJE_AI_PLUGIN_PATH . 'includes/class-plugin.php';

register_activation_hook( __FILE__, array( 'Nastroje_AI_Activator', 'activate' ) );

function nastroje_ai_assistant() : Nastroje_AI_Plugin {
	return Nastroje_AI_Plugin::instance();
}

nastroje_ai_assistant()->register();
