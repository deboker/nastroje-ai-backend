<?php
/**
 * Main plugin orchestrator.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Plugin {
	/**
	 * Singleton instance.
	 *
	 * @var Nastroje_AI_Plugin|null
	 */
	private static ?Nastroje_AI_Plugin $instance = null;

	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * API service.
	 *
	 * @var Nastroje_AI_API
	 */
	private Nastroje_AI_API $api;

	/**
	 * Sync service.
	 *
	 * @var Nastroje_AI_Sync
	 */
	private Nastroje_AI_Sync $sync;

	/**
	 * Widget loader.
	 *
	 * @var Nastroje_AI_Widget
	 */
	private Nastroje_AI_Widget $widget;

	/**
	 * Admin manager.
	 *
	 * @var Nastroje_AI_Admin
	 */
	private Nastroje_AI_Admin $admin;

	/**
	 * Shortcode handler.
	 *
	 * @var Nastroje_AI_Shortcode
	 */
	private Nastroje_AI_Shortcode $shortcode;

	/**
	 * Access singleton instance.
	 *
	 * @return Nastroje_AI_Plugin
	 */
	public static function instance() : Nastroje_AI_Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Build all service classes.
	 */
	private function __construct() {
		$this->settings  = new Nastroje_AI_Settings();
		$this->sync      = new Nastroje_AI_Sync( $this->settings );
		$this->api       = new Nastroje_AI_API( $this->settings, $this->sync );
		$this->widget    = new Nastroje_AI_Widget( $this->settings );
		$this->admin     = new Nastroje_AI_Admin( $this->settings, $this->api, $this->sync );
		$this->shortcode = new Nastroje_AI_Shortcode( $this->settings, $this->widget );

		$this->sync->set_api( $this->api );
	}

	/**
	 * Register hooks.
	 *
	 * @return void
	 */
	public function register() : void {
		add_action( 'plugins_loaded', array( $this, 'load_textdomain' ) );

		$this->settings->register();
		$this->api->register();
		$this->admin->register();
		$this->widget->register();
		$this->shortcode->register();
	}

	/**
	 * Load translations.
	 *
	 * @return void
	 */
	public function load_textdomain() : void {
		load_plugin_textdomain( 'nastroje-ai-assistant', false, dirname( plugin_basename( NASTROJE_AI_PLUGIN_FILE ) ) . '/languages' );
	}
}
