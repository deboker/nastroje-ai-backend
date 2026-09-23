<?php
/**
 * Content sync service.
 *
 * @package Nastroje_AI_Assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Nastroje_AI_Sync {
	public const STATE_OPTION = 'nastroje_ai_sync_state';

	/**
	 * Settings service.
	 *
	 * @var Nastroje_AI_Settings
	 */
	private Nastroje_AI_Settings $settings;

	/**
	 * API proxy.
	 *
	 * @var Nastroje_AI_API|null
	 */
	private ?Nastroje_AI_API $api = null;

	/**
	 * Constructor.
	 *
	 * @param Nastroje_AI_Settings $settings Settings service.
	 */
	public function __construct( Nastroje_AI_Settings $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Attach API service after construction.
	 *
	 * @param Nastroje_AI_API $api API service.
	 * @return void
	 */
	public function set_api( Nastroje_AI_API $api ) : void {
		$this->api = $api;
	}

	/**
	 * Trigger a manual sync.
	 *
	 * @param array<int,string> $requested_types Optional requested sync types.
	 * @return array<string,mixed>|WP_Error
	 */
	public function sync_content( array $requested_types = array() ) {
		if ( null === $this->api ) {
			return new WP_Error( 'nastroje_ai_sync_unavailable', __( 'Sync API is not available.', 'nastroje-ai-assistant' ) );
		}

		$state            = $this->get_state();
		$sync_started_at  = current_time( 'mysql', true );
		$types_to_process = $this->normalize_requested_types( $requested_types );
		$documents        = $this->collect_documents( $types_to_process );
		$items_processed  = 0;

		$this->update_state(
			array(
				'last_sync_status' => 'running',
			)
		);

		foreach ( array_chunk( $documents, 25 ) as $batch ) {
			$response = $this->api->send_sync_batch(
				array(
					'sync_type' => 'manual',
					'documents' => $batch,
				)
			);

			if ( is_wp_error( $response ) ) {
				$this->append_log(
					array(
						'sync_type'       => 'manual',
						'status'          => 'error',
						'items_processed' => $items_processed,
						'started_at'      => $sync_started_at,
						'finished_at'     => current_time( 'mysql', true ),
						'error_message'   => $response->get_error_message(),
					)
				);

				$this->update_state(
					array(
						'last_sync_status' => 'error',
					)
				);

				return $response;
			}

			$items_processed += count( $batch );
		}

		$finished_at = current_time( 'mysql', true );

		$this->append_log(
			array(
				'sync_type'       => 'manual',
				'status'          => 'success',
				'items_processed' => $items_processed,
				'started_at'      => $sync_started_at,
				'finished_at'     => $finished_at,
				'error_message'   => '',
			)
		);

		$state['last_sync_at']      = $finished_at;
		$state['last_sync_status']  = 'success';
		$state['last_items_synced'] = $items_processed;
		update_option( self::STATE_OPTION, $state );

		return array(
			'status'          => 'success',
			'items_processed' => $items_processed,
			'types'           => $types_to_process,
			'last_sync_at'    => $finished_at,
		);
	}

	/**
	 * Normalize requested sync targets.
	 *
	 * @param array<int,string> $requested_types Requested types.
	 * @return array<int,string>
	 */
	public function normalize_requested_types( array $requested_types ) : array {
		$settings         = $this->settings->get_settings();
		$allowed_post_set = (array) $settings['allowed_post_types'];
		$types            = array();

		foreach ( $requested_types as $requested_type ) {
			$requested_type = sanitize_key( (string) $requested_type );
			if ( in_array( $requested_type, $allowed_post_set, true ) || in_array( $requested_type, array( 'category', 'product' ), true ) ) {
				$types[] = $requested_type;
			}
		}

		if ( empty( $types ) ) {
			$types = $allowed_post_set;
			$types[] = 'category';

			if ( ! empty( $settings['include_woocommerce_products'] ) && class_exists( 'WooCommerce' ) ) {
				$types[] = 'product';
			}
		}

		return array_values( array_unique( array_filter( $types ) ) );
	}

	/**
	 * Build a list of documents to sync.
	 *
	 * @param array<int,string> $types Types to collect.
	 * @return array<int,array<string,mixed>>
	 */
	public function collect_documents( array $types ) : array {
		$documents  = array();
		$post_types = array();

		foreach ( $types as $type ) {
			if ( 'category' === $type ) {
				$documents = array_merge( $documents, $this->collect_category_documents() );
				continue;
			}

			if ( 'product' === $type ) {
				if ( class_exists( 'WooCommerce' ) ) {
					$post_types[] = 'product';
				}
				continue;
			}

			$post_types[] = $type;
		}

		if ( ! empty( $post_types ) ) {
			$documents = array_merge( $documents, $this->collect_post_documents( array_unique( $post_types ) ) );
		}

		return $documents;
	}

	/**
	 * Collect supported post types.
	 *
	 * @param array<int,string> $post_types Post types to query.
	 * @return array<int,array<string,mixed>>
	 */
	private function collect_post_documents( array $post_types ) : array {
		$documents = array();
		$query     = new WP_Query(
			array(
				'post_type'              => $post_types,
				'post_status'            => array( 'publish' ),
				'posts_per_page'         => -1,
				'orderby'                => 'modified',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'ignore_sticky_posts'    => true,
				'update_post_term_cache' => true,
			)
		);

		foreach ( $query->posts as $post ) {
			$document = $this->build_document_from_post( $post );
			if ( ! empty( $document ) ) {
				$documents[] = $document;
			}
		}

		wp_reset_postdata();

		return $documents;
	}

	/**
	 * Convert a WP post into backend payload.
	 *
	 * @param WP_Post $post Post object.
	 * @return array<string,mixed>
	 */
	private function build_document_from_post( WP_Post $post ) : array {
		$post_type     = get_post_type( $post );
		$raw_content   = (string) $post->post_content;
		$rendered_content = $this->render_content_for_sync( $post );
		$public_meta      = $this->get_public_meta_payload( (int) $post->ID );
		$extra_segments   = array();
		$excerpt_source   = $rendered_content ?: $raw_content;
		$excerpt          = has_excerpt( $post ) ? $post->post_excerpt : wp_trim_words( wp_strip_all_tags( $excerpt_source ), 40 );

		if ( ! empty( $rendered_content ) ) {
			$extra_segments[] = $this->clean_content( $rendered_content );
		}

		$public_meta_text = $this->flatten_sync_payload_to_text( $public_meta );
		if ( '' !== $public_meta_text ) {
			$extra_segments[] = $public_meta_text;
		}

		$metadata      = array(
			'post_type'       => $post_type,
			'status'          => $post->post_status,
			'terms'           => $this->get_post_terms_payload( $post ),
			'featured_image'  => get_the_post_thumbnail_url( $post, 'large' ) ?: '',
			'author'          => get_the_author_meta( 'display_name', (int) $post->post_author ),
			'modified_gmt'    => get_post_modified_time( 'c', true, $post ),
			'public_meta'     => $public_meta,
		);

		if ( 'product' === $post_type && class_exists( 'WooCommerce' ) ) {
			$metadata['product'] = $this->get_product_metadata( (int) $post->ID );
			$product_text        = $this->flatten_sync_payload_to_text( $metadata['product'] );

			if ( '' !== $product_text ) {
				$extra_segments[] = $product_text;
			}
		}

		$content_clean          = $this->merge_content_segments(
			array_merge(
				array(
					$this->clean_content( $raw_content ),
				),
				$extra_segments
			)
		);
		$metadata['word_count'] = str_word_count( wp_strip_all_tags( $content_clean ) );

		return array(
			'wp_object_id' => (int) $post->ID,
			'type'         => $post_type,
			'title'        => get_the_title( $post ),
			'slug'         => $post->post_name,
			'url'          => get_permalink( $post ),
			'excerpt'      => wp_strip_all_tags( $excerpt ),
			'content_raw'  => $raw_content,
			'content_clean'=> $content_clean,
			'status'       => $post->post_status,
			'updated_at'   => get_post_modified_time( 'c', true, $post ),
			'metadata'     => $metadata,
		);
	}

	/**
	 * Render content through blocks and shortcodes so visible homepage sections are indexed.
	 *
	 * @param WP_Post $post Post object.
	 * @return string
	 */
	private function render_content_for_sync( WP_Post $post ) : string {
		$content = (string) $post->post_content;

		if ( '' === trim( $content ) ) {
			return '';
		}

		$rendered = $content;

		if ( function_exists( 'do_blocks' ) ) {
			$rendered = do_blocks( $rendered );
		}

		if ( function_exists( 'do_shortcode' ) ) {
			$rendered = do_shortcode( $rendered );
		}

		return is_string( $rendered ) ? $rendered : '';
	}

	/**
	 * Collect category and WooCommerce term documents.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private function collect_category_documents() : array {
		$documents  = array();
		$taxonomies = array( 'category' );

		if ( class_exists( 'WooCommerce' ) ) {
			$taxonomies[] = 'product_cat';
		}

		foreach ( $taxonomies as $taxonomy ) {
			$terms = get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => false,
				)
			);

			if ( is_wp_error( $terms ) ) {
				continue;
			}

			foreach ( $terms as $term ) {
				$documents[] = array(
					'wp_object_id' => (int) $term->term_id,
					'type'         => $taxonomy,
					'title'        => $term->name,
					'slug'         => $term->slug,
					'url'          => get_term_link( $term ) instanceof WP_Error ? '' : get_term_link( $term ),
					'excerpt'      => wp_strip_all_tags( $term->description ),
					'content_raw'  => $term->description,
					'content_clean'=> $this->clean_content( $term->description ),
					'status'       => 'publish',
					'updated_at'   => current_time( 'c', true ),
					'metadata'     => array(
						'taxonomy' => $taxonomy,
						'count'    => (int) $term->count,
						'parent'   => (int) $term->parent,
					),
				);
			}
		}

		return $documents;
	}

	/**
	 * Normalize post content for indexing.
	 *
	 * @param string $content Raw content.
	 * @return string
	 */
	private function clean_content( string $content ) : string {
		$normalized = strip_shortcodes( $content );
		$normalized = preg_replace( '/<(\/?(p|div|br|li|h[1-6]|section|article|ul|ol))[^>]*>/i', "\n", $normalized );
		$normalized = wp_kses( $normalized, array() );
		$normalized = html_entity_decode( $normalized, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$normalized = preg_replace( "/[\r\n\t]+/", "\n", $normalized );
		$normalized = preg_replace( "/[ \f\v]+/", ' ', $normalized );
		$normalized = preg_replace( "/\n{3,}/", "\n\n", $normalized );

		return trim( (string) $normalized );
	}

	/**
	 * Merge multiple normalized content segments without storing the same text twice.
	 *
	 * @param array<int,string> $segments Content segments.
	 * @return string
	 */
	private function merge_content_segments( array $segments ) : string {
		$unique_segments = array();

		foreach ( $segments as $segment ) {
			$segment = trim( (string) $segment );
			if ( '' === $segment ) {
				continue;
			}

			if ( in_array( $segment, $unique_segments, true ) ) {
				continue;
			}

			$unique_segments[] = $segment;
		}

		return implode( "\n\n", $unique_segments );
	}

	/**
	 * Collect safe public meta values for indexing.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string,mixed>
	 */
	private function get_public_meta_payload( int $post_id ) : array {
		$post_type    = (string) get_post_type( $post_id );
		/**
		 * Allow public post meta keys to be synced for a specific post type.
		 *
		 * @param array<int,string> $allowed_keys Public meta keys. Empty by default.
		 * @param string            $post_type    Post type.
		 * @param int               $post_id      Post ID.
		 */
		$allowed_keys = apply_filters( 'nastroje_ai_allowed_sync_meta_keys', array(), $post_type, $post_id );
		$payload      = array();

		foreach ( (array) $allowed_keys as $key ) {
			$key = sanitize_key( (string) $key );

			if ( '' === $key || str_starts_with( $key, '_' ) || $this->looks_sensitive_meta_key( $key ) ) {
				continue;
			}

			$normalized_values = array();

			foreach ( (array) get_post_meta( $post_id, $key, false ) as $value ) {
				$normalized_value = $this->normalize_meta_value( maybe_unserialize( $value ) );

				if ( '' === $normalized_value || array() === $normalized_value ) {
					continue;
				}

				$normalized_values[] = $normalized_value;
			}

			if ( empty( $normalized_values ) ) {
				continue;
			}

			$payload[ $key ] = 1 === count( $normalized_values ) ? $normalized_values[0] : $normalized_values;
		}

		return $payload;
	}

	/**
	 * Normalize a meta value for safe storage and indexing.
	 *
	 * @param mixed $value Meta value.
	 * @return mixed
	 */
	private function normalize_meta_value( $value ) {
		if ( is_array( $value ) ) {
			$normalized = array();

			foreach ( $value as $item_key => $item_value ) {
				$item = $this->normalize_meta_value( $item_value );
				if ( '' === $item || array() === $item ) {
					continue;
				}

				$normalized[ $item_key ] = $item;
			}

			return $normalized;
		}

		if ( is_bool( $value ) ) {
			return $value ? 'yes' : 'no';
		}

		if ( is_numeric( $value ) ) {
			return (string) $value;
		}

		if ( is_string( $value ) ) {
			$cleaned = $this->clean_content( $value );
			return trim( $cleaned );
		}

		return '';
	}

	/**
	 * Flatten nested payload arrays into plain text lines for retrieval.
	 *
	 * @param mixed  $value  Value to flatten.
	 * @param string $prefix Optional field label.
	 * @return string
	 */
	private function flatten_sync_payload_to_text( $value, string $prefix = '' ) : string {
		$lines = array();

		if ( is_array( $value ) ) {
			foreach ( $value as $item_key => $item_value ) {
				$label = $prefix;
				if ( is_string( $item_key ) && '' !== $item_key ) {
					$label = trim( $prefix . ' ' . $this->humanize_sync_key( $item_key ) );
				}

				$nested_text = $this->flatten_sync_payload_to_text( $item_value, $label );
				if ( '' !== $nested_text ) {
					$lines[] = $nested_text;
				}
			}

			return implode( "\n", $lines );
		}

		$text = trim( (string) $value );
		if ( '' === $text ) {
			return '';
		}

		return '' !== $prefix ? $prefix . ': ' . $text : $text;
	}

	/**
	 * Convert a meta key to a human-readable label.
	 *
	 * @param string $key Meta key.
	 * @return string
	 */
	private function humanize_sync_key( string $key ) : string {
		$key = preg_replace( '/[_-]+/', ' ', $key );
		return ucwords( trim( (string) $key ) );
	}

	/**
	 * Block sensitive-looking meta keys even when explicitly allowlisted.
	 *
	 * @param string $key Meta key.
	 * @return bool
	 */
	private function looks_sensitive_meta_key( string $key ) : bool {
		$sensitive_fragments = array(
			'token',
			'secret',
			'api_key',
			'password',
			'pass',
			'auth',
			'session',
			'email',
			'phone',
			'customer',
			'crm',
			'billing',
			'shipping',
		);

		foreach ( $sensitive_fragments as $sensitive_fragment ) {
			if ( str_contains( $key, $sensitive_fragment ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Build a term payload for a post.
	 *
	 * @param WP_Post $post Post object.
	 * @return array<string,array<int,array<string,mixed>>>
	 */
	private function get_post_terms_payload( WP_Post $post ) : array {
		$taxonomies = get_object_taxonomies( $post->post_type );
		$payload    = array();

		foreach ( $taxonomies as $taxonomy ) {
			$terms = get_the_terms( $post, $taxonomy );
			if ( empty( $terms ) || is_wp_error( $terms ) ) {
				continue;
			}

			$payload[ $taxonomy ] = array();

			foreach ( $terms as $term ) {
				$payload[ $taxonomy ][] = array(
					'id'   => (int) $term->term_id,
					'name' => $term->name,
					'slug' => $term->slug,
				);
			}
		}

		return $payload;
	}

	/**
	 * Build safe product metadata.
	 *
	 * @param int $post_id Product post ID.
	 * @return array<string,mixed>
	 */
	private function get_product_metadata( int $post_id ) : array {
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $post_id ) : null;

		if ( ! $product ) {
			return array();
		}

		$attributes = array();

		foreach ( $product->get_attributes() as $attribute ) {
			$attributes[] = array(
				'name'    => $attribute->get_name(),
				'options' => array_values( $attribute->get_options() ),
				'visible' => $attribute->get_visible(),
			);
		}

		return array(
			'price'             => $product->get_price(),
			'sku'               => $product->get_sku(),
			'short_description' => $this->clean_content( $product->get_short_description() ),
			'attributes'        => $attributes,
			'stock_status'      => $product->get_stock_status(),
		);
	}

	/**
	 * Read sync state.
	 *
	 * @return array<string,mixed>
	 */
	public function get_state() : array {
		return wp_parse_args(
			(array) get_option( self::STATE_OPTION, array() ),
			array(
				'last_sync_at'      => '',
				'last_sync_status'  => 'idle',
				'last_items_synced' => 0,
				'logs'              => array(),
			)
		);
	}

	/**
	 * Update sync state.
	 *
	 * @param array<string,mixed> $changes State changes.
	 * @return array<string,mixed>
	 */
	public function update_state( array $changes ) : array {
		$state = array_merge( $this->get_state(), $changes );
		update_option( self::STATE_OPTION, $state );

		return $state;
	}

	/**
	 * Append a sync log entry.
	 *
	 * @param array<string,mixed> $entry Log entry.
	 * @return void
	 */
	public function append_log( array $entry ) : void {
		$state         = $this->get_state();
		$logs          = (array) $state['logs'];
		$logs[]        = $entry;
		$state['logs'] = array_slice( array_reverse( $logs ), 0, 20 );
		update_option( self::STATE_OPTION, $state );
	}
}
