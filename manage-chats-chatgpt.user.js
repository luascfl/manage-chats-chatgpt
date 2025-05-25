// ==UserScript==
// @name         Gerenciador de chats ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Gerenciamento em massa de conversas em plataformas de IA
// @author       luascfl (com correções da comunidade)
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @icon         https://cdn-icons-png.flaticon.com/512/16459/16459818.png
// @home         https://github.com/luascfl/manage-chats-chatgpt
// @supportURL   https://github.com/luascfl/manage-chats-chatgpt/issues
// @updateURL    https://raw.githubusercontent.com/luascfl/manage-chats-chatgpt/main/manage-chats-chatgpt.user.js
// @downloadURL  https://raw.githubusercontent.com/luascfl/manage-chats-chatgpt/main/manage-chats-chatgpt.user.js
// @license      MIT
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log('[ChatManager] Script v1.6 iniciado.');

    const PLATFORMS = {
        'chat.openai.com': {
            name: 'ChatGPT',
            selectors: {
                entryPoint: 'nav', // Ponto de entrada principal para esperar
                chatList: 'nav',   // Onde adicionar o painel de gerenciamento
                chatItems: 'a[href^="/c/"]', // O item de chat é o próprio link
                chatLink: 'a[href^="/c/"]',
                chatTitle: 'div.truncate'
            },
            api: {
                base: window.location.origin,
                tokenEndpoint: '/api/auth/session',
                conversationEndpoint: '/backend-api/conversation/',
                tokenExtractor: (data) => data.accessToken
            },
            priorityEmoji: '❗'
        },
    };

    const PLATFORM = PLATFORMS[window.location.hostname] || PLATFORMS['chat.openai.com'];
    const API_BASE = PLATFORM.api.base;
    const SELECTOR = PLATFORM.selectors;
    const PRIORITY_EMOJI = PLATFORM.priorityEmoji;

    class UIManager {
        constructor() { this.addStyles(); }
        addStyles() {
            if (document.getElementById('chat-manager-styles')) return;
            const styleEl = document.createElement('style');
            styleEl.id = 'chat-manager-styles';
            styleEl.innerHTML = `
              .mass-actions { padding: 10px; margin-bottom: 8px; margin-top: 8px; border-radius: 8px; }
              .mass-actions-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; }
              .mass-actions-btn { padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-medium); margin-bottom: 5px; background-color: var(--surface-secondary); }
              .mass-actions-btn:hover { background-color: var(--surface-tertiary); }
              .btn-delete { background-color: rgba(255, 76, 76, 0.1); color: #ff4c4c; }
              .btn-delete:hover { background-color: rgba(255, 76, 76, 0.2); }
              .dialog-checkbox { cursor: pointer; }
              .chat-action-status { position: fixed; top: 20px; right: 20px; padding: 12px 16px; background: var(--surface-primary); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 2000; display: flex; align-items: center; font-size: 14px; }
              .status-icon { margin-right: 8px; font-size: 18px; }
              .status-success { color: #4caf50; } .status-error { color: #f44336; } .status-loading { color: #2196f3; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              .loading-spinner { animation: spin 1s linear infinite; display: inline-block; }
              .select-count { margin-left: 8px; font-size: 13px; color: var(--text-secondary); }
            `;
            document.head.appendChild(styleEl);
        }

        showStatus(message, type = 'loading') {
            document.querySelector('.chat-action-status')?.remove();
            const statusEl = document.createElement('div');
            statusEl.className = 'chat-action-status';
            let icon = '';
            if (type === 'loading') icon = '<span class="status-icon status-loading"><span class="loading-spinner">⟳</span></span>';
            else if (type === 'success') icon = '<span class="status-icon status-success">✓</span>';
            else if (type === 'error') icon = '<span class="status-icon status-error">✕</span>';
            statusEl.innerHTML = `<span class="math-inline">\{icon\}</span>{message}`;
            document.body.appendChild(statusEl);
            if (type !== 'loading') setTimeout(()
