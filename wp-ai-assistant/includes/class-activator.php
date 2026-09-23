<?php
/**
 * Activation handler.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Activator {
	/**
	 * Set default plugin options.
	 *
	 * @return void
	 */
	public static function activate() : void {
		$defaults = Nastroje_AI_Settings::defaults();

		if ( ! get_option( Nastroje_AI_Settings::OPTION_NAME ) ) {
			add_option( Nastroje_AI_Settings::OPTION_NAME, $defaults );
		}

		if ( ! get_option( Nastroje_AI_Sync::STATE_OPTION ) ) {
			add_option(
				Nastroje_AI_Sync::STATE_OPTION,
				array(
					'last_sync_at'      => '',
					'last_sync_status'  => 'idle',
					'last_items_synced' => 0,
					'logs'              => array(),
				)
			);
		}
	}
}
