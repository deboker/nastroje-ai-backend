<?php
/**
 * Uninstall handler for Nastroje AI Assistant.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'nastroje_ai_assistant_settings' );
delete_option( 'nastroje_ai_sync_state' );
