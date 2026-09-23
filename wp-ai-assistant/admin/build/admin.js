(function () {
  if (!window.wp || !window.wp.element || !window.NastrojeAIAdmin) {
    return;
  }

  var adminData = window.NastrojeAIAdmin;
  var element = window.wp.element;
  var apiFetch = window.wp.apiFetch;
  var h = element.createElement;
  var useEffect = element.useEffect;
  var useState = element.useState;

  if (apiFetch && apiFetch.createNonceMiddleware) {
    apiFetch.use(apiFetch.createNonceMiddleware(adminData.nonce));
  }

  function request(path, options) {
    return apiFetch(
      Object.assign(
        {
          url: adminData.restBase + path,
        },
        options || {}
      )
    );
  }

  function linkButton(label, href) {
    return h(
      "a",
      {
        className: "button button-secondary",
        href: href,
      },
      label
    );
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toLocaleString("sk-SK");
    } catch (error) {
      return value;
    }
  }

  function compactText(value, limit) {
    if (!value) {
      return "";
    }

    var text = String(value);
    if (text.length <= (limit || 160)) {
      return text;
    }

    return text.slice(0, (limit || 160) - 1) + "…";
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function StatusBadge(props) {
    return h(
      "span",
      {
        className: "nastroje-badge nastroje-badge--" + (props.status || "neutral"),
      },
      props.label
    );
  }

  function Notice(props) {
    if (!props.message) {
      return null;
    }

    return h(
      "div",
      {
        className: "nastroje-notice nastroje-notice--" + (props.variant || "info"),
      },
      props.message
    );
  }

  function StatCard(props) {
    return h(
      "article",
      { className: "nastroje-stat-card" },
      h("span", null, props.label),
      h("strong", null, props.value),
      props.hint ? h("small", null, props.hint) : null
    );
  }

  function SectionCard(props) {
    return h(
      "section",
      { className: "nastroje-card" },
      h(
        "header",
        { className: "nastroje-card__header" },
        h(
          "div",
          null,
          h("h2", null, props.title),
          props.description ? h("p", null, props.description) : null
        ),
        props.actions ? h("div", { className: "nastroje-card__actions" }, props.actions) : null
      ),
      props.children
    );
  }

  function DashboardPage(props) {
    var dashboard = props.dashboard || {};
    var stats = dashboard.stats || {};
    var recentLeads = dashboard.recentLeads || [];
    return h(
      "div",
      { className: "nastroje-stack" },
      h(
        SectionCard,
        {
          title: "Dashboard",
          description: "Connection health, sync readiness, and quick actions.",
          actions: [
            h(
              "button",
              {
                key: "register",
                className: "button button-secondary",
                onClick: props.onRegisterSite,
                disabled: props.loading,
              },
              "Register site"
            ),
            h(
              "button",
              {
                key: "test",
                className: "button button-secondary",
                onClick: props.onTestConnection,
                disabled: props.loading,
              },
              "Test connection"
            ),
            h(
              "button",
              {
                key: "sync",
                className: "button button-primary",
                onClick: props.onRunSync,
                disabled: props.loading,
              },
              "Sync now"
            ),
          ],
        },
        h(
          "div",
          { className: "nastroje-stats-grid" },
          h(StatCard, { label: "Connection", value: dashboard.connectionStatus || "not_configured" }),
          h(StatCard, { label: "Site status", value: dashboard.siteStatus || "not_registered" }),
          h(StatCard, { label: "Documents", value: stats.totalDocuments || 0 }),
          h(StatCard, { label: "Conversations", value: stats.totalConversations || 0 }),
          h(StatCard, { label: "Leads", value: stats.totalLeads || 0 }),
          h(StatCard, { label: "Messages", value: stats.totalMessages || 0 }),
          h(StatCard, { label: "Last sync", value: dashboard.lastSyncAt || "Never" })
        )
      ),
      h(
        SectionCard,
        {
          title: "Status Summary",
          description: "WordPress and backend state for this site instance.",
        },
        h(
          "div",
          { className: "nastroje-summary-grid" },
          h(
            "div",
            { className: "nastroje-summary-item" },
            h("span", null, "WordPress site"),
            h("strong", null, adminData.siteName),
            h("small", null, adminData.siteUrl)
          ),
          h(
            "div",
            { className: "nastroje-summary-item" },
            h("span", null, "Site ID"),
            h("strong", null, dashboard.siteId || "Pending registration")
          ),
          h(
            "div",
            { className: "nastroje-summary-item" },
            h("span", null, "Widget"),
            h(StatusBadge, {
              status: dashboard.widgetEnabled ? "success" : "warning",
              label: dashboard.widgetEnabled ? "Enabled" : "Disabled",
            })
          ),
          h(
            "div",
            { className: "nastroje-summary-item" },
            h("span", null, "Latest sync status"),
            h(StatusBadge, {
              status: dashboard.syncState ? dashboard.syncState.last_sync_status : "neutral",
              label: dashboard.syncState ? dashboard.syncState.last_sync_status : "idle",
            })
          ),
          h(
            "div",
            { className: "nastroje-summary-item" },
            h("span", null, "Brief / lead flow"),
            h(StatusBadge, {
              status: props.settings && props.settings.lead_capture_enabled ? "success" : "warning",
              label: props.settings && props.settings.lead_capture_enabled ? "Enabled" : "Disabled",
            })
          )
        )
      ),
      h(
        SectionCard,
        {
          title: "Posledné leady",
          description: "Rýchly náhľad posledných leadov pre tento web.",
          actions: linkButton("Otvoriť leady", adminData.menuUrls.leads),
        },
        recentLeads.length
          ? h(
              "div",
              { className: "nastroje-list" },
              recentLeads.map(function (lead) {
                return h(
                  "article",
                  { className: "nastroje-log-item", key: lead.id },
                  h("strong", null, lead.contact_name || lead.contact_email || lead.id),
                  h("span", null, lead.company_name || lead.status || ""),
                  h("small", null, formatDateTime(lead.created_at))
                );
              })
            )
          : h("p", null, "Pre tento web zatiaľ nebol zachytený žiadny lead.")
      )
    );
  }

  function SettingsPage(props) {
    var postTypes = Object.keys(props.availablePostTypes || {}).map(function (key) {
      return h(
        "label",
        { className: "nastroje-checkbox-card", key: key },
        h("input", {
          type: "checkbox",
          checked: props.settings.allowed_post_types.indexOf(key) !== -1,
          onChange: function () {
            props.onTogglePostType(key);
          },
        }),
        h("span", null, props.availablePostTypes[key])
      );
    });

    function textField(label, key, type) {
      return h(
        "label",
        null,
        h("span", null, label),
        h("input", {
          type: type || "text",
          value: props.settings[key] || "",
          onChange: function (event) {
            props.onChange(key, event.target.value);
          },
        })
      );
    }

    function colorField(label, key) {
      return textField(label, key, "color");
    }

    function numberField(label, key, min, max) {
      return h(
        "label",
        null,
        h("span", null, label),
        h("input", {
          type: "number",
          min: min,
          max: max,
          value: props.settings[key] || 0,
          onChange: function (event) {
            props.onChange(key, Number(event.target.value) || 0);
          },
        })
      );
    }

    var previewStyle = {
      "--nastroje-preview-accent": props.settings.ui_primary_color || "#0f8b75",
      "--nastroje-preview-surface": props.settings.ui_surface_color || "#ffffff",
      "--nastroje-preview-text": props.settings.ui_text_color || "#163028",
      "--nastroje-preview-border": props.settings.ui_border_color || "#d4e3de",
      "--nastroje-preview-radius": (props.settings.ui_border_radius || 22) + "px",
    };

    return h(
      "div",
      { className: "nastroje-stack" },
      h(
        SectionCard,
        {
          title: "Settings",
          description: "Assistant behavior, visual settings, and backend connection.",
          actions: h(
            "button",
            {
              className: "button button-primary",
              onClick: props.onSave,
              disabled: props.saving,
            },
            props.saving ? "Saving..." : "Save settings"
          ),
        },
        h(
          "div",
          { className: "nastroje-form-grid" },
          textField("Assistant name", "assistant_name"),
          textField("Backend URL", "backend_url"),
          textField("Site token", "site_token"),
          textField("Public site key", "public_site_key"),
          textField("Primary language", "language"),
          textField("Tone of voice", "tone"),
          textField("Theme", "theme"),
          textField("Sync frequency", "sync_frequency")
        ),
        h(
          "div",
          { className: "nastroje-settings-subsection" },
          h("h3", null, "Widget UI design"),
          h("p", null, "Customize widget colors and overall corner radius."),
          h(
            "div",
            { className: "nastroje-form-grid" },
            colorField("Primary color", "ui_primary_color"),
            colorField("Surface color", "ui_surface_color"),
            colorField("Text color", "ui_text_color"),
            colorField("Border color", "ui_border_color"),
            numberField("Border radius", "ui_border_radius", 0, 40)
          ),
          h(
            "div",
            { className: "nastroje-design-preview", style: previewStyle },
            h(
              "div",
              { className: "nastroje-design-preview__panel" },
              h("div", { className: "nastroje-design-preview__header" }, "Widget preview"),
              h(
                "div",
                { className: "nastroje-design-preview__body" },
                h("div", { className: "nastroje-design-preview__message" }, "Dobrý deň, ako vám môžem pomôcť?"),
                h(
                  "div",
                  { className: "nastroje-design-preview__message nastroje-design-preview__message--user" },
                  "Hľadám AI tool na support."
                )
              ),
              h(
                "div",
                { className: "nastroje-design-preview__footer" },
                h("div", { className: "nastroje-design-preview__input" }, "Napíšte správu..."),
                h("button", { type: "button" }, "Odoslať")
              )
            )
          )
        ),
        h(
          "label",
          { className: "nastroje-full" },
          h("span", null, "Welcome message"),
          h("textarea", {
            rows: 4,
            value: props.settings.welcome_message || "",
            onChange: function (event) {
              props.onChange("welcome_message", event.target.value);
            },
          })
        ),
        h(
          "label",
          { className: "nastroje-full" },
          h("span", null, "Privacy notice"),
          h("textarea", {
            rows: 3,
            value: props.settings.privacy_notice || "",
            onChange: function (event) {
              props.onChange("privacy_notice", event.target.value);
            },
          })
        ),
        h(
          "div",
          { className: "nastroje-checkbox-row" },
          [
            ["widget_enabled", "Enable floating widget"],
            ["shortcode_enabled", "Enable shortcode"],
            ["include_woocommerce_products", "Include WooCommerce products"],
            ["lead_capture_enabled", "Enable brief / lead flow"],
          ].map(function (entry) {
            return h(
              "label",
              { key: entry[0] },
              h("input", {
                type: "checkbox",
                checked: !!props.settings[entry[0]],
                onChange: function (event) {
                  props.onChange(entry[0], event.target.checked);
                },
              }),
              h("span", null, entry[1])
            );
          })
        ),
        h(
          "div",
          { className: "nastroje-post-types" },
          h("h3", null, "Allowed post types"),
          postTypes
        ),
        h(
          "div",
          { className: "nastroje-form-grid" },
          textField("Lead form name", "lead_form_name"),
          textField("Lead CTA label", "lead_cta_label")
        ),
        h(
          "label",
          { className: "nastroje-full" },
          h("span", null, "Lead intro message"),
          h("textarea", {
            rows: 3,
            value: props.settings.lead_intro_message || "",
            onChange: function (event) {
              props.onChange("lead_intro_message", event.target.value);
            },
          })
        ),
        h(
          "label",
          { className: "nastroje-full" },
          h("span", null, "Lead success message"),
          h("textarea", {
            rows: 3,
            value: props.settings.lead_success_message || "",
            onChange: function (event) {
              props.onChange("lead_success_message", event.target.value);
            },
          })
        ),
        h(
          "label",
          { className: "nastroje-full" },
          h("span", null, "Lead questions JSON"),
          h("textarea", {
            className: "code",
            rows: 10,
            value: props.leadQuestionsText,
            onChange: function (event) {
              props.onLeadQuestionsChange(event.target.value);
            },
          })
        )
      )
    );
  }

  function SyncPage(props) {
    return h(
      "div",
      { className: "nastroje-stack" },
      h(
        SectionCard,
        {
          title: "Content Sync",
          description: "Choose the content sources to sync into Supabase.",
          actions: h(
            "button",
            {
              className: "button button-primary",
              onClick: props.onRunSync,
              disabled: props.loading,
            },
            props.loading ? "Syncing..." : "Run sync"
          ),
        },
        h(
          "div",
          { className: "nastroje-post-types" },
          props.availableTypes.map(function (type) {
            return h(
              "label",
              { className: "nastroje-checkbox-card", key: type.value },
              h("input", {
                type: "checkbox",
                checked: props.selectedTypes.indexOf(type.value) !== -1,
                onChange: function () {
                  props.onToggle(type.value);
                },
              }),
              h("span", null, type.label)
            );
          })
        )
      ),
      h(
        SectionCard,
        { title: "Recent Sync Logs", description: "The last 20 sync operations stored locally in WordPress." },
        h(
          "div",
          { className: "nastroje-log-list" },
          (props.logs || []).length
            ? props.logs.map(function (entry, index) {
                return h(
                  "article",
                  { className: "nastroje-log-item", key: index },
                  h("strong", null, entry.status || "unknown"),
                  h("span", null, (entry.items_processed || 0) + " items"),
                  h("small", null, entry.finished_at || entry.started_at || "")
                );
              })
            : h("p", null, "No syncs have been recorded yet.")
        )
      )
    );
  }

  function ConversationsPage(props) {
    return h(
      "div",
      { className: "nastroje-split-grid" },
      h(
        SectionCard,
        {
          title: "Conversations — latest 30",
          actions: linkButton("Refresh", adminData.menuUrls.conversations),
        },
        h(
          "div",
          { className: "nastroje-list" },
          props.conversations.length
            ? props.conversations.map(function (conversation) {
                return h(
                  "button",
                  {
                    className: "nastroje-list-item" + (props.selectedConversationId === conversation.id ? " is-selected" : ""),
                    key: conversation.id,
                    onClick: function () {
                      props.onSelect(conversation.id);
                    },
                  },
                  h("strong", null, formatDateTime(conversation.updated_at || conversation.created_at || "")),
                  h("span", null, conversation.session_id || conversation.id),
                  h("small", null, conversation.mode || "chat")
                );
              })
            : h("p", null, "No conversations recorded yet.")
        )
      ),
      h(
        SectionCard,
        {
          title: "Messages",
          actions: props.selectedConversationId
            ? h(
                "button",
                {
                  className: "button nastroje-button-danger",
                  type: "button",
                  onClick: props.onDelete,
                  disabled: props.deleting,
                },
                props.deleting ? "Deleting..." : "Delete conversation"
              )
            : null,
        },
        props.selectedConversation
          ? h(
              "div",
              { className: "nastroje-message-list" },
              h(
                "article",
                { className: "nastroje-message nastroje-message--assistant" },
                h("strong", null, props.selectedConversation.session_id || props.selectedConversation.id),
                h("p", null, props.selectedConversation.source_page_url || props.selectedConversation.mode || "chat"),
                h("small", null, formatDateTime(props.selectedConversation.updated_at || props.selectedConversation.created_at || ""))
              ),
              props.messages.length
                ? props.messages.map(function (message) {
                    return h(
                      "article",
                      {
                        className: "nastroje-message nastroje-message--" + message.role,
                        key: message.id,
                      },
                      h("strong", null, message.role),
                      h("p", null, message.content),
                      h("small", null, formatDateTime(message.created_at || ""))
                    );
                  })
                : h("p", null, "This conversation has no messages yet.")
            )
          : h("p", null, "Select a conversation to inspect its messages.")
      )
    );
  }

  function LeadsPage(props) {
    var _useStateLeadDateFrom = useState(""),
      dateFrom = _useStateLeadDateFrom[0],
      setDateFrom = _useStateLeadDateFrom[1];
    var _useStateLeadDateTo = useState(""),
      dateTo = _useStateLeadDateTo[0],
      setDateTo = _useStateLeadDateTo[1];
    var filteredSubmissions = props.submissions.filter(function (submission) {
      var createdDate = String(submission.created_at || "").slice(0, 10);
      if (dateFrom && createdDate < dateFrom) {
        return false;
      }
      if (dateTo && createdDate > dateTo) {
        return false;
      }
      return true;
    });
    var visibleSubmissions = filteredSubmissions.slice(0, 10);

    function leadExportRows(submissions) {
      return submissions.map(function (submission) {
        var answers = (submission.answers || []).map(function (answer) {
          return (answer.label || "") + ": " + (answer.value || "");
        }).join(" | ");

        return {
          id: submission.id || "",
          created_at: submission.created_at || "",
          contact_name: submission.contact_name || "",
          contact_email: submission.contact_email || "",
          company_name: submission.company_name || "",
          status: submission.status || "",
          summary: submission.summary || "",
          answers: answers,
        };
      });
    }

    function downloadFile(format) {
      Promise.all(filteredSubmissions.map(function (submission) {
        return request("/lead-submissions/" + submission.id, { method: "GET" }).then(function (detail) {
          return detail.submission || submission;
        }).catch(function () {
          return submission;
        });
      })).then(function (detailedSubmissions) {
        var rows = leadExportRows(detailedSubmissions);
        var content;
        var mimeType;
        var extension;

        if (format === "csv") {
          var headers = ["id", "created_at", "contact_name", "contact_email", "company_name", "status", "summary", "answers"];
          content = headers.join(",") + "\n" + rows.map(function (row) {
            return headers.map(function (header) {
              return csvEscape(row[header]);
            }).join(",");
          }).join("\n");
          mimeType = "text/csv;charset=utf-8";
          extension = "csv";
        } else {
          content = rows.map(function (row, index) {
            return [
              "Lead " + (index + 1),
              "ID: " + row.id,
              "Dátum: " + row.created_at,
              "Meno: " + row.contact_name,
              "E-mail: " + row.contact_email,
              "Firma/projekt: " + row.company_name,
              "Stav: " + row.status,
              "Súhrn: " + row.summary,
              "Odpovede: " + row.answers,
            ].join("\n");
          }).join("\n\n---\n\n");
          mimeType = "text/plain;charset=utf-8";
          extension = "txt";
        }

        var blob = new Blob([content], { type: mimeType });
        var link = document.createElement("a");
        var datePart = [dateFrom || "all", dateTo || "all"].join("_");
        link.href = URL.createObjectURL(blob);
        link.download = "nastroje-ai-leads-" + datePart + "." + extension;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
      });
    }

    return h(
      "div",
      { className: "nastroje-split-grid" },
      h(
        SectionCard,
        {
          title: "Lead Submissions",
          description: "Zachytené brief odpovede a kontaktné údaje pre tento web.",
          actions: h(
            "div",
            { className: "nastroje-card__actions" },
            h(
              "button",
              {
                className: "button button-secondary",
                type: "button",
                onClick: function () {
                  downloadFile("txt");
                },
                disabled: !filteredSubmissions.length,
              },
              "Stiahnuť TXT"
            ),
            h(
              "button",
              {
                className: "button button-secondary",
                type: "button",
                onClick: function () {
                  downloadFile("csv");
                },
                disabled: !filteredSubmissions.length,
              },
              "Stiahnuť CSV"
            ),
            linkButton("Refresh", adminData.menuUrls.leads)
          ),
        },
        h(
          "div",
          { className: "nastroje-lead-toolbar" },
          h(
            "label",
            null,
            h("span", null, "Dátum od"),
            h("input", {
              type: "date",
              value: dateFrom,
              onChange: function (event) {
                setDateFrom(event.target.value);
              },
            })
          ),
          h(
            "label",
            null,
            h("span", null, "Dátum do"),
            h("input", {
              type: "date",
              value: dateTo,
              onChange: function (event) {
                setDateTo(event.target.value);
              },
            })
          ),
          h(
            "button",
            {
              className: "button button-secondary",
              type: "button",
              onClick: function () {
                setDateFrom("");
                setDateTo("");
              },
              disabled: !dateFrom && !dateTo,
            },
            "Vyčistiť filter"
          ),
          h("small", null, "Zobrazuje sa posledných " + visibleSubmissions.length + " z " + filteredSubmissions.length + " filtrovaných leadov.")
        ),
        h(
          "div",
          { className: "nastroje-list" },
              visibleSubmissions.length
                ? visibleSubmissions.map(function (submission) {
                    return h(
                      "button",
                      {
                    className: "nastroje-list-item" + (props.selectedSubmissionId === submission.id ? " is-selected" : ""),
                        key: submission.id,
                        onClick: function () {
                          props.onSelect(submission.id);
                        },
                      },
                      h("strong", null, submission.contact_name || submission.contact_email || submission.id),
                      h("span", null, submission.company_name || submission.status || ""),
                      h("small", null, submission.created_at || "")
                    );
                  })
                : h("p", null, props.submissions.length ? "Pre vybraný dátumový rozsah nie sú žiadne leady." : "Pre tento web zatiaľ nie sú zachytené žiadne leady.")
        )
      ),
      h(
        SectionCard,
        {
          title: "Submission Detail",
          actions: props.submission
            ? h(
                "button",
                {
                  className: "button nastroje-button-danger",
                  type: "button",
                  onClick: props.onDelete,
                  disabled: props.deleting,
                },
                props.deleting ? "Deleting..." : "Delete lead"
              )
            : null,
        },
        props.submission
          ? h(
              "div",
              { className: "nastroje-message-list" },
              h(
                "article",
                { className: "nastroje-message nastroje-message--assistant" },
                h("strong", null, props.submission.contact_name || props.submission.contact_email || props.submission.id),
                h("p", null, props.submission.company_name || props.submission.status || ""),
                h("small", null, props.submission.created_at || "")
              ),
              h(
                "article",
                { className: "nastroje-message nastroje-message--assistant" },
                h("strong", null, "Summary"),
                h("p", null, props.submission.summary || "")
              ),
              (props.submission.answers || []).map(function (answer, index) {
                return h(
                  "article",
                  {
                    className: "nastroje-message nastroje-message--user",
                    key: answer.label + index,
                  },
                  h("strong", null, answer.label),
                  h("p", null, answer.value)
                );
              })
            )
          : h("p", null, "Select a submission to inspect the captured brief.")
      )
    );
  }

  function AnalyticsPage(props) {
    var analytics = props.analytics || {};
    var totals = analytics.totals || {};
    var topTopics = analytics.topTopics || [];
    var dailyActivity = analytics.dailyActivity || [];
    var recentLeadSignals = analytics.recentLeadSignals || [];
    var maxDaily = Math.max.apply(
      null,
      [1].concat(
        dailyActivity.map(function (entry) {
          return (entry.chats || 0) + (entry.leads || 0);
        })
      )
    );
    var maxTopics = Math.max.apply(
      null,
      [1].concat(
        topTopics.map(function (entry) {
          return entry.count || 0;
        })
      )
    );

    return h(
      "div",
      { className: "nastroje-stack" },
      h(
        SectionCard,
        {
          title: "Analytika",
          description: "Prehľad posledných 30 dní pre AI chaty a leady na tomto webe.",
          actions: h(
            "button",
            {
              className: "button button-secondary",
              type: "button",
              onClick: props.onRefresh,
              disabled: props.loading,
            },
            props.loading ? "Načítavam..." : "Obnoviť"
          ),
        },
        h(
          "div",
          { className: "nastroje-stats-grid" },
          h(StatCard, { label: "AI chaty", value: totals.chats || 0 }),
          h(StatCard, { label: "Leady", value: totals.leadSubmissions || 0 }),
          h(StatCard, { label: "Správy v chate", value: totals.chatMessages || 0 })
        )
      ),
      h(
        "div",
        { className: "nastroje-split-grid" },
        h(
          SectionCard,
          {
            title: "Top témy",
            description: "Najčastejšie zachytené témy z leadov a AI chatov.",
          },
          topTopics.length
            ? h(
                "div",
                { className: "nastroje-analytics-list" },
                topTopics.map(function (entry) {
                  return h(
                    "article",
                    { className: "nastroje-analytics-item", key: entry.label },
                    h(
                      "div",
                      { className: "nastroje-analytics-item__header" },
                      h("strong", null, entry.label),
                      h("span", null, entry.count)
                    ),
                    h("div", { className: "nastroje-analytics-bar" }, h("span", { style: { width: (entry.count / maxTopics) * 100 + "%" } }))
                  );
                })
              )
            : h("p", null, "Zatiaľ nie je dosť dát na vyhodnotenie top tém.")
        ),
        h(
          SectionCard,
          {
            title: "Denný prehľad",
            description: "Denný počet AI chatov a leadov za posledných 30 dní.",
          },
          dailyActivity.length
            ? h(
                "div",
                { className: "nastroje-analytics-list" },
                dailyActivity.map(function (entry) {
                  var total = (entry.chats || 0) + (entry.leads || 0);
                  return h(
                    "article",
                    { className: "nastroje-analytics-item", key: entry.date },
                    h(
                      "div",
                      { className: "nastroje-analytics-item__header" },
                      h("strong", null, entry.label),
                      h("span", null, "Chaty " + (entry.chats || 0) + " · Leady " + (entry.leads || 0))
                    ),
                    h("div", { className: "nastroje-analytics-bar" }, h("span", { style: { width: (total / maxDaily) * 100 + "%" } }))
                  );
                })
              )
            : h("p", null, "Za posledných 30 dní zatiaľ neboli zachytené žiadne aktivity.")
        )
      ),
      h(
        SectionCard,
        {
          title: "Posledných 5 leadov",
          description: "Najnovšie zachytené leady s krátkym preview odpovedí.",
        },
        recentLeadSignals.length
          ? h(
              "div",
              { className: "nastroje-message-list" },
              recentLeadSignals.map(function (lead) {
                return h(
                  "article",
                  { className: "nastroje-message nastroje-message--assistant", key: lead.id },
                  h("strong", null, lead.contact),
                  h("p", null, compactText(lead.summary || lead.answers_text || "", 220)),
                  lead.answers_text ? h("small", null, compactText(lead.answers_text, 260)) : null,
                  h("small", null, formatDateTime(lead.created_at))
                );
              })
            )
          : h("p", null, "Zatiaľ nie sú dostupné žiadne leady pre analytiku.")
      )
    );
  }

  function HelpPage() {
    return h(
      "div",
      { className: "nastroje-stack" },
      h(
        SectionCard,
        {
          title: "Help",
          description: "Recommended rollout path for client websites.",
        },
        h(
          "ol",
          { className: "nastroje-help-list" },
          h("li", null, "Set the backend URL and register the site to receive a secure site token."),
          h("li", null, "Validate the connection and confirm the backend returns a healthy site status."),
          h("li", null, "Run a manual sync for posts, pages, products, and categories."),
          h("li", null, "Place [ai_assistant_chat] on a page or enable the floating widget."),
          h("li", null, "Review conversation history and tune assistant language, tone, and theme.")
        )
      )
    );
  }

  function App() {
    var defaultSyncTypes = Object.keys(adminData.availablePostTypes || {});
    defaultSyncTypes.push("category");
    if (adminData.settings.include_woocommerce_products) {
      defaultSyncTypes.push("product");
    }

    var _useState = useState(adminData.settings),
      settings = _useState[0],
      setSettings = _useState[1];
    var _useStateLead = useState(JSON.stringify(adminData.settings.lead_questions || [], null, 2)),
      leadQuestionsText = _useStateLead[0],
      setLeadQuestionsText = _useStateLead[1];
    var _useState2 = useState(null),
      dashboard = _useState2[0],
      setDashboard = _useState2[1];
    var _useState3 = useState(defaultSyncTypes),
      selectedSyncTypes = _useState3[0],
      setSelectedSyncTypes = _useState3[1];
    var _useState4 = useState(false),
      busy = _useState4[0],
      setBusy = _useState4[1];
    var _useState5 = useState(""),
      feedback = _useState5[0],
      setFeedback = _useState5[1];
    var _useState6 = useState("info"),
      feedbackVariant = _useState6[0],
      setFeedbackVariant = _useState6[1];
    var _useState7 = useState([]),
      conversations = _useState7[0],
      setConversations = _useState7[1];
    var _useState8 = useState([]),
      messages = _useState8[0],
      setMessages = _useState8[1];
    var _useStateConversation = useState(null),
      selectedConversation = _useStateConversation[0],
      setSelectedConversation = _useStateConversation[1];
    var _useStateSelectedConversation = useState(""),
      selectedConversationId = _useStateSelectedConversation[0],
      setSelectedConversationId = _useStateSelectedConversation[1];
    var _useState9 = useState([]),
      leadSubmissions = _useState9[0],
      setLeadSubmissions = _useState9[1];
    var _useState10 = useState(null),
      leadSubmission = _useState10[0],
      setLeadSubmission = _useState10[1];
    var _useState11 = useState(""),
      selectedLeadSubmissionId = _useState11[0],
      setSelectedLeadSubmissionId = _useState11[1];
    var _useState12 = useState(null),
      analytics = _useState12[0],
      setAnalytics = _useState12[1];

    function refreshDashboard() {
      return request("/dashboard", { method: "GET" }).then(function (data) {
        setDashboard(data);
      });
    }

    function refreshSettings() {
      return request("/settings", { method: "GET" }).then(function (data) {
        setSettings(data.settings || adminData.settings);
        setLeadQuestionsText(JSON.stringify((data.settings && data.settings.lead_questions) || [], null, 2));
      });
    }

    function refreshConversations() {
      return request("/conversations?page=1&per_page=30", { method: "GET" }).then(function (data) {
        var entries = data.conversations || [];
        var nextId = selectedConversationId;
        setConversations(entries);

        if (!entries.length) {
          setSelectedConversationId("");
          setSelectedConversation(null);
          setMessages([]);
          return;
        }

        if (!nextId || !entries.some(function (entry) {
          return entry.id === nextId;
        })) {
          nextId = entries[0].id;
        }

        setSelectedConversationId(nextId);
        return request("/conversations/" + nextId, {
          method: "GET",
        }).then(function (detail) {
          setSelectedConversation(detail.conversation || null);
          setMessages(detail.messages || []);
        });
      });
    }

    function refreshLeadSubmissions(preferredSubmissionId) {
      return request("/lead-submissions?page=1&per_page=50", { method: "GET" }).then(function (data) {
        var submissions = data.submissions || [];
        var nextId = preferredSubmissionId || selectedLeadSubmissionId;
        setLeadSubmissions(submissions);

        if (!submissions.length) {
          setLeadSubmission(null);
          setSelectedLeadSubmissionId("");
          return;
        }

        if (!nextId || !submissions.some(function (entry) {
          return entry.id === nextId;
        })) {
          nextId = submissions[0].id;
        }

        setSelectedLeadSubmissionId(nextId);
        return request("/lead-submissions/" + nextId, {
          method: "GET",
        }).then(function (detail) {
          setLeadSubmission(detail.submission || null);
        });
      });
    }

    function refreshAnalytics() {
      return request("/analytics", { method: "GET" }).then(function (data) {
        setAnalytics(data || null);
      });
    }

    useEffect(function () {
      refreshDashboard();
      refreshSettings();
      if (adminData.currentView === "conversations") {
        refreshConversations();
      }
      if (adminData.currentView === "leads") {
        refreshLeadSubmissions();
      }
      if (adminData.currentView === "analytics") {
        refreshAnalytics();
      }
    }, []);

    function updateSetting(key, value) {
      setSettings(function (current) {
        var next = Object.assign({}, current);
        next[key] = value;
        return next;
      });
    }

    function togglePostType(postType) {
      setSettings(function (current) {
        var next = Object.assign({}, current);
        next.allowed_post_types = current.allowed_post_types.indexOf(postType) === -1
          ? current.allowed_post_types.concat([postType])
          : current.allowed_post_types.filter(function (entry) {
              return entry !== postType;
            });
        return next;
      });
    }

    function toggleSyncType(syncType) {
      setSelectedSyncTypes(function (current) {
        return current.indexOf(syncType) === -1
          ? current.concat([syncType])
          : current.filter(function (entry) {
              return entry !== syncType;
            });
      });
    }

    function runAction(action, fn) {
      setBusy(true);
      setFeedback("");
      return Promise.resolve()
        .then(fn)
        .then(function () {
          setFeedback(action + " completed.");
          setFeedbackVariant("success");
        })
        .catch(function (error) {
          setFeedback(error && error.message ? error.message : action + " failed.");
          setFeedbackVariant("error");
        })
        .finally(function () {
          setBusy(false);
        });
    }

    function saveSettings() {
      return runAction("Settings save", function () {
        var parsedLeadQuestions = [];
        if (leadQuestionsText && leadQuestionsText.trim()) {
          parsedLeadQuestions = JSON.parse(leadQuestionsText);
        }
        var payload = Object.assign({}, settings, {
          lead_questions: parsedLeadQuestions,
        });
        return request("/settings", {
          method: "POST",
          data: payload,
        }).then(function (data) {
          setSettings(data.settings || settings);
          setLeadQuestionsText(JSON.stringify((data.settings && data.settings.lead_questions) || parsedLeadQuestions, null, 2));
          return refreshDashboard();
        });
      });
    }

    function registerSite() {
      return runAction("Site registration", function () {
        return request("/register-site", {
          method: "POST",
        }).then(function (data) {
          setSettings(data.settings || settings);
          setLeadQuestionsText(JSON.stringify(((data.settings || settings).lead_questions) || [], null, 2));
          return refreshDashboard();
        });
      });
    }

    function testConnection() {
      return runAction("Connection test", function () {
        return request("/test-connection", {
          method: "POST",
        }).then(function () {
          return refreshDashboard();
        });
      });
    }

    function runSync() {
      return runAction("Sync", function () {
        return request("/sync", {
          method: "POST",
          data: {
            types: selectedSyncTypes,
          },
        }).then(function () {
          return refreshDashboard();
        });
      });
    }

    function selectConversation(conversationId) {
      return runAction("Conversation fetch", function () {
        setSelectedConversationId(conversationId);
        return request("/conversations/" + conversationId, {
          method: "GET",
        }).then(function (data) {
          setSelectedConversation(data.conversation || null);
          setMessages(data.messages || []);
        });
      });
    }

    function deleteConversation() {
      if (!selectedConversationId) {
        return Promise.resolve();
      }

      if (!window.confirm("Delete this conversation?")) {
        return Promise.resolve();
      }

      return runAction("Conversation delete", function () {
        return request("/conversations/" + selectedConversationId, {
          method: "DELETE",
        }).then(function () {
          setSelectedConversationId("");
          setSelectedConversation(null);
          setMessages([]);
          return refreshConversations();
        }).then(function () {
          return refreshDashboard();
        });
      });
    }

    function selectLeadSubmission(submissionId) {
      return runAction("Lead fetch", function () {
        setSelectedLeadSubmissionId(submissionId);
        return request("/lead-submissions/" + submissionId, {
          method: "GET",
        }).then(function (data) {
          setLeadSubmission(data.submission || null);
        });
      });
    }

    function deleteLeadSubmission() {
      if (!selectedLeadSubmissionId) {
        return Promise.resolve();
      }

      if (!window.confirm("Delete this lead?")) {
        return Promise.resolve();
      }

      return runAction("Lead delete", function () {
        return request("/lead-submissions/" + selectedLeadSubmissionId, {
          method: "DELETE",
        }).then(function () {
          setLeadSubmission(null);
          setSelectedLeadSubmissionId("");
          return refreshLeadSubmissions();
        }).then(function () {
          return refreshDashboard();
        });
      });
    }

    var page;
    if (adminData.currentView === "settings") {
      page = h(SettingsPage, {
        settings: settings,
        availablePostTypes: adminData.availablePostTypes || {},
        onChange: updateSetting,
        onTogglePostType: togglePostType,
        leadQuestionsText: leadQuestionsText,
        onLeadQuestionsChange: setLeadQuestionsText,
        onSave: saveSettings,
        saving: busy,
      });
    } else if (adminData.currentView === "sync") {
      var availableSyncTypes = Object.keys(adminData.availablePostTypes || {}).map(function (value) {
        return {
          value: value,
          label: adminData.availablePostTypes[value],
        };
      });
      availableSyncTypes.push({ value: "category", label: "Categories" });
      if (settings.include_woocommerce_products) {
        availableSyncTypes.push({ value: "product", label: "WooCommerce products" });
      }
      page = h(SyncPage, {
        selectedTypes: selectedSyncTypes,
        availableTypes: availableSyncTypes,
        onToggle: toggleSyncType,
        onRunSync: runSync,
        loading: busy,
        logs: dashboard && dashboard.logs ? dashboard.logs : adminData.syncState.logs || [],
      });
    } else if (adminData.currentView === "conversations") {
      page = h(ConversationsPage, {
        conversations: conversations,
        selectedConversationId: selectedConversationId,
        selectedConversation: selectedConversation,
        messages: messages,
        onSelect: selectConversation,
        onDelete: deleteConversation,
        deleting: busy,
      });
    } else if (adminData.currentView === "leads") {
      page = h(LeadsPage, {
        submissions: leadSubmissions,
        submission: leadSubmission,
        onSelect: selectLeadSubmission,
        onDelete: deleteLeadSubmission,
        deleting: busy,
        selectedSubmissionId: selectedLeadSubmissionId,
      });
    } else if (adminData.currentView === "analytics") {
      page = h(AnalyticsPage, {
        analytics: analytics,
        onRefresh: function () {
          return runAction("Analytics refresh", function () {
            return refreshAnalytics();
          });
        },
        loading: busy,
      });
    } else if (adminData.currentView === "help") {
      page = h(HelpPage);
    } else {
      page = h(DashboardPage, {
        dashboard: dashboard,
        settings: settings,
        onRegisterSite: registerSite,
        onTestConnection: testConnection,
        onRunSync: runSync,
        loading: busy,
      });
    }

    return h(
      "div",
      { className: "nastroje-admin-shell" },
      h(
        "header",
        { className: "nastroje-admin-hero" },
        h(
          "div",
          null,
          h("p", { className: "nastroje-admin-eyebrow" }, "Nastroje AI Assistant"),
          h("h1", null, adminData.siteName),
          h("span", null, "Supabase-backed AI assistant for WordPress sites")
        ),
        h(
          "nav",
          { className: "nastroje-admin-nav" },
          linkButton("Dashboard", adminData.menuUrls.dashboard),
          linkButton("Settings", adminData.menuUrls.settings),
          linkButton("Content Sync", adminData.menuUrls.sync),
          linkButton("Lead Capture", adminData.menuUrls.leads),
          linkButton("Analytika", adminData.menuUrls.analytics),
          linkButton("Conversations", adminData.menuUrls.conversations),
          linkButton("Help", adminData.menuUrls.help)
        )
      ),
      h(Notice, { message: feedback, variant: feedbackVariant }),
      page
    );
  }

  var root = document.getElementById("nastroje-ai-admin-root");
  if (root) {
    element.render(h(App), root);
  }
})();
