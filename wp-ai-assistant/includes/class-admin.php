<?php
/**
 * Admin UI bootstrap.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Admin {
	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * API proxy.
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
	 * Page map.
	 *
	 * @var array<string,string>
	 */
	private array $pages = array(
		'nastroje-ai-assistant'               => 'dashboard',
		'nastroje-ai-assistant-dashboard'     => 'dashboard',
		'nastroje-ai-assistant-settings'      => 'settings',
		'nastroje-ai-assistant-sync'          => 'sync',
		'nastroje-ai-assistant-leads'         => 'leads',
		'nastroje-ai-assistant-analytics'     => 'analytics',
		'nastroje-ai-assistant-conversations' => 'conversations',
		'nastroje-ai-assistant-help'          => 'help',
	);

	/**
	 * Constructor.
	 *
	 * @param Nastroje_AI_Settings $settings Settings service.
	 * @param Nastroje_AI_API      $api API service.
	 * @param Nastroje_AI_Sync     $sync Sync service.
	 */
	public function __construct( Nastroje_AI_Settings $settings, Nastroje_AI_API $api, Nastroje_AI_Sync $sync ) {
		$this->settings = $settings;
		$this->api      = $api;
		$this->sync     = $sync;
	}

	/**
	 * Register admin hooks.
	 *
	 * @return void
	 */
	public function register() : void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * Register plugin sidebar menu.
	 *
	 * @return void
	 */
	public function register_menu() : void {
		$capability = 'manage_options';

		add_menu_page(
			__( 'AI Assistant', 'nastroje-ai-assistant' ),
			__( 'AI Assistant', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant',
			array( $this, 'render_app' ),
			'dashicons-format-chat',
			58
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Dashboard', 'nastroje-ai-assistant' ),
			__( 'Dashboard', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-dashboard',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Settings', 'nastroje-ai-assistant' ),
			__( 'Settings', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-settings',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Content Sync', 'nastroje-ai-assistant' ),
			__( 'Content Sync', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-sync',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Lead Capture', 'nastroje-ai-assistant' ),
			__( 'Lead Capture', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-leads',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Analytika', 'nastroje-ai-assistant' ),
			__( 'Analytika', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-analytics',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Conversations', 'nastroje-ai-assistant' ),
			__( 'Conversations', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-conversations',
			array( $this, 'render_app' )
		);

		add_submenu_page(
			'nastroje-ai-assistant',
			__( 'Help', 'nastroje-ai-assistant' ),
			__( 'Help', 'nastroje-ai-assistant' ),
			$capability,
			'nastroje-ai-assistant-help',
			array( $this, 'render_app' )
		);
	}

	/**
	 * Enqueue admin assets for plugin pages.
	 *
	 * @param string $hook Current admin hook.
	 * @return void
	 */
	public function enqueue_assets( string $hook ) : void {
		if ( false === strpos( $hook, 'nastroje-ai-assistant' ) ) {
			return;
		}

		wp_enqueue_style(
			'nastroje-ai-admin',
			NASTROJE_AI_PLUGIN_URL . 'admin/build/admin.css',
			array(),
			NASTROJE_AI_VERSION
		);

		wp_enqueue_script(
			'nastroje-ai-admin',
			NASTROJE_AI_PLUGIN_URL . 'admin/build/admin.js',
			array( 'wp-element', 'wp-api-fetch' ),
			NASTROJE_AI_VERSION,
			true
		);

		$page_slug = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : 'nastroje-ai-assistant';
		$view      = $this->pages[ $page_slug ] ?? 'dashboard';

		wp_localize_script(
			'nastroje-ai-admin',
			'NastrojeAIAdmin',
			array(
				'nonce'             => wp_create_nonce( 'wp_rest' ),
				'restBase'          => esc_url_raw( rest_url( 'nastroje-ai/v1' ) ),
				'currentView'       => $view,
				'siteName'          => get_bloginfo( 'name' ),
				'siteUrl'           => home_url(),
				'settings'          => $this->settings->get_settings(),
				'availablePostTypes'=> $this->settings->get_available_post_types(),
				'syncState'         => $this->sync->get_state(),
				'menuUrls'          => array(
					'dashboard'     => admin_url( 'admin.php?page=nastroje-ai-assistant-dashboard' ),
					'settings'      => admin_url( 'admin.php?page=nastroje-ai-assistant-settings' ),
					'sync'          => admin_url( 'admin.php?page=nastroje-ai-assistant-sync' ),
					'leads'         => admin_url( 'admin.php?page=nastroje-ai-assistant-leads' ),
					'analytics'     => admin_url( 'admin.php?page=nastroje-ai-assistant-analytics' ),
					'conversations' => admin_url( 'admin.php?page=nastroje-ai-assistant-conversations' ),
					'help'          => admin_url( 'admin.php?page=nastroje-ai-assistant-help' ),
				),
			)
		);
	}

	/**
	 * Render React mount point.
	 *
	 * @return void
	 */
	public function render_app() : void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'nastroje-ai-assistant' ) );
		}

		echo '<div class="wrap nastroje-ai-admin-wrap">';
		echo '<div id="nastroje-ai-admin-root"></div>';
		echo '<noscript>';
		echo '<div class="notice notice-warning"><p>' . esc_html__( 'JavaScript is required for the full admin experience.', 'nastroje-ai-assistant' ) . '</p></div>';
		echo '<form method="post" action="options.php">';
		settings_fields( 'nastroje_ai_assistant' );
		do_settings_sections( 'nastroje-ai-assistant-settings' );
		submit_button( __( 'Save Settings', 'nastroje-ai-assistant' ) );
		echo '</form>';
		echo '</noscript>';
		echo '</div>';
	}
}
