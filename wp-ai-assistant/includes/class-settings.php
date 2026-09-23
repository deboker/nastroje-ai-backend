<?php
/**
 * Settings service.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Settings {
	public const OPTION_NAME = 'nastroje_ai_assistant_settings';

	/**
	 * Register admin settings.
	 *
	 * @return void
	 */
	public function register() : void {
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	/**
	 * Register Settings API fields.
	 *
	 * @return void
	 */
	public function register_settings() : void {
		register_setting(
			'nastroje_ai_assistant',
			self::OPTION_NAME,
			array(
				'type'              => 'array',
				'default'           => self::defaults(),
				'sanitize_callback' => array( $this, 'sanitize' ),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			'nastroje_ai_connection',
			__( 'Connection', 'nastroje-ai-assistant' ),
			'__return_false',
			'nastroje-ai-assistant-settings'
		);

		add_settings_section(
			'nastroje_ai_behavior',
			__( 'Assistant Behavior', 'nastroje-ai-assistant' ),
			'__return_false',
			'nastroje-ai-assistant-settings'
		);

		add_settings_section(
			'nastroje_ai_design',
			__( 'UI Design', 'nastroje-ai-assistant' ),
			'__return_false',
			'nastroje-ai-assistant-settings'
		);

		add_settings_section(
			'nastroje_ai_sync',
			__( 'Sync Settings', 'nastroje-ai-assistant' ),
			'__return_false',
			'nastroje-ai-assistant-settings'
		);

		add_settings_section(
			'nastroje_ai_leads',
			__( 'Lead Capture & Brief', 'nastroje-ai-assistant' ),
			'__return_false',
			'nastroje-ai-assistant-settings'
		);

		foreach ( $this->field_definitions() as $field_key => $field ) {
			add_settings_field(
				$field_key,
				$field['label'],
				array( $this, 'render_field' ),
				'nastroje-ai-assistant-settings',
				$field['section'],
				array(
					'key'   => $field_key,
					'field' => $field,
				)
			);
		}
	}

	/**
	 * Default settings.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults() : array {
		return array(
			'site_id'                        => '',
			'backend_url'                    => '',
			'site_token'                     => '',
			'public_site_key'                => '',
			'assistant_name'                 => 'Nastroje AI Assistant',
			'welcome_message'                => 'Dobrý deň, som váš AI asistent. Ako vám môžem pomôcť?',
			'language'                       => 'sk',
			'tone'                           => 'professional',
			'theme'                          => 'teal',
			'ui_primary_color'               => '#0f8b75',
			'ui_surface_color'               => '#ffffff',
			'ui_text_color'                  => '#163028',
			'ui_border_color'                => '#d4e3de',
			'ui_border_radius'               => 22,
			'widget_enabled'                 => true,
			'shortcode_enabled'              => true,
			'lead_capture_enabled'           => true,
			'lead_form_name'                 => 'Predajný brief',
			'lead_intro_message'             => 'Pred prípravou návrhu vám položím niekoľko stručných otázok.',
			'lead_success_message'           => 'Ďakujeme, brief sme prijali a čoskoro sa vám ozveme.',
			'lead_cta_label'                 => 'Spustiť brief',
			'lead_questions'                 => array(
				array(
					'id'          => 'name',
					'label'       => 'Ako sa voláte?',
					'type'        => 'text',
					'required'    => true,
					'placeholder' => 'Vaše meno',
				),
				array(
					'id'          => 'email',
					'label'       => 'Aký je váš e-mail?',
					'type'        => 'email',
					'required'    => true,
					'placeholder' => 'vas@email.sk',
				),
				array(
					'id'          => 'company',
					'label'       => 'Aká je vaša firma?',
					'type'        => 'text',
					'required'    => false,
					'placeholder' => 'Názov firmy',
				),
				array(
					'id'          => 'goal',
					'label'       => 'Čo potrebujete vyriešiť?',
					'type'        => 'textarea',
					'required'    => true,
					'placeholder' => 'Krátky opis zadania',
				),
				array(
					'id'          => 'timeline',
					'label'       => 'Aký máte termín?',
					'type'        => 'text',
					'required'    => false,
					'placeholder' => 'Napr. do 2 týždňov',
				),
			),
			'allowed_post_types'             => array( 'post', 'page' ),
			'include_woocommerce_products'   => true,
			'sync_frequency'                 => 'manual',
			'privacy_notice'                 => 'Správy môže spracovať externý backend.',
			'connection_status'              => 'not_configured',
			'connection_validated_at'        => '',
			'last_backend_error'             => '',
		);
	}

	/**
	 * Field metadata for Settings API fallback UI.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	private function field_definitions() : array {
		return array(
			'backend_url' => array(
				'label'       => __( 'Backend URL', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_connection',
				'type'        => 'url',
				'description' => __( 'Base URL of the external backend API.', 'nastroje-ai-assistant' ),
			),
			'site_token' => array(
				'label'       => __( 'Plugin Site Token', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_connection',
				'type'        => 'password',
				'description' => __( 'Private site token issued by the backend. Keep this secret.', 'nastroje-ai-assistant' ),
			),
			'public_site_key' => array(
				'label'       => __( 'Public Site Key', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_connection',
				'type'        => 'text',
				'description' => __( 'Reserved for future public client-side integrations.', 'nastroje-ai-assistant' ),
			),
			'assistant_name' => array(
				'label'       => __( 'Assistant Name', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'text',
				'description' => __( 'Name displayed in the widget and admin.', 'nastroje-ai-assistant' ),
			),
			'welcome_message' => array(
				'label'       => __( 'Welcome Message', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'textarea',
				'description' => __( 'First message shown before the visitor starts chatting.', 'nastroje-ai-assistant' ),
			),
			'language' => array(
				'label'       => __( 'Primary Language', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'text',
				'description' => __( 'ISO language code used by the assistant, default is sk.', 'nastroje-ai-assistant' ),
			),
			'tone' => array(
				'label'       => __( 'Tone of Voice', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'text',
				'description' => __( 'Example: professional, friendly, concise.', 'nastroje-ai-assistant' ),
			),
			'theme' => array(
				'label'       => __( 'Theme', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'text',
				'description' => __( 'Widget theme token, for example teal or slate.', 'nastroje-ai-assistant' ),
			),
			'ui_primary_color' => array(
				'label'       => __( 'Primary Color', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_design',
				'type'        => 'color',
				'description' => __( 'Accent color used for the widget header, buttons, and active states.', 'nastroje-ai-assistant' ),
			),
			'ui_surface_color' => array(
				'label'       => __( 'Surface Color', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_design',
				'type'        => 'color',
				'description' => __( 'Background color used for the main widget panel.', 'nastroje-ai-assistant' ),
			),
			'ui_text_color' => array(
				'label'       => __( 'Text Color', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_design',
				'type'        => 'color',
				'description' => __( 'Primary text color inside the widget.', 'nastroje-ai-assistant' ),
			),
			'ui_border_color' => array(
				'label'       => __( 'Border Color', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_design',
				'type'        => 'color',
				'description' => __( 'Border color used around cards, inputs, and tabs.', 'nastroje-ai-assistant' ),
			),
			'ui_border_radius' => array(
				'label'       => __( 'Border Radius', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_design',
				'type'        => 'number',
				'description' => __( 'Base widget corner radius in pixels.', 'nastroje-ai-assistant' ),
			),
			'widget_enabled' => array(
				'label'       => __( 'Enable Floating Widget', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'checkbox',
				'description' => __( 'Show the floating chat bubble in the bottom-right corner.', 'nastroje-ai-assistant' ),
			),
			'shortcode_enabled' => array(
				'label'       => __( 'Enable Shortcode', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_behavior',
				'type'        => 'checkbox',
				'description' => __( 'Allow rendering with [ai_assistant_chat].', 'nastroje-ai-assistant' ),
			),
			'lead_capture_enabled' => array(
				'label'       => __( 'Enable Brief / Lead Flow', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'checkbox',
				'description' => __( 'Expose the conversational brief and lead capture flow in the widget.', 'nastroje-ai-assistant' ),
			),
			'lead_form_name' => array(
				'label'       => __( 'Lead Form Name', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'text',
				'description' => __( 'Displayed in the admin and synced as the default backend brief form.', 'nastroje-ai-assistant' ),
			),
			'lead_intro_message' => array(
				'label'       => __( 'Lead Intro Message', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'textarea',
				'description' => __( 'Shown before the brief flow starts.', 'nastroje-ai-assistant' ),
			),
			'lead_success_message' => array(
				'label'       => __( 'Lead Success Message', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'textarea',
				'description' => __( 'Shown after the brief / lead submission is stored.', 'nastroje-ai-assistant' ),
			),
			'lead_cta_label' => array(
				'label'       => __( 'Lead CTA Label', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'text',
				'description' => __( 'Primary button label for launching the brief flow.', 'nastroje-ai-assistant' ),
			),
			'lead_questions' => array(
				'label'       => __( 'Lead Questions JSON', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_leads',
				'type'        => 'jsontextarea',
				'description' => __( 'JSON array of conversational brief questions.', 'nastroje-ai-assistant' ),
			),
			'allowed_post_types' => array(
				'label'       => __( 'Allowed Post Types', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_sync',
				'type'        => 'multiselect',
				'description' => __( 'Select WordPress post types that may be synced to the backend.', 'nastroje-ai-assistant' ),
			),
			'include_woocommerce_products' => array(
				'label'       => __( 'Include WooCommerce Products', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_sync',
				'type'        => 'checkbox',
				'description' => __( 'Sync product catalog data when WooCommerce is available.', 'nastroje-ai-assistant' ),
			),
			'sync_frequency' => array(
				'label'       => __( 'Sync Frequency', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_sync',
				'type'        => 'text',
				'description' => __( 'Placeholder for future scheduled syncing.', 'nastroje-ai-assistant' ),
			),
			'privacy_notice' => array(
				'label'       => __( 'Privacy Notice', 'nastroje-ai-assistant' ),
				'section'     => 'nastroje_ai_sync',
				'type'        => 'textarea',
				'description' => __( 'Short notice shown to visitors beneath the chat form.', 'nastroje-ai-assistant' ),
			),
		);
	}

	/**
	 * Render a fallback settings field.
	 *
	 * @param array<string,mixed> $args Field arguments.
	 * @return void
	 */
	public function render_field( array $args ) : void {
		$key      = $args['key'];
		$field    = $args['field'];
		$settings = $this->get_settings();
		$value    = $settings[ $key ] ?? '';
		$name     = self::OPTION_NAME . '[' . $key . ']';

		switch ( $field['type'] ) {
			case 'textarea':
				printf(
					'<textarea class="large-text" rows="4" name="%1$s">%2$s</textarea>',
					esc_attr( $name ),
					esc_textarea( (string) $value )
				);
				break;

			case 'jsontextarea':
				printf(
					'<textarea class="large-text code" rows="10" name="%1$s">%2$s</textarea>',
					esc_attr( $name ),
					esc_textarea( wp_json_encode( $value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ) )
				);
				break;

			case 'checkbox':
				printf(
					'<label><input type="checkbox" name="%1$s" value="1" %2$s /> %3$s</label>',
					esc_attr( $name ),
					checked( ! empty( $value ), true, false ),
					esc_html__( 'Enabled', 'nastroje-ai-assistant' )
				);
				break;

			case 'multiselect':
				$choices = $this->get_available_post_types();
				printf( '<select class="regular-text" multiple="multiple" name="%1$s[]">', esc_attr( $name ) );
				foreach ( $choices as $choice_key => $label ) {
					printf(
						'<option value="%1$s" %2$s>%3$s</option>',
						esc_attr( $choice_key ),
						selected( in_array( $choice_key, (array) $value, true ), true, false ),
						esc_html( $label )
					);
				}
				echo '</select>';
				break;

			default:
				printf(
					'<input class="regular-text" type="%1$s" name="%2$s" value="%3$s" />',
					esc_attr( $field['type'] ),
					esc_attr( $name ),
					esc_attr( (string) $value )
				);
		}

		if ( ! empty( $field['description'] ) ) {
			printf( '<p class="description">%s</p>', esc_html( $field['description'] ) );
		}
	}

	/**
	 * Sanitize settings.
	 *
	 * @param array<string,mixed> $input Raw input.
	 * @return array<string,mixed>
	 */
	public function sanitize( array $input ) : array {
		$current = $this->get_settings();
		$output  = self::defaults();

		$output['site_id']                      = sanitize_text_field( (string) ( $input['site_id'] ?? $current['site_id'] ) );
		$output['backend_url']                  = esc_url_raw( trim( (string) ( $input['backend_url'] ?? $current['backend_url'] ) ) );
		$output['site_token']                   = sanitize_text_field( (string) ( $input['site_token'] ?? $current['site_token'] ) );
		$output['public_site_key']              = sanitize_text_field( (string) ( $input['public_site_key'] ?? $current['public_site_key'] ) );
		$output['assistant_name']               = sanitize_text_field( (string) ( $input['assistant_name'] ?? $current['assistant_name'] ) );
		$output['welcome_message']              = sanitize_textarea_field( (string) ( $input['welcome_message'] ?? $current['welcome_message'] ) );
		$output['language']                     = sanitize_text_field( (string) ( $input['language'] ?? $current['language'] ) );
		$output['tone']                         = sanitize_text_field( (string) ( $input['tone'] ?? $current['tone'] ) );
		$output['theme']                        = sanitize_key( (string) ( $input['theme'] ?? $current['theme'] ) );
		$output['ui_primary_color']             = sanitize_hex_color( (string) ( $input['ui_primary_color'] ?? $current['ui_primary_color'] ) ) ?: self::defaults()['ui_primary_color'];
		$output['ui_surface_color']             = sanitize_hex_color( (string) ( $input['ui_surface_color'] ?? $current['ui_surface_color'] ) ) ?: self::defaults()['ui_surface_color'];
		$output['ui_text_color']                = sanitize_hex_color( (string) ( $input['ui_text_color'] ?? $current['ui_text_color'] ) ) ?: self::defaults()['ui_text_color'];
		$output['ui_border_color']              = sanitize_hex_color( (string) ( $input['ui_border_color'] ?? $current['ui_border_color'] ) ) ?: self::defaults()['ui_border_color'];
		$output['ui_border_radius']             = min( 40, max( 0, absint( $input['ui_border_radius'] ?? $current['ui_border_radius'] ) ) );
		$output['widget_enabled']               = ! empty( $input['widget_enabled'] );
		$output['shortcode_enabled']            = ! empty( $input['shortcode_enabled'] );
		$output['lead_capture_enabled']         = ! empty( $input['lead_capture_enabled'] );
		$output['lead_form_name']               = sanitize_text_field( (string) ( $input['lead_form_name'] ?? $current['lead_form_name'] ) );
		$output['lead_intro_message']           = sanitize_textarea_field( (string) ( $input['lead_intro_message'] ?? $current['lead_intro_message'] ) );
		$output['lead_success_message']         = sanitize_textarea_field( (string) ( $input['lead_success_message'] ?? $current['lead_success_message'] ) );
		$output['lead_cta_label']               = sanitize_text_field( (string) ( $input['lead_cta_label'] ?? $current['lead_cta_label'] ) );
		$output['lead_questions']               = $this->sanitize_lead_questions( $input['lead_questions'] ?? $current['lead_questions'] );
		$output['sync_frequency']               = sanitize_text_field( (string) ( $input['sync_frequency'] ?? $current['sync_frequency'] ) );
		$output['privacy_notice']               = sanitize_textarea_field( (string) ( $input['privacy_notice'] ?? $current['privacy_notice'] ) );
		$output['connection_status']            = sanitize_text_field( (string) ( $input['connection_status'] ?? $current['connection_status'] ) );
		$output['connection_validated_at']      = sanitize_text_field( (string) ( $input['connection_validated_at'] ?? $current['connection_validated_at'] ) );
		$output['last_backend_error']           = sanitize_textarea_field( (string) ( $input['last_backend_error'] ?? $current['last_backend_error'] ) );
		$output['include_woocommerce_products'] = ! empty( $input['include_woocommerce_products'] );

		$allowed_post_types          = array();
		$available_post_types        = array_keys( $this->get_available_post_types() );
		$requested_allowed_post_type = isset( $input['allowed_post_types'] ) ? (array) $input['allowed_post_types'] : (array) $current['allowed_post_types'];

		foreach ( $requested_allowed_post_type as $post_type ) {
			$post_type = sanitize_key( (string) $post_type );
			if ( in_array( $post_type, $available_post_types, true ) ) {
				$allowed_post_types[] = $post_type;
			}
		}

		$output['allowed_post_types'] = ! empty( $allowed_post_types ) ? array_values( array_unique( $allowed_post_types ) ) : array( 'post', 'page' );

		return $output;
	}

	/**
	 * Sanitize the lead question configuration array.
	 *
	 * @param mixed $value Raw lead questions value.
	 * @return array<int,array<string,mixed>>
	 */
	private function sanitize_lead_questions( $value ) : array {
		if ( is_string( $value ) ) {
			$decoded = json_decode( $value, true );
			$value   = is_array( $decoded ) ? $decoded : array();
		}

		$questions = array();

		foreach ( (array) $value as $question ) {
			if ( ! is_array( $question ) ) {
				continue;
			}

			$question_id = sanitize_key( (string) ( $question['id'] ?? '' ) );
			$label       = sanitize_text_field( (string) ( $question['label'] ?? '' ) );
			$type        = sanitize_key( (string) ( $question['type'] ?? 'text' ) );

			if ( '' === $question_id || '' === $label ) {
				continue;
			}

			$questions[] = array(
				'id'          => $question_id,
				'label'       => $label,
				'type'        => in_array( $type, array( 'text', 'email', 'textarea', 'select' ), true ) ? $type : 'text',
				'required'    => ! empty( $question['required'] ),
				'placeholder' => sanitize_text_field( (string) ( $question['placeholder'] ?? '' ) ),
				'options'     => array_values(
					array_filter(
						array_map(
							'sanitize_text_field',
							(array) ( $question['options'] ?? array() )
						)
					)
				),
			);
		}

		return ! empty( $questions ) ? $questions : self::defaults()['lead_questions'];
	}

	/**
	 * Read merged settings.
	 *
	 * @return array<string,mixed>
	 */
	public function get_settings() : array {
		$settings = wp_parse_args( (array) get_option( self::OPTION_NAME, array() ), self::defaults() );

		if (
			empty( $settings['privacy_notice'] ) ||
			'Odoslané správy môžu byť spracované externým backendom na účely odpovedí a analytiky.' === $settings['privacy_notice']
		) {
			$settings['privacy_notice'] = self::defaults()['privacy_notice'];
		}

		return $settings;
	}

	/**
	 * Persist sanitized settings.
	 *
	 * @param array<string,mixed> $settings Settings to write.
	 * @return array<string,mixed>
	 */
	public function update_settings( array $settings ) : array {
		$sanitized = $this->sanitize( $settings );
		update_option( self::OPTION_NAME, $sanitized );

		return $sanitized;
	}

	/**
	 * Available post types for syncing.
	 *
	 * @return array<string,string>
	 */
	public function get_available_post_types() : array {
		$post_types = get_post_types(
			array(
				'public' => true,
			),
			'objects'
		);

		$choices = array();

		foreach ( $post_types as $post_type ) {
			if ( 'attachment' === $post_type->name || 'product' === $post_type->name ) {
				continue;
			}

			$choices[ $post_type->name ] = $post_type->labels->singular_name;
		}

		return $choices;
	}
}
