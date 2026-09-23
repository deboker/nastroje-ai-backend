<?php
/**
 * WordPress REST API and backend proxy.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_API {
	private const MAX_CHAT_MESSAGE_LENGTH = 2000;
	private const MAX_LEAD_ANSWER_LENGTH = 2000;
	private const MAX_LEAD_ANSWERS = 20;

	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * Sync service.
	 *
	 * @var Nastroje_AI_Sync
	 */
	private Nastroje_AI_Sync $sync;

	/**
	 * Constructor.
	 *
	 * @param Nastroje_AI_Settings $settings Settings service.
	 * @param Nastroje_AI_Sync     $sync Sync service.
	 */
	public function __construct( Nastroje_AI_Settings $settings, Nastroje_AI_Sync $sync ) {
		$this->settings = $settings;
		$this->sync     = $sync;
	}

	/**
	 * Register REST routes.
	 *
	 * @return void
	 */
	public function register() : void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Register plugin REST API routes.
	 *
	 * @return void
	 */
	public function register_routes() : void {
		register_rest_route(
			'nastroje-ai/v1',
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_settings' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'save_settings' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/register-site',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'register_site' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/test-connection',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'test_connection' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/dashboard',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_dashboard' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/analytics',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_analytics' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/sync',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'run_sync' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/conversations',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_conversations' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/conversations/(?P<conversation_id>[a-zA-Z0-9-]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_conversation' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_conversation' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/lead-submissions',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_lead_submissions' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

		register_rest_route(
			'nastroje-ai/v1',
			'/lead-submissions/(?P<submission_id>[a-zA-Z0-9-]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_lead_submission' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_lead_submission' ),
					'permission_callback' => array( $this, 'admin_permissions' ),
				),
			)
		);

			register_rest_route(
				'nastroje-ai/v1',
				'/chat/message',
				array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'chat_message' ),
					'permission_callback' => '__return_true',
				),
				)
			);

			register_rest_route(
				'nastroje-ai/v1',
				'/chat/conversation',
				array(
					array(
						'methods'             => WP_REST_Server::READABLE,
						'callback'            => array( $this, 'get_public_conversation' ),
						'permission_callback' => '__return_true',
					),
				)
			);

			register_rest_route(
				'nastroje-ai/v1',
				'/lead-submit',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'submit_lead' ),
					'permission_callback' => '__return_true',
				),
			)
		);
	}

	/**
	 * Admin permission callback.
	 *
	 * @return bool
	 */
	public function admin_permissions() : bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Return current settings to admin app.
	 *
	 * @return WP_REST_Response
	 */
	public function get_settings() : WP_REST_Response {
		$settings = $this->settings->get_settings();

		return new WP_REST_Response(
			array(
				'settings'          => $settings,
				'availablePostTypes'=> $this->settings->get_available_post_types(),
				'syncState'         => $this->sync->get_state(),
			)
		);
	}

	/**
	 * Update settings locally and remotely.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function save_settings( WP_REST_Request $request ) {
		$payload  = (array) $request->get_json_params();
		$current  = $this->settings->get_settings();
		$updated  = $this->settings->update_settings( array_merge( $current, $payload ) );
		$warnings = array();

		if ( ! empty( $updated['backend_url'] ) && ! empty( $updated['site_token'] ) ) {
			$remote = $this->backend_request(
				'/api/sites/settings',
				'POST',
				$this->build_site_settings_payload( $updated )
			);

			if ( is_wp_error( $remote ) ) {
				$warnings[] = $remote->get_error_message();
				$updated['last_backend_error'] = $remote->get_error_message();
				$updated                       = $this->settings->update_settings( $updated );
			} else {
				$updated['last_backend_error'] = '';
				$updated                       = $this->settings->update_settings( $updated );
			}
		}

		return new WP_REST_Response(
			array(
				'settings' => $updated,
				'warnings' => $warnings,
			)
		);
	}

	/**
	 * Register the site against the backend.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function register_site() {
		$settings = $this->settings->get_settings();
		$response = $this->backend_request(
			'/api/sites/register',
			'POST',
			array(
				'name'             => get_bloginfo( 'name' ),
				'domain'           => wp_parse_url( home_url(), PHP_URL_HOST ),
				'wp_url'           => home_url(),
				'language'         => $settings['language'],
				'site_settings'    => $this->build_site_settings_payload( $settings ),
				'plugin_version'   => NASTROJE_AI_VERSION,
			),
			false
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		if ( ! empty( $response['site']['id'] ) ) {
			$settings['site_id']               = sanitize_text_field( $response['site']['id'] );
			$settings['site_token']            = sanitize_text_field( (string) ( $response['site_token'] ?? '' ) );
			$settings['public_site_key']       = sanitize_text_field( (string) ( $response['public_site_key'] ?? '' ) );
			$settings['connection_status']     = 'connected';
			$settings['connection_validated_at'] = current_time( 'mysql', true );
			$settings['last_backend_error']    = '';
			$settings                          = $this->settings->update_settings( $settings );
		}

		return new WP_REST_Response(
			array(
				'site'     => $response['site'],
				'settings' => $settings,
			)
		);
	}

	/**
	 * Validate connectivity.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function test_connection() {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['backend_url'] ) || empty( $settings['site_token'] ) ) {
			return new WP_Error( 'nastroje_ai_missing_credentials', __( 'Backend URL and site token are required.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$response = $this->backend_request( '/api/sites/validate', 'POST', array() );

		if ( is_wp_error( $response ) ) {
			$settings['connection_status']     = 'error';
			$settings['last_backend_error']    = $response->get_error_message();
			$settings['connection_validated_at'] = current_time( 'mysql', true );
			$this->settings->update_settings( $settings );

			return $response;
		}

		$settings['connection_status']     = 'connected';
		$settings['connection_validated_at'] = current_time( 'mysql', true );
		$settings['last_backend_error']    = '';
		$this->settings->update_settings( $settings );

		return new WP_REST_Response(
			array(
				'status' => 'connected',
				'site'   => $response['site'] ?? null,
			)
		);
	}

	/**
	 * Build the dashboard response.
	 *
	 * @return WP_REST_Response
	 */
	public function get_dashboard() : WP_REST_Response {
		$settings    = $this->settings->get_settings();
		$sync_state  = $this->sync->get_state();
		$remote_data = array();

		if ( ! empty( $settings['backend_url'] ) && ! empty( $settings['site_token'] ) ) {
			$dashboard = $this->backend_request( '/api/dashboard/summary', 'GET', array() );
			if ( ! is_wp_error( $dashboard ) ) {
				$remote_data = $dashboard;
			}
		}

		return new WP_REST_Response(
			array(
				'connectionStatus' => $settings['connection_status'],
				'siteStatus'       => $remote_data['site']['status'] ?? 'not_registered',
				'siteId'           => $settings['site_id'],
				'widgetEnabled'    => (bool) $settings['widget_enabled'],
				'lastSyncAt'       => $sync_state['last_sync_at'],
				'stats'            => array(
					'totalDocuments'     => (int) ( $remote_data['stats']['totalDocuments'] ?? 0 ),
					'totalConversations' => (int) ( $remote_data['stats']['totalConversations'] ?? 0 ),
					'totalMessages'      => (int) ( $remote_data['stats']['totalMessages'] ?? 0 ),
					'totalLeads'         => (int) ( $remote_data['stats']['totalLeads'] ?? 0 ),
				),
				'recentLeads'       => array_values( (array) ( $remote_data['recentLeads'] ?? array() ) ),
				'syncState'        => $sync_state,
				'logs'             => $sync_state['logs'],
			)
		);
	}

	/**
	 * Proxy analytics summary to backend.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_analytics() {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['backend_url'] ) || empty( $settings['site_token'] ) ) {
			return new WP_Error( 'nastroje_ai_missing_credentials', __( 'Backend URL and site token are required.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$response = $this->backend_request( '/api/dashboard/analytics', 'GET', array() );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Run manual sync from admin.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function run_sync( WP_REST_Request $request ) {
		$types  = array_map( 'sanitize_key', (array) $request->get_param( 'types' ) );
		$result = $this->sync->sync_content( $types );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return new WP_REST_Response( $result );
	}

	/**
	 * Proxy conversation list to backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_conversations( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( 50, max( 1, (int) ( $request->get_param( 'per_page' ) ?? 30 ) ) );
		$response = $this->backend_request(
			sprintf( '/api/chat/conversations?page=%1$d&per_page=%2$d', $page, $per_page ),
			'GET',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Proxy a single conversation fetch.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_conversation( WP_REST_Request $request ) {
		$conversation_id = sanitize_text_field( (string) $request['conversation_id'] );
		$response        = $this->backend_request(
			'/api/chat/conversations/' . rawurlencode( $conversation_id ),
			'GET',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Delete single conversation via backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_conversation( WP_REST_Request $request ) {
		$conversation_id = sanitize_text_field( (string) $request['conversation_id'] );
		$response        = $this->backend_request(
			'/api/chat/conversations/' . rawurlencode( $conversation_id ),
			'DELETE',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Proxy lead submission list to backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_lead_submissions( WP_REST_Request $request ) {
		$page_param     = $request->get_param( 'page' );
		$per_page_param = $request->get_param( 'per_page' );
		$page           = max( 1, null === $page_param ? 1 : (int) $page_param );
		$per_page       = min( 50, max( 1, null === $per_page_param ? 10 : (int) $per_page_param ) );
		$response = $this->backend_request(
			sprintf( '/api/leads/submissions?page=%1$d&per_page=%2$d', $page, $per_page ),
			'GET',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Proxy single lead submission fetch.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_lead_submission( WP_REST_Request $request ) {
		$submission_id = sanitize_text_field( (string) $request['submission_id'] );
		$response      = $this->backend_request(
			'/api/leads/submissions/' . rawurlencode( $submission_id ),
			'GET',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Delete single lead submission via backend.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_lead_submission( WP_REST_Request $request ) {
		$submission_id = sanitize_text_field( (string) $request['submission_id'] );
		$response      = $this->backend_request(
			'/api/leads/submissions/' . rawurlencode( $submission_id ),
			'DELETE',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Public chat endpoint. The frontend never sees the backend token.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function chat_message( WP_REST_Request $request ) {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['backend_url'] ) || empty( $settings['site_token'] ) ) {
			return new WP_Error( 'nastroje_ai_not_ready', __( 'The assistant is not configured yet.', 'nastroje-ai-assistant' ), array( 'status' => 503 ) );
		}

		$message = sanitize_textarea_field( (string) $request->get_param( 'message' ) );

		if ( '' === $message ) {
			return new WP_Error( 'nastroje_ai_empty_message', __( 'Message cannot be empty.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		if ( mb_strlen( $message ) > self::MAX_CHAT_MESSAGE_LENGTH ) {
			return new WP_Error( 'nastroje_ai_message_too_long', __( 'Message is too long. Please shorten it and try again.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$response = $this->backend_request(
			'/api/chat/message',
			'POST',
			array(
				'conversation_id' => sanitize_text_field( (string) $request->get_param( 'conversation_id' ) ),
				'session_id'      => sanitize_text_field( (string) $request->get_param( 'session_id' ) ),
				'message'         => $message,
				'language'        => $settings['language'],
				'tone'            => $settings['tone'],
				'assistant_name'  => $settings['assistant_name'],
				'source_page_url' => esc_url_raw( (string) $request->get_param( 'source_page_url' ) ),
				'user_identifier' => sanitize_text_field( (string) $request->get_param( 'user_identifier' ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Public conversation restore endpoint for same-session widget navigation.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_public_conversation( WP_REST_Request $request ) {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['backend_url'] ) || empty( $settings['site_token'] ) ) {
			return new WP_Error( 'nastroje_ai_not_ready', __( 'The assistant is not configured yet.', 'nastroje-ai-assistant' ), array( 'status' => 503 ) );
		}

		$conversation_id = sanitize_text_field( (string) $request->get_param( 'conversation_id' ) );
		$session_id      = sanitize_text_field( (string) $request->get_param( 'session_id' ) );

		if ( '' === $conversation_id || '' === $session_id || mb_strlen( $conversation_id ) > 80 || mb_strlen( $session_id ) > 120 ) {
			return new WP_Error( 'nastroje_ai_invalid_conversation_restore', __( 'Conversation cannot be restored.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$response = $this->backend_request(
			'/api/chat/conversations/' . rawurlencode( $conversation_id ),
			'GET',
			array()
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'nastroje_ai_conversation_restore_failed', __( 'Conversation cannot be restored.', 'nastroje-ai-assistant' ), array( 'status' => 404 ) );
		}

		$conversation = isset( $response['conversation'] ) && is_array( $response['conversation'] ) ? $response['conversation'] : array();

		if ( ! hash_equals( (string) ( $conversation['session_id'] ?? '' ), $session_id ) || 'chat' !== (string) ( $conversation['mode'] ?? 'chat' ) ) {
			return new WP_Error( 'nastroje_ai_conversation_restore_denied', __( 'Conversation cannot be restored.', 'nastroje-ai-assistant' ), array( 'status' => 404 ) );
		}

		return new WP_REST_Response(
			array(
				'conversation_id' => (string) ( $conversation['id'] ?? $conversation_id ),
				'session_id'      => $session_id,
				'messages'        => $this->prepare_public_conversation_messages( (array) ( $response['messages'] ?? array() ) ),
			)
		);
	}

	/**
	 * Prepare safe message fields for the public widget.
	 *
	 * @param array<int,mixed> $messages Raw backend messages.
	 * @return array<int,array<string,mixed>>
	 */
	private function prepare_public_conversation_messages( array $messages ) : array {
		$prepared = array();

		foreach ( array_slice( $messages, -60 ) as $message ) {
			if ( ! is_array( $message ) ) {
				continue;
			}

			$role = (string) ( $message['role'] ?? '' );
			if ( ! in_array( $role, array( 'assistant', 'user' ), true ) ) {
				continue;
			}

			$content = trim( mb_substr( (string) ( $message['content'] ?? '' ), 0, 2500 ) );
			if ( '' === $content ) {
				continue;
			}

			$prepared_message = array(
				'role'    => $role,
				'content' => $content,
				'sources' => array(),
			);

			$metadata = isset( $message['metadata'] ) && is_array( $message['metadata'] ) ? $message['metadata'] : array();
			if ( 'assistant' === $role && isset( $metadata['sources'] ) && is_array( $metadata['sources'] ) ) {
				foreach ( array_slice( $metadata['sources'], 0, 5 ) as $source ) {
					if ( ! is_array( $source ) ) {
						continue;
					}

					$url = esc_url_raw( (string) ( $source['url'] ?? '' ) );
					if ( '' === $url ) {
						continue;
					}

					$prepared_message['sources'][] = array(
						'url'   => $url,
						'title' => sanitize_text_field( (string) ( $source['title'] ?? '' ) ),
					);
				}
			}

			$prepared[] = $prepared_message;
		}

		return $prepared;
	}

	/**
	 * Public brief / lead submission proxy.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function submit_lead( WP_REST_Request $request ) {
		$settings = $this->settings->get_settings();

		if ( empty( $settings['backend_url'] ) || empty( $settings['site_token'] ) ) {
			return new WP_Error( 'nastroje_ai_not_ready', __( 'The assistant is not configured yet.', 'nastroje-ai-assistant' ), array( 'status' => 503 ) );
		}

		$answers = array();

		foreach ( array_slice( (array) $request->get_param( 'answers' ), 0, self::MAX_LEAD_ANSWERS ) as $answer ) {
			if ( ! is_array( $answer ) ) {
				continue;
			}

			$value = sanitize_textarea_field( (string) ( $answer['value'] ?? '' ) );
			if ( '' === $value ) {
				continue;
			}

			if ( mb_strlen( $value ) > self::MAX_LEAD_ANSWER_LENGTH ) {
				return new WP_Error( 'nastroje_ai_lead_answer_too_long', __( 'One of the answers is too long. Please shorten it and try again.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
			}

			$answers[] = array(
				'field_id' => sanitize_key( (string) ( $answer['field_id'] ?? '' ) ),
				'label'    => sanitize_text_field( (string) ( $answer['label'] ?? '' ) ),
				'value'    => $value,
			);
		}

		if ( empty( $answers ) ) {
			return new WP_Error( 'nastroje_ai_empty_lead', __( 'At least one lead answer is required.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$response = $this->backend_request(
			'/api/leads/submit',
			'POST',
			array(
				'session_id'      => sanitize_text_field( (string) $request->get_param( 'session_id' ) ),
				'conversation_id' => sanitize_text_field( (string) $request->get_param( 'conversation_id' ) ),
				'source_page_url' => esc_url_raw( (string) $request->get_param( 'source_page_url' ) ),
				'answers'         => $answers,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return new WP_REST_Response( $response );
	}

	/**
	 * Send sync batch to backend.
	 *
	 * @param array<string,mixed> $payload Sync payload.
	 * @return array<string,mixed>|WP_Error
	 */
	public function send_sync_batch( array $payload ) {
		return $this->backend_request( '/api/sync/batch', 'POST', $payload );
	}

	/**
	 * Perform an authenticated or unauthenticated backend request.
	 *
	 * @param string               $path Relative backend path.
	 * @param string               $method HTTP method.
	 * @param array<string,mixed>  $payload Payload.
	 * @param bool                 $with_auth Whether to send site token.
	 * @return array<string,mixed>|WP_Error
	 */
	public function backend_request( string $path, string $method = 'POST', array $payload = array(), bool $with_auth = true ) {
		$settings    = $this->settings->get_settings();
		$backend_url = untrailingslashit( (string) $settings['backend_url'] );

		if ( '' === $backend_url ) {
			return new WP_Error( 'nastroje_ai_missing_backend_url', __( 'Backend URL is missing.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
		}

		$url     = $backend_url . $path;
		$headers = array(
			'Accept'           => 'application/json',
			'Content-Type'     => 'application/json',
			'X-Plugin-Version' => NASTROJE_AI_VERSION,
			'X-WP-URL'         => home_url(),
		);

		if ( $with_auth ) {
			if ( empty( $settings['site_token'] ) ) {
				return new WP_Error( 'nastroje_ai_missing_site_token', __( 'The site token is missing.', 'nastroje-ai-assistant' ), array( 'status' => 400 ) );
			}

			$headers['X-Site-Token'] = (string) $settings['site_token'];
		}

		$args = array(
			'method'  => strtoupper( $method ),
			'timeout' => 65,
			'headers' => $headers,
		);

		if ( 'GET' !== strtoupper( $method ) ) {
			$args['body'] = wp_json_encode( $payload );
		}

		$response = wp_remote_request( $url, $args );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = (string) wp_remote_retrieve_body( $response );
		$data        = json_decode( $body, true );

		if ( $status_code < 200 || $status_code >= 300 ) {
			$message = is_array( $data ) && ! empty( $data['error'] ) ? (string) $data['error'] : __( 'Backend request failed.', 'nastroje-ai-assistant' );
			return new WP_Error( 'nastroje_ai_backend_error', $message, array( 'status' => $status_code, 'response' => $data ) );
		}

		return is_array( $data ) ? $data : array();
	}

	/**
	 * Convert WordPress settings to backend site_settings payload.
	 *
	 * @param array<string,mixed> $settings Local settings.
	 * @return array<string,mixed>
	 */
	private function build_site_settings_payload( array $settings ) : array {
		return array(
			'assistant_name'    => (string) $settings['assistant_name'],
			'welcome_message'   => (string) $settings['welcome_message'],
			'tone'              => (string) $settings['tone'],
			'theme'             => (string) $settings['theme'],
			'widget_enabled'    => (bool) $settings['widget_enabled'],
			'shortcode_enabled' => (bool) $settings['shortcode_enabled'],
			'lead_capture_enabled' => (bool) $settings['lead_capture_enabled'],
			'lead_flow_config'  => array(
				'form_name'       => (string) $settings['lead_form_name'],
				'intro_message'   => (string) $settings['lead_intro_message'],
				'success_message' => (string) $settings['lead_success_message'],
				'cta_label'       => (string) $settings['lead_cta_label'],
				'questions'       => array_values( (array) $settings['lead_questions'] ),
			),
			'language'          => (string) $settings['language'],
			'sync_config'       => array(
				'allowed_post_types'           => array_values( (array) $settings['allowed_post_types'] ),
				'include_woocommerce_products' => (bool) $settings['include_woocommerce_products'],
				'sync_frequency'               => (string) $settings['sync_frequency'],
				'privacy_notice'               => (string) $settings['privacy_notice'],
			),
		);
	}
}
