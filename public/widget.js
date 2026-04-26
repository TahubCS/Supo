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
  var API_CONFIG    = API_ORIGIN + '/api/chat?productId=' + encodeURIComponent(productId);
  var API_CHAT      = API_ORIGIN + '/api/chat';
  var API_ESCALATE  = API_ORIGIN + '/api/chat/escalate';
  var API_POLL      = API_ORIGIN + '/api/messages/poll';
  var API_ABLY_TOKEN = API_ORIGIN + '/api/ably/token';

  // ── Persistence ──────────────────────────────────────────────────────────
  var CONV_KEY = 'supo_conv_' + productId;
  var CUST_KEY = 'supo_cust_' + productId;

  function customerConvKey(customer) {
    var email = customer && customer.email ? String(customer.email).trim().toLowerCase() : 'anonymous';
    return CONV_KEY + '_' + email;
  }
  function getConvId(customer) {
    return localStorage.getItem(customerConvKey(customer))
      || sessionStorage.getItem(CONV_KEY)
      || null;
  }
  function setConvId(id, customer) {
    localStorage.setItem(customerConvKey(customer), id);
    sessionStorage.setItem(CONV_KEY, id);
  }
  function getCustomer() {
    try { return JSON.parse(localStorage.getItem(CUST_KEY) || 'null'); }
    catch { return null; }
  }
  function setCustomer(c) {
    if (c && c.email) c.email = String(c.email).trim().toLowerCase();
    localStorage.setItem(CUST_KEY, JSON.stringify(c));
  }

  // ── State ────────────────────────────────────────────────────────────────
  var cfg = {
    botName: 'Support',
    greeting: 'Hi there! How can I help you today?',
    accentColor: '#18181b',
    position: 'bottom-right',
    theme: 'dark',
  };
  var messages = [];
  // 'idle'          — normal, textarea enabled
  // 'streaming'     — AI streaming, textarea disabled
  // 'waiting_agent' — escalation pending, textarea locked, polling active
  // 'agent_active'  — agent connected, textarea enabled, polling active
  var widgetState = 'idle';
  var isOpen      = false;

  // ── Polling ──────────────────────────────────────────────────────────────
  var pollTimer   = null;
  var lastSeenAt  = null; // ISO string — timestamp of the last message we've seen

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(doPoll, 4000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function doPoll() {
    var customer = getCustomer();
    var convId   = getConvId(customer);
    if (!convId) return;

    var url = API_POLL
      + '?conversationId=' + encodeURIComponent(convId)
      + '&productId='      + encodeURIComponent(productId)
      + '&since='          + encodeURIComponent(lastSeenAt || new Date(0).toISOString());

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;

        // Advance state machine based on escalation status from server
        if (data.escalationStatus === 'active' && widgetState === 'waiting_agent') {
          widgetState = 'agent_active';
          render();
        } else if (data.escalationStatus === null && widgetState !== 'idle' && widgetState !== 'streaming') {
          // Conversation was resolved/reset — return to idle
          widgetState = 'idle';
          stopPolling();
          render();
        }

        // Append any new agent messages
        if (data.messages && data.messages.length > 0) {
          var added = false;
          data.messages.forEach(function (m) {
            if (m.senderType === 'agent') {
              messages.push({ role: 'agent', text: m.body });
              added = true;
            }
          });
          lastSeenAt = data.messages[data.messages.length - 1].createdAt;
          if (added) render();
        }
      })
      .catch(function () { /* network hiccup — retry next tick */ });
  }

  // ── Ably real-time ───────────────────────────────────────────────────────
  var ablyClient   = null;
  var ablyConvId   = null; // conversation ID currently subscribed to

  function closeAblyClient() {
    if (!ablyClient) return;
    try {
      var closeResult = ablyClient.close();
      if (closeResult && typeof closeResult.catch === 'function') {
        closeResult.catch(function () {});
      }
    } catch {
      // Ignore expected disconnect races during reloads or reconnects.
    }
  }

  // Lazily loads the Ably CDN bundle, then calls callback().
  // Falls back to polling if the CDN is unreachable.
  function loadAblySDK(callback) {
    if (window.Ably) { callback(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.ably.com/lib/ably.min-2.js';
    s.onload = callback;
    s.onerror = function () { startPolling(); };
    document.head.appendChild(s);
  }

  // Subscribes the widget to its conversation channel via Ably WebSocket.
  // Called once we have a convId (from x-conversation-id header or restoreConversation).
  // Polling remains active as the fallback until Ably connects.
  function subscribeToConversation(convId) {
    if (ablyConvId === convId) return; // already subscribed
    ablyConvId = convId;

    loadAblySDK(function () {
      var tokenUrl = API_ABLY_TOKEN
        + '?conversationId=' + encodeURIComponent(convId)
        + '&productId='      + encodeURIComponent(productId);

      try {
        closeAblyClient();
        ablyClient = new window.Ably.Realtime({ authUrl: tokenUrl, authMethod: 'GET' });

        ablyClient.connection.on('connected', function () {
          stopPolling(); // Ably is up — stop the polling fallback
        });

        ablyClient.connection.on('failed', function () {
          startPolling(); // Hard fail — fall back to polling
        });

        ablyClient.connection.on('suspended', function () {
          startPolling(); // Lost connection briefly — resume polling while reconnecting
        });

        ablyClient.connection.on('connected', function () {
          stopPolling(); // Reconnected — stop polling again
        });

        // The token endpoint returns channelName so the widget never has to know orgId.
        fetch(tokenUrl)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !data.channelName) { startPolling(); return; }
            var ch = ablyClient.channels.get(data.channelName);

            var messageSub = ch.subscribe('message', function (msg) {
              var d = msg.data;
              if (d.senderType === 'agent') {
                setMessages(function (prev) {
                  if (prev.some(function (m) { return m.text === d.body && m.role === 'agent'; })) return prev;
                  return prev.concat([{ role: 'agent', text: d.body }]);
                });
                if (widgetState === 'waiting_agent') { widgetState = 'agent_active'; }
                render();
              }
            });
            if (messageSub && typeof messageSub.catch === 'function') {
              messageSub.catch(function () { startPolling(); });
            }

            var escalationSub = ch.subscribe('escalation_update', function (msg) {
              var s = msg.data.status;
              if (s === 'pending')  { widgetState = 'waiting_agent'; render(); }
              if (s === 'active')   { widgetState = 'agent_active';  render(); }
              if (s === null)       { widgetState = 'idle'; stopPolling(); render(); }
            });
            if (escalationSub && typeof escalationSub.catch === 'function') {
              escalationSub.catch(function () { startPolling(); });
            }
          })
          .catch(function () { startPolling(); });
      } catch {
        startPolling();
      }
    });
  }

  // messages array mutation helper used by Ably handler (avoids referencing stale closures).
  function setMessages(updater) {
    messages = updater(messages);
  }

  // ── Escalation trigger ───────────────────────────────────────────────────
  function requestEscalation() {
    var customer = getCustomer();
    var convId   = getConvId(customer);
    if (!convId) return;

    fetch(API_ESCALATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: productId, conversationId: convId, customer: customer }),
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && (data.escalationStatus === 'pending' || data.escalationStatus === 'active')) {
          widgetState = data.escalationStatus === 'active' ? 'agent_active' : 'waiting_agent';
          messages.push({ role: 'system', text: 'Connecting you to an agent…' });
          render();
          doPoll();
          startPolling();
        }
      })
      .catch(function () {
        messages.push({ role: 'system', text: 'Could not connect to an agent. Please try again.' });
        render();
      });
  }

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
    var a      = cfg.accentColor;
    var isDark = cfg.theme === 'dark';
    var isRight = cfg.position !== 'bottom-left';

    var bg      = isDark ? '#18181b' : '#ffffff';
    var border  = isDark ? '#27272a' : '#e4e4e7';
    var msgBg   = isDark ? '#27272a' : '#f4f4f5';
    var agentBg = isDark ? '#1e2a1e' : '#f0fdf4';
    var agentBorder = isDark ? '#2d4a2d' : '#bbf7d0';
    var agentText   = isDark ? '#86efac' : '#166534';
    var sysBg   = isDark ? '#1c1c2e' : '#f5f3ff';
    var sysBorder = isDark ? '#2d2d50' : '#ddd6fe';
    var sysText = isDark ? '#a78bfa' : '#6d28d9';
    var text    = isDark ? '#e4e4e7' : '#18181b';
    var muted   = isDark ? '#a1a1aa' : '#71717a';
    var inputBg = isDark ? '#27272a' : '#f4f4f5';
    var pos     = isRight ? 'right' : 'left';

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
      '#supo-head-status { font-size: 10px; color: rgba(255,255,255,.7); margin-top: 1px; }',
      '#supo-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,.8);',
      '  padding: 2px; display: flex; line-height: 1; }',
      '#supo-close:hover { color: #fff; }',

      // Waiting for agent — animated dots under the header name
      '#supo-connecting { display: flex; align-items: center; gap: 4px; padding: 6px 14px;',
      '  background: rgba(0,0,0,.15); flex-shrink: 0; }',
      '#supo-connecting span { font-size: 11px; color: rgba(255,255,255,.8); }',

      '#supo-msgs {',
      '  flex: 1; overflow-y: auto; padding: 12px; display: flex;',
      '  flex-direction: column; gap: 8px; scroll-behavior: smooth; }',
      '#supo-msgs::-webkit-scrollbar { width: 4px; }',
      '#supo-msgs::-webkit-scrollbar-thumb { background: ' + border + '; border-radius: 2px; }',

      '.supo-msg { display: flex; flex-direction: column; max-width: 82%; }',
      '.supo-msg.supo-user    { align-self: flex-end; align-items: flex-end; }',
      '.supo-msg.supo-ai      { align-self: flex-start; align-items: flex-start; }',
      '.supo-msg.supo-agent   { align-self: flex-start; align-items: flex-start; }',
      '.supo-msg.supo-system  { align-self: center; align-items: center; width: 100%; max-width: 100%; }',

      '.supo-bub {',
      '  padding: 8px 11px; border-radius: 12px; font-size: 13px;',
      '  line-height: 1.5; word-break: break-word; white-space: pre-wrap; }',
      '.supo-user  .supo-bub { background: ' + a + '; color: #fff; border-bottom-right-radius: 4px; }',
      '.supo-ai    .supo-bub { background: ' + msgBg + '; color: ' + text + '; border-bottom-left-radius: 4px; }',
      '.supo-agent .supo-bub { background: ' + agentBg + '; color: ' + agentText + ';',
      '  border: 1px solid ' + agentBorder + '; border-bottom-left-radius: 4px; }',
      '.supo-system .supo-bub { background: ' + sysBg + '; color: ' + sysText + ';',
      '  border: 1px solid ' + sysBorder + '; border-radius: 8px; font-size: 11px;',
      '  text-align: center; width: 100%; }',

      '.supo-sender-label { font-size: 10px; color: ' + muted + '; margin-bottom: 2px; }',
      '.supo-agent .supo-sender-label { color: ' + agentText + '; opacity: .8; }',

      '.supo-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;',
      '  background: ' + muted + '; animation: supo-blink 1.2s infinite; margin: 0 1px; }',
      '.supo-dot:nth-child(2) { animation-delay: .2s; }',
      '.supo-dot:nth-child(3) { animation-delay: .4s; }',
      '@keyframes supo-blink { 0%,80%,100% { opacity:.2; } 40% { opacity:1; } }',

      // Waiting spinner for the connecting banner
      '.supo-spin { display: inline-block; width: 10px; height: 10px; border-radius: 50%;',
      '  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;',
      '  animation: supo-rotate 0.8s linear infinite; }',
      '@keyframes supo-rotate { to { transform: rotate(360deg); } }',

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
      '#supo-input:disabled { opacity: .5; cursor: not-allowed; }',
      '#supo-send {',
      '  padding: 7px 12px; background: ' + a + '; color: #fff; border: none;',
      '  border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 500;',
      '  height: 34px; flex-shrink: 0; font-family: inherit; }',
      '#supo-send:hover:not(:disabled) { opacity: .9; }',
      '#supo-send:disabled { opacity: .45; cursor: default; }',

      // "Speak to an agent" quick-reply button — only shown when AI responds with escalation offer
      '#supo-escalate-btn {',
      '  margin: 0 12px 8px; padding: 8px 14px; border-radius: 8px; cursor: pointer;',
      '  font-size: 12px; font-weight: 500; font-family: inherit;',
      '  background: transparent; border: 1px solid ' + agentBorder + '; color: ' + agentText + ';',
      '  text-align: center; transition: background .15s; }',
      '#supo-escalate-btn:hover { background: ' + agentBg + '; }',

      '#supo-powered {',
      '  text-align: center; padding: 3px 0 8px;',
      '  font-size: 10px; color: ' + muted + '; flex-shrink: 0; }',
      '#supo-powered a { color: ' + muted + '; text-decoration: none; }',
      '#supo-powered a:hover { color: ' + text + '; }',
    ].join('\n');
  }

  // ── SVG icons ────────────────────────────────────────────────────────────
  var ICON_CHAT   = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  var ICON_CLOSE  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_X_SM   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_MSG_SM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  var ICON_AGENT  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

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
    var subtitle = '';
    if (widgetState === 'waiting_agent') {
      subtitle = '<div id="supo-head-status">' +
        '<span class="supo-spin"></span> Connecting to an agent…' +
        '</div>';
    } else if (widgetState === 'agent_active') {
      subtitle = '<div id="supo-head-status">' + ICON_AGENT + ' Agent connected</div>';
    }
    return (
      '<div id="supo-head">' +
      '<div id="supo-head-icon">' + ICON_MSG_SM + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div id="supo-head-name">' + esc(cfg.botName) + '</div>' +
      subtitle +
      '</div>' +
      '<button id="supo-close" aria-label="Close">' + ICON_X_SM + '</button>' +
      '</div>'
    );
  }

  // Whether the last AI message offered escalation — used to show the quick-reply button
  function lastAiOfferedEscalation() {
    for (var i = messages.length - 1; i >= 0; i--) {
      var m = messages[i];
      if (m.role === 'ai') {
        var lower = m.text.toLowerCase();
        return lower.indexOf('human agent') !== -1 ||
               lower.indexOf('connect you') !== -1 ||
               lower.indexOf('live agent') !== -1 ||
               lower.indexOf('support agent') !== -1 ||
               lower.indexOf('speak to') !== -1;
      }
      // Stop looking back if we hit a user or agent message
      if (m.role === 'user' || m.role === 'agent') break;
    }
    return false;
  }

  function renderChat() {
    var html = '<div id="supo-msgs">';
    var isWaiting = widgetState === 'waiting_agent';
    var isAgentActive = widgetState === 'agent_active';
    var isStreaming = widgetState === 'streaming';

    if (messages.length === 0) {
      html += '<div class="supo-msg supo-ai"><div class="supo-bub">' + esc(cfg.greeting) + '</div></div>';
    }

    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'user') {
        html += '<div class="supo-msg supo-user"><div class="supo-bub">' + esc(m.text) + '</div></div>';
      } else if (m.role === 'ai') {
        html += '<div class="supo-msg supo-ai"><div class="supo-bub supo-ai-bub">' + esc(m.text) + '</div></div>';
      } else if (m.role === 'agent') {
        html += '<div class="supo-msg supo-agent">' +
          '<div class="supo-sender-label">Support Agent</div>' +
          '<div class="supo-bub">' + esc(m.text) + '</div>' +
          '</div>';
      } else if (m.role === 'typing') {
        html += '<div class="supo-msg supo-ai"><div class="supo-bub"><span class="supo-dot"></span><span class="supo-dot"></span><span class="supo-dot"></span></div></div>';
      } else if (m.role === 'system') {
        html += '<div class="supo-msg supo-system"><div class="supo-bub">' + esc(m.text) + '</div></div>';
      }
    }

    html += '</div>';

    // Quick-reply "Speak to an Agent" button — shown only when idle and AI offered escalation
    var showEscBtn = widgetState === 'idle' && lastAiOfferedEscalation();
    if (showEscBtn) {
      html += '<button id="supo-escalate-btn">Speak to an Agent</button>';
    }

    // Composer — disabled while streaming or waiting for an agent
    var composerDisabled = isStreaming || isWaiting;
    var placeholder = isWaiting
      ? 'Waiting for an agent…'
      : isAgentActive
        ? 'Reply to agent…'
        : 'Ask a question…';

    html +=
      '<div id="supo-composer">' +
      '<textarea id="supo-input" placeholder="' + placeholder + '" rows="1"' +
      (composerDisabled ? ' disabled' : '') + '></textarea>' +
      '<button id="supo-send"' + (composerDisabled ? ' disabled' : '') + '>Send</button>' +
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

    var escBtn = $('#supo-escalate-btn');
    if (escBtn) escBtn.addEventListener('click', requestEscalation);

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
      // Resume polling when widget is re-opened during an escalation
      if (widgetState === 'waiting_agent' || widgetState === 'agent_active') {
        startPolling();
      }
      var inputEl = $('#supo-input');
      if (inputEl) setTimeout(function () { inputEl.focus(); }, 50);
    } else {
      // Stop polling while widget is closed to save requests
      stopPolling();
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
    if (widgetState === 'streaming' || widgetState === 'waiting_agent') return;
    var inputEl = $('#supo-input');
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    messages.push({ role: 'user', text: text });

    var customer = getCustomer();

    // In agent_active mode the server stores the message and returns a static
    // acknowledgement — no streaming occurs.
    if (widgetState === 'agent_active') {
      render();
      fetch(API_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productId,
          message: text,
          conversationId: getConvId(customer) || undefined,
          customer: customer,
        }),
      }).catch(function () {});
      return;
    }

    messages.push({ role: 'typing' });
    widgetState = 'streaming';
    render();

    fetch(API_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: productId,
        message: text,
        conversationId: getConvId(customer) || undefined,
        customer: customer,
      }),
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var convId = res.headers.get('x-conversation-id');
      if (convId) {
        setConvId(convId, customer);
        subscribeToConversation(convId);
      }

      // Check if the server indicated an escalation is already active
      var escStatus = res.headers.get('x-escalation-status');
      if (escStatus === 'pending' || escStatus === 'active') {
        messages[messages.length - 1] = { role: 'system', text: 'An agent will be with you shortly.' };
        widgetState = escStatus === 'active' ? 'agent_active' : 'waiting_agent';
        doPoll();
        startPolling();
        render();
        return;
      }

      // Replace typing indicator with an empty AI bubble
      messages[messages.length - 1] = { role: 'ai', text: '' };
      render();

      // Stream chunks into the last bubble without re-rendering the whole panel
      var reader  = res.body.getReader();
      var decoder = new TextDecoder();

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            widgetState = 'idle';
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
      widgetState = 'idle';
      render();
    });
  }

  // ── Restore conversation on page load ───────────────────────────────────
  // Fetches full message history and escalation state so a page refresh
  // never loses an in-progress conversation or agent session.
  function restoreConversation() {
    var customer = getCustomer();
    var convId   = getConvId(customer);
    if (!customer || !convId) return;

    var url = API_POLL
      + '?conversationId=' + encodeURIComponent(convId)
      + '&productId='      + encodeURIComponent(productId)
      + '&since='          + encodeURIComponent(new Date(0).toISOString());

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;

        if (data.messages && data.messages.length > 0) {
          messages = [];
          data.messages.forEach(function (m) {
            if (m.senderType === 'customer') {
              messages.push({ role: 'user', text: m.body });
            } else if (m.senderType === 'ai') {
              messages.push({ role: 'ai', text: m.body });
            } else if (m.senderType === 'agent') {
              messages.push({ role: 'agent', text: m.body });
            }
          });
          lastSeenAt = data.messages[data.messages.length - 1].createdAt;
        }

        if (data.escalationStatus === 'pending') {
          widgetState = 'waiting_agent';
          startPolling();
        } else if (data.escalationStatus === 'active') {
          widgetState = 'agent_active';
          startPolling();
        }

        // Subscribe to real-time updates now that we have a confirmed convId.
        subscribeToConversation(convId);

        render();
      })
      .catch(function () { /* silent — initial render already shown */ });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    fetch(API_CONFIG)
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (data) {
        cfg = Object.assign(cfg, data);
        render();
        restoreConversation();
      })
      .catch(function () {
        render();
      });
  }

  init();
})();
