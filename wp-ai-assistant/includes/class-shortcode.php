<?php
/**
 * Shortcode handler.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Shortcode {
	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * Widget service.
	 *
	 * @var Nastroje_AI_Widget
	 */
	private Nastroje_AI_Widget $widget;

	/**
	 * Constructor.
	 *
	 * @param Nastroje_AI_Settings $settings Settings service.
	 * @param Nastroje_AI_Widget   $widget Widget service.
	 */
	public function __construct( Nastroje_AI_Settings $settings, Nastroje_AI_Widget $widget ) {
		$this->settings = $settings;
		$this->widget   = $widget;
	}

	/**
	 * Register shortcode.
	 *
	 * @return void
	 */
	public function register() : void {
		add_shortcode( 'ai_assistant_chat', array( $this, 'render' ) );
	}

	/**
	 * Render chat shortcode.
	 *
	 * @param array<string,string> $attributes Shortcode attributes.
	 * @return string
	 */
	public function render( array $attributes = array() ) : string {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['shortcode_enabled'] ) ) {
			return '<p>' . esc_html__( 'The AI Assistant shortcode is currently disabled.', 'nastroje-ai-assistant' ) . '</p>';
		}

		$attributes = shortcode_atts(
			array(
				'title' => '',
			),
			$attributes,
			'ai_assistant_chat'
		);

		return $this->widget->render_chat_root( $attributes );
	}
}
