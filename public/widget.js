(function () {
  'use strict';

  // ── Config resolution ────────────────────────────────────────────────────
  var settings = window.SupoSettings || {};
  var productId = settings.productId;
  if (!productId) {
    console.warn('[Supo] window.SupoSettings.productId is not set.');
    return;
  }

  // Detect which server this script was loaded from so API calls always go
  // to the right place, regardless of where the widget is embedded.
  var scriptEl = document.currentScript;
  var API_ORIGIN = settings.apiUrl
    || (scriptEl ? new URL(scriptEl.src).origin : location.origin);
  var API_CONFIG = API_ORIGIN + '/api/chat?productId=' + encodeURIComponent(productId);
  var API_CHAT   = API_ORIGIN + '/api/chat';

  // ── Persistence ──────────────────────────────────────────────────────────
  var CONV_KEY = 'supo_conv_' + productId;
  var CUST_KEY = 'supo_cust_' + productId;

  function getConvId()   { return sessionStorage.getItem(CONV_KEY) || null; }
  function setConvId(id) { sessionStorage.setItem(CONV_KEY, id); }
  function getCustomer() {
    try { return JSON.parse(localStorage.getItem(CUST_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setCustomer(c) { localStorage.setItem(CUST_KEY, JSON.stringify(c)); }

  // ── State ────────────────────────────────────────────────────────────────
  var cfg = {
    botName: 'Support',
    greeting: 'Hi there! How can I help you today?',
    accentColor: '#18181b',
    position: 'bottom-right',
    theme: 'dark',
  };
  var messages    = [];  // { role: 'user'|'ai'|'typing', text: string }
  var isOpen      = false;
  var isStreaming  = false;

  // ── DOM bootstrap ────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'supo-widget-host';
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(sel) { return shadow.querySelector(sel); }

  function scrollBottom() {
    var el = $('#supo-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────
  function buildCSS() {
    var a = cfg.accentColor;
    var isDark = cfg.theme === 'dark';
    var isRight = cfg.position !== 'bottom-left';

    var bg       = isDark ? '#18181b' : '#ffffff';
    var border   = isDark ? '#27272a' : '#e4e4e7';
    var msgBg    = isDark ? '#27272a' : '#f4f4f5';
    var text     = isDark ? '#e4e4e7' : '#18181b';
    var muted    = isDark ? '#a1a1aa' : '#71717a';
    var inputBg  = isDark ? '#27272a' : '#f4f4f5';
    var pos      = isRight ? 'right' : 'left';

    return [
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      ':host { position: fixed; ' + pos + ': 20px; bottom: 20px; z-index: 2147483647;',
      '  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',

      '#supo-bubble {',
      '  width: 52px; height: 52px; border-radius: 50%; background: ' + a + ';',
      '  border: none; cursor: pointer; display: flex; align-items: center;',
      '  justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.25);',
      '  transition: transform .2s, box-shadow .2s; }',
      '#supo-bubble:hover { transform: scale(1.07); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }',
      '#supo-bubble svg { pointer-events: none; }',

      '#supo-panel {',
      '  position: absolute; bottom: 64px; ' + pos + ': 0;',
      '  width: 340px; max-height: 540px; background: ' + bg + ';',
      '  border: 1px solid ' + border + '; border-radius: 16px;',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.2);',
      '  transition: opacity .2s, transform .2s; }',
      '#supo-panel.supo-hidden { opacity: 0; pointer-events: none; transform: translateY(10px); }',

      '#supo-head {',
      '  background: ' + a + '; padding: 11px 14px;',
      '  display: flex; align-items: center; gap: 9px; flex-shrink: 0; }',
      '#supo-head-icon { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.2);',
      '  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
      '#supo-head-name { font-size: 13px; font-weight: 600; color: #fff; flex: 1; }',
      '#supo-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,.8);',
      '  padding: 2px; display: flex; line-height: 1; }',
      '#supo-close:hover { color: #fff; }',

      '#supo-msgs {',
      '  flex: 1; overflow-y: auto; padding: 12px; display: flex;',
      '  flex-direction: column; gap: 8px; scroll-behavior: smooth; }',
      '#supo-msgs::-webkit-scrollbar { width: 4px; }',
      '#supo-msgs::-webkit-scrollbar-thumb { background: ' + border + '; border-radius: 2px; }',

      '.supo-msg { display: flex; flex-direction: column; max-width: 82%; }',
      '.supo-msg.supo-user { align-self: flex-end; align-items: flex-end; }',
      '.supo-msg.supo-ai   { align-self: flex-start; align-items: flex-start; }',
      '.supo-bub {',
      '  padding: 8px 11px; border-radius: 12px; font-size: 13px;',
      '  line-height: 1.5; word-break: break-word; white-space: pre-wrap; }',
      '.supo-user .supo-bub { background: ' + a + '; color: #fff; border-bottom-right-radius: 4px; }',
      '.supo-ai   .supo-bub { background: ' + msgBg + '; color: ' + text + '; border-bottom-left-radius: 4px; }',

      '.supo-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;',
      '  background: ' + muted + '; animation: supo-blink 1.2s infinite; margin: 0 1px; }',
      '.supo-dot:nth-child(2) { animation-delay: .2s; }',
      '.supo-dot:nth-child(3) { animation-delay: .4s; }',
      '@keyframes supo-blink { 0%,80%,100% { opacity:.2; } 40% { opacity:1; } }',

      '#supo-id-form {',
      '  flex: 1; padding: 22px 16px; display: flex; flex-direction: column; gap: 11px;',
      '  justify-content: center; }',
      '#supo-id-form h3 { font-size: 14px; font-weight: 600; color: ' + text + '; }',
      '#supo-id-form p  { font-size: 12px; color: ' + muted + '; }',
      '.supo-inp {',
      '  width: 100%; padding: 8px 11px; border: 1px solid ' + border + ';',
      '  border-radius: 8px; background: ' + inputBg + '; color: ' + text + ';',
      '  font-size: 13px; outline: none; font-family: inherit; }',
      '.supo-inp:focus { border-color: ' + a + '; }',
      '.supo-inp.supo-error { border-color: #ef4444; }',
      '#supo-id-btn {',
      '  padding: 9px; border-radius: 8px; border: none; cursor: pointer;',
      '  background: ' + a + '; color: #fff; font-size: 13px; font-weight: 500;',
      '  font-family: inherit; }',
      '#supo-id-btn:hover { opacity: .9; }',

      '#supo-composer {',
      '  padding: 9px 10px; border-top: 1px solid ' + border + ';',
      '  display: flex; gap: 7px; align-items: flex-end; flex-shrink: 0; }',
      '#supo-input {',
      '  flex: 1; padding: 7px 10px; border: 1px solid ' + border + ';',
      '  border-radius: 10px; background: ' + inputBg + '; color: ' + text + ';',
      '  font-size: 13px; resize: none; outline: none; max-height: 96px;',
      '  line-height: 1.45; font-family: inherit; }',
      '#supo-input:focus { border-color: ' + a + '; }',
      '#supo-input::placeholder { color: ' + muted + '; }',
      '#supo-send {',
      '  padding: 7px 12px; background: ' + a + '; color: #fff; border: none;',
      '  border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 500;',
      '  height: 34px; flex-shrink: 0; font-family: inherit; }',
      '#supo-send:hover:not(:disabled) { opacity: .9; }',
      '#supo-send:disabled { opacity: .45; cursor: default; }',

      '#supo-powered {',
      '  text-align: center; padding: 3px 0 8px;',
      '  font-size: 10px; color: ' + muted + '; flex-shrink: 0; }',
      '#supo-powered a { color: ' + muted + '; text-decoration: none; }',
      '#supo-powered a:hover { color: ' + text + '; }',
    ].join('\n');
  }

  // ── SVG icons ────────────────────────────────────────────────────────────
  var ICON_CHAT  = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  var ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_X_SM  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_MSG_SM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    var customer = getCustomer();
    shadow.innerHTML =
      '<style>' + buildCSS() + '</style>' +
      renderPanel(customer) +
      renderBubble();
    bindEvents();
    scrollBottom();
  }

  function renderBubble() {
    return (
      '<button id="supo-bubble" aria-label="Open support chat">' +
      (isOpen ? ICON_CLOSE : ICON_CHAT) +
      '</button>'
    );
  }

  function renderPanel(customer) {
    return (
      '<div id="supo-panel" class="' + (isOpen ? '' : 'supo-hidden') + '">' +
      renderHeader() +
      (customer ? renderChat() : renderIdForm()) +
      '<div id="supo-powered"><a href="https://supo.app" target="_blank" rel="noopener">Powered by Supo</a></div>' +
      '</div>'
    );
  }

  function renderHeader() {
    return (
      '<div id="supo-head">' +
      '<div id="supo-head-icon">' + ICON_MSG_SM + '</div>' +
      '<span id="supo-head-name">' + esc(cfg.botName) + '</span>' +
      '<button id="supo-close" aria-label="Close">' + ICON_X_SM + '</button>' +
      '</div>'
    );
  }

  function renderChat() {
    var html = '<div id="supo-msgs">';

    if (messages.length === 0) {
      html += '<div class="supo-msg supo-ai"><div class="supo-bub">' + esc(cfg.greeting) + '</div></div>';
    }

    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'user') {
        html += '<div class="supo-msg supo-user"><div class="supo-bub">' + esc(m.text) + '</div></div>';
      } else if (m.role === 'ai') {
        html += '<div class="supo-msg supo-ai"><div class="supo-bub supo-ai-bub">' + esc(m.text) + '</div></div>';
      } else if (m.role === 'typing') {
        html += '<div class="supo-msg supo-ai"><div class="supo-bub"><span class="supo-dot"></span><span class="supo-dot"></span><span class="supo-dot"></span></div></div>';
      }
    }

    html += '</div>';
    html +=
      '<div id="supo-composer">' +
      '<textarea id="supo-input" placeholder="Ask a question…" rows="1"' +
      (isStreaming ? ' disabled' : '') + '></textarea>' +
      '<button id="supo-send"' + (isStreaming ? ' disabled' : '') + '>Send</button>' +
      '</div>';

    return html;
  }

  function renderIdForm() {
    return (
      '<div id="supo-id-form">' +
      '<h3>Start a conversation</h3>' +
      '<p>Enter your details so we can help you.</p>' +
      '<input id="supo-name"  class="supo-inp" type="text"  placeholder="Your name"  autocomplete="name" />' +
      '<input id="supo-email" class="supo-inp" type="email" placeholder="Your email" autocomplete="email" />' +
      '<button id="supo-id-btn">Start chat</button>' +
      '</div>'
    );
  }

  // ── Events ───────────────────────────────────────────────────────────────
  function bindEvents() {
    $('#supo-bubble').addEventListener('click', toggleOpen);

    var closeBtn = $('#supo-close');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      isOpen = false; render();
    });

    var idBtn = $('#supo-id-btn');
    if (idBtn) {
      idBtn.addEventListener('click', submitId);
      var emailInput = $('#supo-email');
      if (emailInput) emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitId();
      });
    }

    var sendBtn = $('#supo-send');
    var inputEl = $('#supo-input');
    if (sendBtn && inputEl) {
      sendBtn.addEventListener('click', send);
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      inputEl.addEventListener('input', function () {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
      });
    }
  }

  function toggleOpen() {
    isOpen = !isOpen;
    render();
    if (isOpen) {
      var inputEl = $('#supo-input');
      if (inputEl) setTimeout(function () { inputEl.focus(); }, 50);
    }
  }

  function submitId() {
    var nameEl  = $('#supo-name');
    var emailEl = $('#supo-email');
    var name    = nameEl  ? nameEl.value.trim()  : '';
    var email   = emailEl ? emailEl.value.trim() : '';

    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name)    { nameEl.classList.add('supo-error');  return; }
    if (!emailOk) { emailEl.classList.add('supo-error'); return; }

    setCustomer({ name: name, email: email });
    render();
  }

  function send() {
    if (isStreaming) return;
    var inputEl = $('#supo-input');
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    messages.push({ role: 'user', text: text });
    messages.push({ role: 'typing' });
    isStreaming = true;
    render();

    var customer = getCustomer();

    fetch(API_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: productId,
        message: text,
        conversationId: getConvId() || undefined,
        customer: customer,
      }),
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var convId = res.headers.get('x-conversation-id');
      if (convId) setConvId(convId);

      // Replace typing indicator with an empty AI bubble
      messages[messages.length - 1] = { role: 'ai', text: '' };
      render();

      // Stream chunks into the last bubble without re-rendering the whole panel
      var reader  = res.body.getReader();
      var decoder = new TextDecoder();

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            isStreaming = false;
            var sendBtn = $('#supo-send');
            var inp = $('#supo-input');
            if (sendBtn) sendBtn.disabled = false;
            if (inp) inp.disabled = false;
            return;
          }
          var chunk = decoder.decode(result.value, { stream: true });
          messages[messages.length - 1].text += chunk;
          // Update the AI bubble in-place — avoids full re-render on every chunk
          var bubbles = shadow.querySelectorAll('.supo-ai-bub');
          if (bubbles.length > 0) {
            bubbles[bubbles.length - 1].textContent = messages[messages.length - 1].text;
          }
          scrollBottom();
          return pump();
        });
      }

      return pump();
    })
    .catch(function () {
      messages[messages.length - 1] = { role: 'ai', text: 'Something went wrong. Please try again.' };
      isStreaming = false;
      render();
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // Fetch widget config (bot name, theme, accent color, etc.) then render.
    // Falls back to defaults if the request fails so the widget always loads.
    fetch(API_CONFIG)
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (data) {
        cfg = Object.assign(cfg, data);
        render();
      })
      .catch(function () {
        render(); // render with defaults
      });
  }

  init();
})();
