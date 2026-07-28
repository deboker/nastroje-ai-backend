(function () {
  "use strict";

  var config = window.ColourbondChatbotConfig || {};
  var PROXY_URL = config.proxyUrl || "/colourbond-chatbot-proxy.php";
  var SESSION_STORAGE_KEY = "colourbond-ai-session-id";
  var translations = {
    cs: {
      assistantName: "Produktový poradce COLOUR BOND",
      subtitle: "Pomohu s produkty, použitím i objednávkou.",
      welcome: "Dobrý den, jsem AI produktový poradce COLOUR BOND. Pomohu vám s výběrem produktu, jeho použitím, objednávkou nebo základními technickými dotazy. S čím vám mohu pomoci?",
      open: "Otevřít chat", close: "Zavřít chat", placeholder: "Napište dotaz...", send: "Odeslat", loading: "Čekám...",
      notice: "Jste v kontaktu s AI poradcem. Neposílejte hesla ani citlivé údaje; odpovědi jsou pouze informativní.",
      unavailable: "AI poradce se nepodařilo načíst. Zkuste dotaz odeslat znovu za chvíli.",
      preparing: "AI poradce připravuje odpověď…",
      slowLoading: "První odpověď může chvíli trvat. Děkujeme za trpělivost…",
      emptyReply: "Omlouvám se, nepodařilo se mi načíst odpověď.", productLink: "Zobrazit produkt",
      contactMessage: "Telefonická podpora momentálně není k dispozici. Napište nám na info@colourbond.cz nebo použijte kontaktní formulář.",
      email: "Napsat na info@colourbond.cz", contactForm: "Otevřít kontaktní formulář", helpfulContact: "Kontaktní formulář", videos: "Aplikační videa",
      contactUrl: "/kontaktujte-nas", videosUrl: "/content/6-videa",
      actions: [
        ["Vybrat vhodný produkt", "Pomozte mi vybrat vhodný produkt COLOUR BOND."],
        ["Jak produkt použít", "Potřebuji poradit s použitím produktu."],
        ["Objednávka a doprava", "Mám dotaz k objednávce nebo dopravě."],
        ["Reklamace a vrácení", "Potřebuji informace o reklamaci nebo vrácení zboží."],
        ["Napsat zprávu", null]
      ]
    },
    en: {
      assistantName: "COLOUR BOND Product Adviser",
      subtitle: "Help with products, use, and orders.",
      welcome: "Hello, I am the COLOUR BOND AI Product Adviser. I can help you choose a product, understand its use, or answer basic questions about orders and applications. How can I help?",
      open: "Open chat", close: "Close chat", placeholder: "Type your question...", send: "Send", loading: "Waiting...",
      notice: "You are chatting with an AI adviser. Do not send passwords or sensitive data; answers are informational only.",
      unavailable: "The AI adviser could not be loaded. Please try sending your question again shortly.",
      preparing: "The AI adviser is preparing a response…",
      slowLoading: "The first response may take a moment. Thank you for your patience…",
      emptyReply: "Sorry, I could not load a response.", productLink: "View product",
      contactMessage: "Telephone support is currently unavailable. Please email us at info@colourbond.cz or use the contact form.",
      email: "Email info@colourbond.cz", contactForm: "Open contact form", helpfulContact: "Contact form", videos: "Application videos",
      contactUrl: "/en/contact-us", videosUrl: "/en/content/6-videos",
      actions: [
        ["Choose a product", "Please help me choose a suitable COLOUR BOND product."],
        ["How to use a product", "I need advice on how to use a product."],
        ["Orders and delivery", "I have a question about an order or delivery."],
        ["Complaints and returns", "I need information about a complaint or returning goods."],
        ["Contact support", null]
      ]
    }
  };
  var language = detectLanguage();
  var t = translations[language];
  var conversationId = null;
  var sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY) || createId("session");
  var isSending = false;
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);

  function detectLanguage() {
    var htmlLanguage = String(document.documentElement.lang || "").toLowerCase();
    var classes = document.body ? document.body.classList : null;
    return htmlLanguage.indexOf("en") === 0 || (classes && classes.contains("lang-en")) ? "en" : "cs";
  }
  function createId(prefix) {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? prefix + "-" + window.crypto.randomUUID()
      : prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }
  function createWidget() {
    if (document.getElementById("colourbond-ai-chatbot")) return;
    var root = document.createElement("div");
    root.id = "colourbond-ai-chatbot";
    root.innerHTML = '<div id="colourbond-ai-window"><div class="colourbond-ai-header"><div class="colourbond-ai-header-content"><p class="colourbond-ai-title"></p><p class="colourbond-ai-subtitle"></p></div><button id="colourbond-ai-close" type="button">×</button></div><div id="colourbond-ai-messages" aria-live="polite"></div><form class="colourbond-ai-form" id="colourbond-ai-form"><input id="colourbond-ai-input" type="text" autocomplete="off" maxlength="2000"><button id="colourbond-ai-send" type="submit"></button></form><p class="colourbond-ai-notice"></p></div><button id="colourbond-ai-button" type="button"><svg class="colourbond-ai-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.8C4 4.8 4.8 4 5.8 4h12.4c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H9.4L5 20v-4.2c-.6-.3-1-.9-1-1.6V5.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.5" cy="10" r="1.1" fill="currentColor"/><circle cx="12" cy="10" r="1.1" fill="currentColor"/><circle cx="15.5" cy="10" r="1.1" fill="currentColor"/></svg></button>';
    document.body.appendChild(root);
    root.querySelector(".colourbond-ai-title").textContent = config.assistantName || t.assistantName;
    root.querySelector(".colourbond-ai-subtitle").textContent = t.subtitle;
    root.querySelector(".colourbond-ai-notice").textContent = t.notice;
    var openButton = document.getElementById("colourbond-ai-button");
    var closeButton = document.getElementById("colourbond-ai-close");
    var input = document.getElementById("colourbond-ai-input");
    var sendButton = document.getElementById("colourbond-ai-send");
    closeButton.setAttribute("aria-label", t.close); openButton.setAttribute("aria-label", t.open);
    input.placeholder = t.placeholder; sendButton.textContent = t.send;
    closeButton.addEventListener("click", function () { root.classList.remove("is-open"); });
    openButton.addEventListener("click", function () {
      root.classList.toggle("is-open");
      if (!root.classList.contains("is-open")) return;
      input.focus();
      if (!root.getAttribute("data-welcomed")) {
        addMessage("bot", t.welcome); addQuickActions(); addHelpfulLinks(); root.setAttribute("data-welcomed", "1");
      }
    });
    document.getElementById("colourbond-ai-form").addEventListener("submit", function (event) {
      event.preventDefault(); var message = input.value.trim();
      if (!message || isSending) return; input.value = ""; sendMessage(message);
    });
  }
  function addMessage(type, text) {
    var messages = document.getElementById("colourbond-ai-messages"); if (!messages) return;
    var item = document.createElement("div"); item.className = "colourbond-ai-message " + type; item.textContent = text;
    messages.appendChild(item);
    return item;
  }
  function scrollToAssistantMessage(item) {
    var messages = document.getElementById("colourbond-ai-messages");
    if (!messages || !item) return;
    window.requestAnimationFrame(function () {
      var messagesRect = messages.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      messages.scrollTo({ top: messages.scrollTop + itemRect.top - messagesRect.top - 16, behavior: "smooth" });
    });
  }
  function addQuickActions() {
    var messages = document.getElementById("colourbond-ai-messages"); if (!messages) return;
    var container = document.createElement("div"); container.className = "colourbond-ai-quick-actions";
    t.actions.forEach(function (action) {
      var button = document.createElement("button"); button.type = "button"; button.textContent = action[0];
      button.addEventListener("click", function () { action[1] ? sendMessage(action[1], action[0]) : showContact(action[0]); });
      container.appendChild(button);
    }); messages.appendChild(container);
  }
  function addHelpfulLinks() {
    var messages = document.getElementById("colourbond-ai-messages"); if (!messages) return;
    var container = document.createElement("div"); container.className = "colourbond-ai-help-links";
    addAnchor(container, t.contactUrl, t.helpfulContact); addAnchor(container, t.videosUrl, t.videos); messages.appendChild(container);
  }
  function addAnchor(parent, href, label) {
    if (!isSafeLinkUrl(href)) return; var link = document.createElement("a"); link.href = href; link.textContent = label; parent.appendChild(link);
  }
  function addProductCards(products) {
    var messages = document.getElementById("colourbond-ai-messages"); if (!messages || !Array.isArray(products)) return;
    var container = document.createElement("div"); container.className = "colourbond-ai-products";
    products.slice(0, 4).forEach(function (product) {
      if (!product || !product.title) return;
      var card = document.createElement("article"); card.className = "colourbond-ai-product-card";
      if (isSafeHttpUrl(product.image_url)) { var image = document.createElement("img"); image.className = "colourbond-ai-product-image"; image.src = product.image_url; image.alt = product.title; image.loading = "lazy"; card.appendChild(image); }
      var body = document.createElement("div"); body.className = "colourbond-ai-product-body";
      appendText(body, "h3", "colourbond-ai-product-title", product.title);
      if (product.reason) appendText(body, "p", "colourbond-ai-product-reason", product.reason);
      if (isSafeHttpUrl(product.url)) addAnchor(body, product.url, t.productLink);
      card.appendChild(body); container.appendChild(card);
    });
    if (container.childNodes.length) messages.appendChild(container);
  }
  function appendText(parent, tag, className, text) { var element = document.createElement(tag); element.className = className; element.textContent = String(text); parent.appendChild(element); }
  function addResponseLinks(links) {
    var messages = document.getElementById("colourbond-ai-messages"); if (!messages || !Array.isArray(links)) return;
    var container = document.createElement("div"); container.className = "colourbond-ai-response-links";
    links.forEach(function (item) {
      if (!item || !item.label) return;
      if (container.childNodes.length) container.appendChild(document.createElement("br"));
      addAnchor(container, item.url, item.label);
    });
    if (container.childNodes.length) messages.appendChild(container);
  }
  function isSafeHttpUrl(value) { if (typeof value !== "string" || !value.trim()) return false; try { var url = new URL(value, window.location.origin); return url.protocol === "https:" || url.protocol === "http:"; } catch (error) { return false; } }
  function isSafeLinkUrl(value) { if (typeof value !== "string" || !value.trim()) return false; try { var url = new URL(value, window.location.origin); return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"; } catch (error) { return false; } }
  function normalize(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function isContactRequest(message) { return /\b(kontakt\w*|email\w*|e-mail|mail\w*|telefon\w*|phone\w*|salesperson|prodejc\w*|podpor\w*|support|reklamac\w*|complaint\w*|return\w*|vraceni\w*)\b/.test(normalize(message)); }
  function showContact(displayMessage) {
    if (displayMessage) addMessage("user", displayMessage);
    var assistantMessage = addMessage("bot", t.contactMessage);
    addResponseLinks([{ label: t.email, url: "mailto:info@colourbond.cz" }, { label: t.contactForm, url: t.contactUrl }]);
    scrollToAssistantMessage(assistantMessage);
  }
  function setLoading(loading) {
    isSending = loading; var button = document.getElementById("colourbond-ai-send"); var input = document.getElementById("colourbond-ai-input");
    if (button) { button.disabled = loading; button.textContent = loading ? t.loading : t.send; } if (input) input.disabled = loading;
  }
  function sendMessage(message, displayMessage) {
    if (isSending) return Promise.resolve();
    addMessage("user", displayMessage || message);
    if (isContactRequest(message)) { showContact(); return Promise.resolve(); }
    setLoading(true);
    var loadingMessage = addMessage("bot", t.preparing);
    var slowTimer = window.setTimeout(function () { if (loadingMessage && loadingMessage.parentNode) loadingMessage.textContent = t.slowLoading; }, 15000);

    function request(attempt, retriedAfterConflict) {
      var controller = window.AbortController ? new AbortController() : null;
      var timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 60000) : null;
      return fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller ? controller.signal : undefined, body: JSON.stringify({ message: message, conversation_id: conversationId, session_id: sessionId, language: language, assistant_name: t.assistantName, source_page_url: window.location.href }) })
        .then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) { var error = new Error(data.error || "Chat request failed."); error.status = response.status; throw error; } return data; }); })
        .then(function (data) { if (loadingMessage && loadingMessage.parentNode) loadingMessage.parentNode.removeChild(loadingMessage); conversationId = data.conversationId || data.conversation_id || conversationId; var assistantMessage = addMessage("bot", data.reply || t.emptyReply); addProductCards(data.products); addResponseLinks(data.links); scrollToAssistantMessage(assistantMessage); })
        .catch(function (error) {
          if (error && error.status === 409 && !retriedAfterConflict) { conversationId = null; sessionId = createId("session"); window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId); return request(attempt, true); }
          var retryable = !error || error.name === "AbortError" || error instanceof TypeError || !error.status || error.status === 502 || error.status === 503 || error.status === 504;
          if (attempt === 0 && retryable) { if (loadingMessage && loadingMessage.parentNode) loadingMessage.textContent = t.slowLoading; return request(1, retriedAfterConflict); }
          if (loadingMessage && loadingMessage.parentNode) loadingMessage.parentNode.removeChild(loadingMessage);
          var assistantMessage = addMessage("bot", t.unavailable);
          scrollToAssistantMessage(assistantMessage);
        })
        .finally(function () { if (timeoutId) window.clearTimeout(timeoutId); });
    }

    return request(0, false).finally(function () { window.clearTimeout(slowTimer); setLoading(false); var input = document.getElementById("colourbond-ai-input"); if (input) input.focus(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createWidget); else createWidget();
})();
