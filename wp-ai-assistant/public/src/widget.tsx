(function () {
  if (!window.wp || !window.wp.element || !window.NastrojeAIWidget) {
    return;
  }

  var config = window.NastrojeAIWidget;
  var element = window.wp.element;
  var h = element.createElement;
  var useEffect = element.useEffect;
  var useRef = element.useRef;
  var useState = element.useState;
  var CHAT_TTL_MS = 30 * 60 * 1000;
  var MAX_CHAT_MESSAGE_LENGTH = 2000;
  var MAX_BRIEF_ANSWER_LENGTH = 2000;
  var MAX_RESTORED_MESSAGES = 60;

  function storageKey() {
    return "nastroje-ai-conversation:" + (config.siteUrl || window.location.origin);
  }

  function legacyChatMessagesKey() {
    return "nastroje-ai-chat-messages:" + (config.siteUrl || window.location.origin);
  }

  function legacyBriefMessagesKey() {
    return "nastroje-ai-brief-messages:" + (config.siteUrl || window.location.origin);
  }

  function leadStorageKey() {
    return "nastroje-ai-lead-conversation:" + (config.siteUrl || window.location.origin);
  }

  function sessionKey() {
    return "nastroje-ai-session:" + (config.siteUrl || window.location.origin);
  }

  function activityKey() {
    return "nastroje-ai-activity:" + (config.siteUrl || window.location.origin);
  }

  function isConversationExpired() {
    var lastActivity = Number(window.sessionStorage.getItem(activityKey()) || "0");
    if (!lastActivity) {
      return false;
    }

    return Date.now() - lastActivity > CHAT_TTL_MS;
  }

  function clearStoredConversationState() {
    window.sessionStorage.removeItem(storageKey());
    window.sessionStorage.removeItem(leadStorageKey());
    window.sessionStorage.removeItem(activityKey());
  }

  function clearLegacyStoredMessages() {
    window.localStorage.removeItem(legacyChatMessagesKey());
    window.localStorage.removeItem(legacyBriefMessagesKey());
  }

  function touchConversationActivity() {
    window.sessionStorage.setItem(activityKey(), String(Date.now()));
  }

  function readStoredConversationId() {
    if (isConversationExpired()) {
      clearStoredConversationState();
      return "";
    }

    return window.sessionStorage.getItem(storageKey()) || "";
  }

  function readStoredLeadConversationId() {
    if (isConversationExpired()) {
      clearStoredConversationState();
      return "";
    }

    return window.sessionStorage.getItem(leadStorageKey()) || "";
  }

  function limitText(value, maxLength) {
    return String(value || "").slice(0, maxLength);
  }

  function normalizeRestoredMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages
      .map(function (message) {
        if (!message || (message.role !== "assistant" && message.role !== "user")) {
          return null;
        }

        var content = typeof message.content === "string" ? message.content.slice(0, MAX_CHAT_MESSAGE_LENGTH + 500) : "";
        if (!content.trim()) {
          return null;
        }

        var sources = Array.isArray(message.sources)
          ? message.sources
              .slice(0, 5)
              .map(function (source) {
                return {
                  url: typeof source.url === "string" ? source.url.slice(0, 500) : "",
                  title: typeof source.title === "string" ? source.title.slice(0, 160) : "",
                };
              })
              .filter(function (source) {
                return source.url;
              })
          : [];

        return {
          role: message.role,
          content: content,
          sources: sources,
        };
      })
      .filter(Boolean)
      .slice(-MAX_RESTORED_MESSAGES);
  }

  function generateId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function readOrCreateSession() {
    if (isConversationExpired()) {
      var fresh = generateId("session");
      clearStoredConversationState();
      window.sessionStorage.setItem(sessionKey(), fresh);
      return fresh;
    }

    var existing = window.sessionStorage.getItem(sessionKey());
    if (existing) {
      return existing;
    }

    var next = generateId("session");
    window.sessionStorage.setItem(sessionKey(), next);
    return next;
  }

  clearLegacyStoredMessages();

  function normalizeHexColor(value, fallback) {
    var input = typeof value === "string" ? value.trim() : "";
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input) ? input : fallback;
  }

  function hexToRgb(value) {
    var normalized = normalizeHexColor(value, "");
    if (!normalized) {
      return null;
    }

    var hex = normalized.length === 4
      ? normalized
          .slice(1)
          .split("")
          .map(function (char) {
            return char + char;
          })
          .join("")
      : normalized.slice(1);

    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  function rgbaFromHex(value, alpha, fallback) {
    var rgb = hexToRgb(value);
    if (!rgb) {
      return fallback;
    }

    return "rgba(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", " + alpha + ")";
  }

  function darkenHex(value, amount, fallback) {
    var rgb = hexToRgb(value);
    if (!rgb) {
      return fallback;
    }

    return "#" + rgb
      .map(function (channel) {
        return Math.max(0, Math.round(channel * (1 - amount / 100)))
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
  }

  function renderSources(sources, onSourceAction) {
    if (!sources || !sources.length) {
      return null;
    }

    return h(
      "div",
      { className: "nastroje-chat-sources" },
      sources.map(function (source, index) {
        var isBriefAction = source.url === "#brief";
        return h(
          "a",
          {
            href: source.url,
            key: source.url + index,
            onClick: isBriefAction
              ? function (event) {
                  event.preventDefault();
                  if (onSourceAction) {
                    onSourceAction("brief");
                  }
                }
              : void 0,
          },
          source.title || source.url
        );
      })
    );
  }

  function Message(props) {
    return h(
      "article",
      {
        className: "nastroje-chat-message nastroje-chat-message--" + props.message.role,
      },
      h("p", null, props.message.content),
      renderSources(props.message.sources || [], props.onSourceAction)
    );
  }

  function ModeTabs(props) {
    if (!config.leadFlow || !config.leadFlow.enabled) {
      return null;
    }

    return h(
      "div",
      { className: "nastroje-chat-tabs" },
      h(
        "button",
        {
          className: "nastroje-chat-tab" + (props.mode === "chat" ? " is-active" : ""),
          type: "button",
          onClick: function () {
            props.onChange("chat");
          },
        },
        "AI Chat"
      ),
      h(
        "button",
        {
          className: "nastroje-chat-tab" + (props.mode === "brief" ? " is-active" : ""),
          type: "button",
          onClick: function () {
            props.onChange("brief");
          },
        },
        config.leadFlow.formName || "Brief"
      )
    );
  }

  function ChatWidget(props) {
    var isFloating = props.surface === "floating";
    var leadQuestions = (config.leadFlow && config.leadFlow.questions) || [];
    var design = config.design || {};
    var accentColor = normalizeHexColor(design.primaryColor, "#0f8b75");
    var textColor = normalizeHexColor(design.textColor, "#163028");
    var widgetStyle = {
      "--nastroje-chat-accent": accentColor,
      "--nastroje-chat-accent-dark": darkenHex(accentColor, 18, "#0d6b5a"),
      "--nastroje-chat-accent-soft": rgbaFromHex(accentColor, 0.12, "#e2f7f1"),
      "--nastroje-chat-surface": normalizeHexColor(design.surfaceColor, "#ffffff"),
      "--nastroje-chat-text": textColor,
      "--nastroje-chat-muted": rgbaFromHex(textColor, 0.7, "#688077"),
      "--nastroje-chat-border": normalizeHexColor(design.borderColor, "#d4e3de"),
      "--nastroje-chat-radius": Math.max(0, Math.min(40, Number(design.borderRadius) || 22)) + "px",
    };

    var initialChatMessages = [
        {
          role: "assistant",
          content: config.welcomeMessage,
          sources: [],
        },
      ];
    var initialBriefMessages = [
        {
          role: "assistant",
          content: config.leadFlow && config.leadFlow.enabled
            ? config.leadFlow.introMessage
            : "Lead flow is disabled.",
          sources: [],
        },
      ];

    var _useState = useState(initialChatMessages),
      chatMessages = _useState[0],
      setChatMessages = _useState[1];

    var _useState2 = useState(initialBriefMessages),
      briefMessages = _useState2[0],
      setBriefMessages = _useState2[1];

    var _useState3 = useState(isFloating ? false : true),
      open = _useState3[0],
      setOpen = _useState3[1];

    var _useState4 = useState(""),
      input = _useState4[0],
      setInput = _useState4[1];

    var _useState5 = useState(false),
      loading = _useState5[0],
      setLoading = _useState5[1];

    var _useState6 = useState(""),
      error = _useState6[0],
      setError = _useState6[1];

    var _useState7 = useState(readStoredConversationId()),
      conversationId = _useState7[0],
      setConversationId = _useState7[1];

    var _useState8 = useState(readStoredLeadConversationId()),
      leadConversationId = _useState8[0],
      setLeadConversationId = _useState8[1];

    var _useState9 = useState(readOrCreateSession()),
      sessionId = _useState9[0],
      setSessionId = _useState9[1];

	    var _useState10 = useState(conversationId ? "chat" : config.leadFlow && config.leadFlow.enabled ? "brief" : "chat"),
      mode = _useState10[0],
      setMode = _useState10[1];

    var _useState11 = useState(false),
      briefStarted = _useState11[0],
      setBriefStarted = _useState11[1];

    var _useState12 = useState(0),
      briefIndex = _useState12[0],
      setBriefIndex = _useState12[1];

    var _useState13 = useState([]),
      briefAnswers = _useState13[0],
      setBriefAnswers = _useState13[1];

    var _useState14 = useState(false),
      briefSubmitted = _useState14[0],
      setBriefSubmitted = _useState14[1];

    var messagesRef = useRef(null);
    var activeMessages = mode === "brief" ? briefMessages : chatMessages;

    useEffect(function () {
      if (conversationId) {
        window.sessionStorage.setItem(storageKey(), conversationId);
      } else {
        window.sessionStorage.removeItem(storageKey());
      }
    }, [conversationId]);

	    useEffect(function () {
	      if (leadConversationId) {
	        window.sessionStorage.setItem(leadStorageKey(), leadConversationId);
	      } else {
	        window.sessionStorage.removeItem(leadStorageKey());
	      }
	    }, [leadConversationId]);

	    useEffect(function () {
	      if (!conversationId || !sessionId || !config.conversationUrl) {
	        return;
	      }

	      var cancelled = false;
	      var separator = config.conversationUrl.indexOf("?") === -1 ? "?" : "&";
	      var restoreUrl =
	        config.conversationUrl +
	        separator +
	        "conversation_id=" +
	        encodeURIComponent(conversationId) +
	        "&session_id=" +
	        encodeURIComponent(sessionId);

	      fetch(restoreUrl, {
	        method: "GET",
	        credentials: "same-origin",
	        headers: {
	          Accept: "application/json",
	        },
	      })
	        .then(function (response) {
	          if (!response.ok) {
	            throw new Error("Conversation cannot be restored.");
	          }

	          return response.json();
	        })
	        .then(function (data) {
	          if (cancelled) {
	            return;
	          }

	          var restoredMessages = normalizeRestoredMessages(data && data.messages);
	          if (restoredMessages.length) {
	            setChatMessages(function (current) {
	              return current.length > 1 ? current : restoredMessages;
	            });
	            touchConversationActivity();
	          }
	        })
	        .catch(function () {
	          // Keep the default welcome message if server-side restore is unavailable.
	        });

	      return function () {
	        cancelled = true;
	      };
	    }, [conversationId, sessionId]);

    useEffect(function () {
      if (!open || !messagesRef.current) {
        return;
      }

      window.requestAnimationFrame(function () {
        if (!messagesRef.current) {
          return;
        }

        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      });
    }, [open, mode, activeMessages.length, loading, briefStarted, briefSubmitted]);

    function resetAll() {
      var newSessionId = generateId("session");
      setConversationId("");
      setLeadConversationId("");
      setSessionId(newSessionId);
      setInput("");
      setError("");
      setMode(config.leadFlow && config.leadFlow.enabled ? "brief" : "chat");
      setBriefStarted(false);
      setBriefIndex(0);
      setBriefAnswers([]);
      setBriefSubmitted(false);
      setChatMessages([
        {
          role: "assistant",
          content: config.welcomeMessage,
          sources: [],
        },
      ]);
      setBriefMessages([
        {
          role: "assistant",
          content: config.leadFlow && config.leadFlow.enabled
            ? config.leadFlow.introMessage
            : "Lead flow is disabled.",
          sources: [],
        },
      ]);
      clearStoredConversationState();
      window.sessionStorage.setItem(sessionKey(), newSessionId);
      touchConversationActivity();
    }

    function sendChatMessage() {
      var trimmed = input.trim();
      if (!trimmed || loading) {
        return;
      }

      if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
        setError("Správa je príliš dlhá. Skráťte ju prosím na maximálne " + MAX_CHAT_MESSAGE_LENGTH + " znakov.");
        return;
      }

      var activeConversationId = conversationId;
      var activeSessionId = sessionId;
      if (isConversationExpired()) {
        activeConversationId = "";
        activeSessionId = generateId("session");
        setConversationId("");
        setLeadConversationId("");
        setSessionId(activeSessionId);
        clearStoredConversationState();
        window.sessionStorage.setItem(sessionKey(), activeSessionId);
      }

      setChatMessages(function (current) {
        return current.concat([
          {
            role: "user",
            content: trimmed,
          },
        ]);
      });
      setInput("");
      setLoading(true);
      setError("");

      fetch(config.restUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          session_id: activeSessionId,
          message: trimmed,
          source_page_url: window.location.href,
          user_identifier: "",
        }),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error(result.data && result.data.message ? result.data.message : config.strings.error);
          }

          if (result.data.conversation_id) {
            setConversationId(result.data.conversation_id);
          }

          touchConversationActivity();

          setChatMessages(function (current) {
            return current.concat([
              {
                role: "assistant",
                content: result.data.reply || config.strings.error,
                sources: result.data.sources || [],
              },
            ]);
          });
        })
        .catch(function (requestError) {
          setError(requestError.message || config.strings.error);
        })
        .finally(function () {
          setLoading(false);
        });
    }

    function startBrief() {
      if (!config.leadFlow || !config.leadFlow.enabled || !leadQuestions.length) {
        return;
      }

      setMode("brief");
      setOpen(true);

      if (briefStarted) {
        return;
      }

      setBriefStarted(true);
      setBriefMessages(function (current) {
        return current.concat([
          {
            role: "assistant",
            content: leadQuestions[0].label,
          },
        ]);
      });
    }

    function submitBrief() {
      var currentQuestion = leadQuestions[briefIndex];
      if (!currentQuestion || loading) {
        return;
      }

      var trimmed = input.trim();
      if (currentQuestion.required && !trimmed) {
        setError("This answer is required.");
        return;
      }

      if (trimmed.length > MAX_BRIEF_ANSWER_LENGTH) {
        setError("Odpoveď je príliš dlhá. Skráťte ju prosím na maximálne " + MAX_BRIEF_ANSWER_LENGTH + " znakov.");
        return;
      }

      var nextAnswers = briefAnswers.concat([
        {
          field_id: currentQuestion.id,
          label: currentQuestion.label,
          value: trimmed,
        },
      ]);

      setBriefAnswers(nextAnswers);
      setBriefMessages(function (current) {
        return current.concat([
          {
            role: "user",
            content: trimmed || "—",
          },
        ]);
      });
      setInput("");
      setError("");

      if (briefIndex < leadQuestions.length - 1) {
        var nextQuestion = leadQuestions[briefIndex + 1];
        setBriefIndex(briefIndex + 1);
        setBriefMessages(function (current) {
          return current.concat([
            {
              role: "assistant",
              content: nextQuestion.label,
            },
          ]);
        });
        return;
      }

      setLoading(true);
      fetch(config.leadSubmitUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: leadConversationId,
          session_id: sessionId,
          source_page_url: window.location.href,
          answers: nextAnswers,
        }),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error(result.data && result.data.message ? result.data.message : config.strings.error);
          }

          if (result.data.conversation_id) {
            setLeadConversationId(result.data.conversation_id);
          }

          touchConversationActivity();

          setBriefSubmitted(true);
          setBriefMessages(function (current) {
            return current.concat([
              {
                role: "assistant",
                content: result.data.message || config.leadFlow.successMessage || "Brief je zachytený. Ďakujeme, čoskoro sa vám ozveme.",
                sources: [],
              },
            ]);
          });
        })
        .catch(function (requestError) {
          setError(requestError.message || config.strings.error);
        })
        .finally(function () {
          setLoading(false);
        });
    }

    function handlePrimaryAction() {
      if (mode === "brief") {
        if (!briefStarted) {
          startBrief();
          return;
        }

        if (!briefSubmitted) {
          submitBrief();
        }
        return;
      }

      sendChatMessage();
    }

    function handleSourceAction(action) {
      if (action !== "brief" || !config.leadFlow || !config.leadFlow.enabled) {
        return;
      }

      setOpen(true);
      setMode("brief");
      startBrief();
    }

    function renderBody() {
      if (mode === "brief" && !briefStarted) {
        return h(
          "div",
          { className: "nastroje-brief-intro" },
          h("strong", null, config.leadFlow.formName || "Brief"),
          h("p", null, config.leadFlow.introMessage),
          h(
            "button",
            {
              className: "nastroje-chat-send",
              type: "button",
              onClick: startBrief,
            },
            config.leadFlow.ctaLabel || config.strings.startBrief
          )
        );
      }

      return h(
        "div",
        { className: "nastroje-chat-messages", ref: messagesRef },
        (mode === "brief" ? briefMessages : chatMessages).map(function (message, index) {
          return h(Message, {
            key: mode + "-" + message.role + "-" + index + "-" + message.content.slice(0, 12),
            message: message,
            onSourceAction: handleSourceAction,
          });
        }),
        loading ? h("div", { className: "nastroje-chat-typing" }, mode === "brief" ? "Ukladám brief..." : "AI asistent píše...") : null
      );
    }

    function renderComposer() {
      if (mode === "brief" && (!briefStarted || briefSubmitted)) {
        return h(
          "footer",
          { className: "nastroje-chat-footer" },
          error ? h("div", { className: "nastroje-chat-error" }, error) : null,
          h(
            "div",
            { className: "nastroje-chat-actions" },
            h(
              "button",
              {
                className: "nastroje-chat-send",
                type: "button",
                onClick: briefSubmitted ? resetAll : startBrief,
              },
              briefSubmitted ? config.strings.newChat : (config.leadFlow.ctaLabel || config.strings.startBrief)
            ),
            h("small", null, config.privacyNotice)
          )
        );
      }

      var question = mode === "brief" ? leadQuestions[briefIndex] : null;
      var placeholder = question && question.placeholder ? question.placeholder : config.strings.placeholder;
      var inputLimit = mode === "brief" ? MAX_BRIEF_ANSWER_LENGTH : MAX_CHAT_MESSAGE_LENGTH;

      return h(
        "footer",
        { className: "nastroje-chat-footer" },
        error ? h("div", { className: "nastroje-chat-error" }, error) : null,
        question && question.options && question.options.length
          ? h(
              "div",
              { className: "nastroje-option-list" },
              question.options.map(function (option) {
                return h(
                  "button",
                  {
                    className: "nastroje-option-button",
                    key: option,
                    type: "button",
                    onClick: function () {
                      setInput(limitText(option, mode === "brief" ? MAX_BRIEF_ANSWER_LENGTH : MAX_CHAT_MESSAGE_LENGTH));
                    },
                  },
                  option
                );
              })
            )
          : null,
        question && question.type !== "textarea" && mode === "brief"
          ? h("input", {
              className: "nastroje-chat-input",
              type: question.type === "email" ? "email" : "text",
              value: input,
              placeholder: placeholder,
              maxLength: MAX_BRIEF_ANSWER_LENGTH,
              onChange: function (event) {
                setInput(limitText(event.target.value, MAX_BRIEF_ANSWER_LENGTH));
              },
            })
          : h("textarea", {
              rows: 3,
              value: input,
              placeholder: placeholder,
              maxLength: inputLimit,
              onChange: function (event) {
                setInput(limitText(event.target.value, inputLimit));
              },
            }),
        h(
          "div",
          { className: "nastroje-chat-actions" },
          h(
            "button",
            {
              className: "nastroje-chat-send",
              type: "button",
              onClick: handlePrimaryAction,
              disabled: loading || (mode === "chat" && !input.trim()),
            },
            mode === "brief" ? config.strings.next : config.strings.send
          ),
          h("small", null, config.privacyNotice + " · " + input.length + "/" + inputLimit)
        )
      );
    }

    return h(
      "div",
      {
        className: "nastroje-chat-shell nastroje-chat-shell--" + props.surface,
        style: widgetStyle,
      },
      isFloating
        ? h(
            "button",
            {
              className: "nastroje-chat-bubble",
              type: "button",
              onClick: function () {
                setOpen(!open);
              },
            },
            open
              ? "×"
              : config.iconUrl
                ? h("img", {
                    src: config.iconUrl,
                    alt: config.assistantName,
                    className: "nastroje-chat-bubble-icon",
                  })
                : "AI"
          )
        : null,
      open
        ? h(
            "section",
            { className: "nastroje-chat-panel" },
            h(
              "header",
              { className: "nastroje-chat-header" },
              h(
                "div",
                { className: "nastroje-chat-header-title" },
                config.iconUrl
                  ? h("img", {
                      src: config.iconUrl,
                      alt: config.assistantName,
                      className: "nastroje-chat-header-icon",
                    })
                  : null,
                h("strong", null, props.title || config.assistantName),
                h(
                  "span",
                  null,
                  mode === "brief"
                    ? (config.leadFlow.formName || "Brief assistant")
                    : config.language.toUpperCase() + " assistant"
                )
              ),
              h(
                "button",
                {
                  className: "nastroje-chat-reset",
                  type: "button",
                  onClick: resetAll,
                },
                config.strings.newChat
              )
            ),
            h(ModeTabs, {
              mode: mode,
              onChange: function (nextMode) {
                setMode(nextMode);
              },
            }),
            renderBody(),
            renderComposer()
          )
        : null
    );
  }

  document.querySelectorAll(".nastroje-ai-widget-root").forEach(function (root) {
    element.render(
      h(ChatWidget, {
        surface: root.getAttribute("data-surface") === "floating" ? "floating" : "shortcode",
        title: root.getAttribute("data-title") || "",
      }),
      root
    );
  });
})();
