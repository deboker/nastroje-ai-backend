=== Nastroje AI Assistant for WordPress ===
Contributors: nastroje
Requires at least: 6.2
Tested up to: 6.5
Requires PHP: 8.0
Stable tag: 0.1.16
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Modern AI assistant and conversational brief / lead capture plugin for WordPress with an external Supabase-backed backend.

== Description ==

Nastroje AI Assistant adds:

* a frontend AI chat widget
* a conversational brief / lead capture flow
* a React-based admin dashboard
* secure backend proxying
* content sync for posts, pages, products, and categories
* shortcode and floating widget support

== Installation ==

1. Upload the plugin ZIP in `Plugins > Add New > Upload Plugin`.
2. Activate `Nastroje AI Assistant for WordPress`.
3. Open `AI Assistant` in the WordPress admin sidebar.
4. Set the backend URL and register the site or paste the issued site token.
5. Run a manual content sync.
6. Add `[ai_assistant_chat]` to a page or enable the floating widget.

== Changelog ==

= 0.1.16 =
* Show the latest 30 conversations in admin and fix the missing page-size default that returned only one conversation.

= 0.1.8 =
* Added conversation deletion in admin and improved conversation grouping for new chats after inactivity.

= 0.1.7 =
* Fixed admin conversation proxy routes so site conversations and messages load correctly.

= 0.1.6 =
* Added analytics admin page for the last 30 days and recent lead preview on dashboard.
* Added site-specific lead list/detail improvements in the admin.

= 0.1.5 =
* Added lead inbox improvements with auto-selected newest submission and delete action.

= 0.1.4 =
* Added brief shortcut action from chat replies and refreshed widget asset versioning.
* Improved chat loading copy in Slovak.

= 0.1.3 =
* Added auto-detected widget icon support for the chat bubble and popup header.

= 0.1.2 =
* Added widget UI design controls for colors and border radius in admin settings.

= 0.1.1 =
* Improved retrieval relevance for chat answers.
* Improved mock chat replies for greetings, recommendations, and contact questions.
* Updated widget source links to open in the same tab.

= 0.1.0 =
* Initial MVP scaffold.
