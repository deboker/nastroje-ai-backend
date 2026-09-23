<?php
/**
 * Frontend widget loader.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Widget {
	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * Asset enqueue flag.
	 *
	 * @var bool
	 */
	private bool $assets_enqueued = false;

	/**
	 * Constructor.
	 *
	 * @param Nastroje_AI_Settings $settings Settings service.
	 */
	public function __construct( Nastroje_AI_Settings $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Register frontend hooks.
	 *
	 * @return void
	 */
	public function register() : void {
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue_floating_assets' ) );
		add_action( 'wp_footer', array( $this, 'render_floating_widget' ) );
	}

	/**
	 * Register assets without enqueueing them.
	 *
	 * @return void
	 */
	public function register_assets() : void {
		wp_register_style(
			'nastroje-ai-widget',
			NASTROJE_AI_PLUGIN_URL . 'public/build/widget.css',
			array(),
			NASTROJE_AI_VERSION
		);

		wp_register_script(
			'nastroje-ai-widget',
			NASTROJE_AI_PLUGIN_URL . 'public/build/widget.js',
			array( 'wp-element' ),
			NASTROJE_AI_VERSION,
			true
		);
	}

	/**
	 * Enqueue frontend assets if the floating widget is enabled.
	 *
	 * @return void
	 */
	public function maybe_enqueue_floating_assets() : void {
		$settings = $this->settings->get_settings();
		if ( ! empty( $settings['widget_enabled'] ) ) {
			$this->enqueue_assets();
		}
	}

	/**
	 * Public method used by the shortcode to ensure widget assets exist.
	 *
	 * @return void
	 */
	public function enqueue_assets() : void {
		if ( $this->assets_enqueued ) {
			return;
		}

		$config = $this->get_frontend_config();

		wp_enqueue_style( 'nastroje-ai-widget' );
		wp_enqueue_script( 'nastroje-ai-widget' );
		wp_add_inline_script( 'nastroje-ai-widget', 'window.NastrojeAIWidget = ' . wp_json_encode( $config ) . ';', 'before' );

		$this->assets_enqueued = true;
	}

	/**
	 * Render floating widget mount point.
	 *
	 * @return void
	 */
	public function render_floating_widget() : void {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['widget_enabled'] ) ) {
			return;
		}

		$this->enqueue_assets();
		echo '<div class="nastroje-ai-widget-root" data-surface="floating"></div>';
	}

	/**
	 * Render inline chat root for shortcode usage.
	 *
	 * @param array<string,string> $attributes Shortcode attributes.
	 * @return string
	 */
	public function render_chat_root( array $attributes = array() ) : string {
		$this->enqueue_assets();

		$title = isset( $attributes['title'] ) ? sanitize_text_field( $attributes['title'] ) : '';

		return sprintf(
			'<div class="nastroje-ai-widget-root" data-surface="shortcode" data-title="%s"></div>',
			esc_attr( $title )
		);
	}

	/**
	 * Build public widget config.
	 *
	 * @return array<string,mixed>
	 */
	private function get_frontend_config() : array {
		$settings = $this->settings->get_settings();

			return array(
				'restUrl'        => esc_url_raw( rest_url( 'nastroje-ai/v1/chat/message' ) ),
				'conversationUrl' => esc_url_raw( rest_url( 'nastroje-ai/v1/chat/conversation' ) ),
				'leadSubmitUrl'  => esc_url_raw( rest_url( 'nastroje-ai/v1/lead-submit' ) ),
			'assistantName'  => $settings['assistant_name'],
			'iconUrl'        => $this->get_widget_icon_url(),
			'welcomeMessage' => $settings['welcome_message'],
			'language'       => $settings['language'],
			'theme'          => $settings['theme'],
			'design'         => array(
				'primaryColor' => $settings['ui_primary_color'],
				'surfaceColor' => $settings['ui_surface_color'],
				'textColor'    => $settings['ui_text_color'],
				'borderColor'  => $settings['ui_border_color'],
				'borderRadius' => (int) $settings['ui_border_radius'],
			),
			'privacyNotice'  => $settings['privacy_notice'],
			'siteUrl'        => home_url(),
			'homeUrl'        => home_url( '/' ),
			'widgetEnabled'  => (bool) $settings['widget_enabled'],
			'shortcodeEnabled' => (bool) $settings['shortcode_enabled'],
			'leadFlow'       => array(
				'enabled'         => (bool) $settings['lead_capture_enabled'],
				'formName'        => $settings['lead_form_name'],
				'introMessage'    => $settings['lead_intro_message'],
				'successMessage'  => $settings['lead_success_message'],
				'ctaLabel'        => $settings['lead_cta_label'],
				'questions'       => array_values( (array) $settings['lead_questions'] ),
			),
			'strings'        => array(
				'placeholder' => __( 'Napíšte svoju otázku...', 'nastroje-ai-assistant' ),
				'send'        => __( 'Odoslať', 'nastroje-ai-assistant' ),
				'newChat'     => __( 'Nová konverzácia', 'nastroje-ai-assistant' ),
				'startBrief'  => __( 'Spustiť brief', 'nastroje-ai-assistant' ),
				'next'        => __( 'Pokračovať', 'nastroje-ai-assistant' ),
				'error'       => __( 'Ospravedlňujeme sa, odpoveď sa nepodarilo načítať.', 'nastroje-ai-assistant' ),
			),
		);
	}

	/**
	 * Return the widget icon URL when a supported asset exists.
	 *
	 * Supported filenames:
	 * - assistant-icon.svg
	 * - assistant-icon.png
	 * - assistant-icon.webp
	 * - assistant-icon.jpg
	 * - assistant-icon.jpeg
	 *
	 * @return string
	 */
	private function get_widget_icon_url() : string {
		$candidates = array(
			'assistant-icon.svg',
			'assistant-icon.png',
			'assistant-icon.webp',
			'assistant-icon.jpg',
			'assistant-icon.jpeg',
		);

		foreach ( $candidates as $filename ) {
			$absolute_path = NASTROJE_AI_PLUGIN_PATH . 'assets/images/' . $filename;
			if ( file_exists( $absolute_path ) ) {
				return NASTROJE_AI_PLUGIN_URL . 'assets/images/' . $filename;
			}
		}

		return '';
	}
}
