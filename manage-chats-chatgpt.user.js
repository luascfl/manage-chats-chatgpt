// ==UserScript==
// @name         Gerenciador de chats ChatGPT (Substitui Botão Upgrade)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Gerencia conversas em massa e substitui o botão "Upgrade" pelo painel de controle.
// @author       luascfl
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
    console.log('[ChatManager v2.0] Script iniciado.');

    const PLATFORMS = {
        'chat.openai.com': {
            name: 'ChatGPT',
            selectors: {
                entryPoint: 'nav',
                chatItems: 'a[href^="/c/"]',
                chatLink: 'a[href^="/c/"]',
                chatTitle: 'div.truncate'
            },
            api: {
                base: window.location.origin,
                tokenEndpoint: '/api/auth/session',
                conversationEndpoint: '/backend-api/conversation/',
                tokenExtractor: (data) => data.accessToken
            },
            priorityEmoji: '❗',
            upgradeButtonText: 'Fazer upgrade do plano'
        },
    };

    const PLATFORM = PLATFORMS[window.location.hostname] || PLATFORMS['chat.openai.com'];
    const SELECTOR = PLATFORM.selectors;
    const PRIORITY_EMOJI = PLATFORM.priorityEmoji;

    class UIManager {
        constructor() {
            this.addStyles();
        }

        addStyles() {
            if (document.getElementById('chat-manager-styles')) return;
            const styleEl = document.createElement('style');
            styleEl.id = 'chat-manager-styles';
            styleEl.innerHTML = `
              .mass-actions { padding: 8px; margin: 2px 8px; border-radius: 8px; background-color: var(--surface-secondary); }
              .mass-actions-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; text-align: center; color: var(--text-primary); }
              .mass-actions-btn { width: 100%; justify-content: center; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-medium); margin-bottom: 5px; background-color: var(--surface-primary); display: flex; align-items: center; }
              .mass-actions-btn:hover { background-color: var(--surface-tertiary); }
              .btn-delete { background-color: rgba(255, 76, 76, 0.1); color: #ff4c4c; }
              .btn-delete:hover { background-color: rgba(255, 76, 76, 0.2); }
              .dialog-checkbox { cursor: pointer; }
              .chat-action-status { position: fixed; top: 20px; right: 20px; padding: 12px 16px; background: var(--surface-primary); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 2000; display: flex; align-items: center; font-size: 14px; }
              .status-icon { margin-right: 8px; font-size: 18px; }
              .status-success { color: #4caf50; } .status-error { color: #f44336; } .status-loading { color: #2196f3; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              .loading-spinner { animation: spin 1s linear infinite; display: inline-block; }
              .select-count { font-size: 12px; color: var(--text-secondary); text-align: center; margin-top: 4px; display: block; }
            `;
            document.head.appendChild(styleEl);
        }

        createCheckbox(chatItem) {
            if (chatItem.querySelector('.dialog-checkbox-container')) return;
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'dialog-checkbox-container flex items-center pr-2';
            checkboxContainer.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const checkbox = e.currentTarget.querySelector('.dialog-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'dialog-checkbox h-4 w-4 rounded';
            checkbox.addEventListener('change', () => this.updateSelectedCount());
            checkboxContainer.appendChild(checkbox);
            chatItem.prepend(checkboxContainer);
        }

        updateSelectedCount() {
            const selectedCount = document.querySelectorAll('.dialog-checkbox:checked').length;
            const countElement = document.querySelector('.selected-count');
            if (countElement) countElement.textContent = selectedCount > 0 ? `${selectedCount} selecionado${selectedCount > 1 ? 's' : ''}` : 'Nenhum selecionado';
        }

        // --- FUNÇÃO PRINCIPAL MODIFICADA ---
        setupControlPanel() {
            const upgradeButtonText = PLATFORM.upgradeButtonText;
            const allDivs = document.querySelectorAll('div.truncate');
            let upgradeButton = null;

            for (const div of allDivs) {
                if (div.textContent.includes(upgradeButtonText)) {
                    upgradeButton = div.closest('.__menu-item');
                    break;
                }
            }

            if (!upgradeButton) {
                console.warn(`[ChatManager] Botão de upgrade ("${upgradeButtonText}") não encontrado.`);
                return;
            }

            if (document.querySelector('.mass-actions')) {
                this.updateSelectedCount();
                return;
            }

            console.log("[ChatManager] Botão de upgrade encontrado. Substituindo pelo painel de controle.");
            const controls = this.createControlsElement();
            upgradeButton.parentNode.replaceChild(controls, upgradeButton);
            this.updateSelectedCount();
        }

        createControlsElement() {
            const controls = document.createElement('div');
            controls.className = 'mass-actions';
            controls.innerHTML = `
              <div class="mass-actions-title">Gerenciamento em Massa</div>
              <button class="mass-actions-btn btn-select-all">Selecionar Tudo</button>
              <button class="mass-actions-btn btn-select-without-emoji">Sel. sem ${PRIORITY_EMOJI}</button>
              <button class="mass-actions-btn btn-deselect-all">Desmarcar Tudo</button>
              <hr class="my-2 border-token-border-light">
              <button class="mass-actions-btn btn-archive">Arquivar Selecionados</button>
              <button class="mass-actions-btn btn-delete">Excluir Selecionados</button>
              <span class="selected-count"></span>`;
            this.setupButtonHandlers(controls);
            return controls;
        }

        setupButtonHandlers(controls) {
            const handlers = {
                '.btn-select-all': () => this.toggleAllCheckboxes(true),
                '.btn-select-without-emoji': () => window.chatManager.selectChatsWithoutPriorityEmoji(),
                '.btn-deselect-all': () => this.toggleAllCheckboxes(false),
                '.btn-archive': () => { if (confirm('Deseja arquivar as conversas selecionadas?')) window.chatManager.updateChats({ is_archived: true }); },
                '.btn-delete': () => { if (confirm('Deseja excluir permanentemente as conversas selecionadas?')) window.chatManager.updateChats({ is_visible: false }); }
            };
            for (const [selector, handler] of Object.entries(handlers)) {
                controls.querySelector(selector).addEventListener('click', handler);
            }
        }
        
        toggleAllCheckboxes(state) {
            document.querySelectorAll(SELECTOR.chatItems).forEach(item => {
                const cb = item.querySelector('.dialog-checkbox');
                if (cb) cb.checked = state;
            });
            this.updateSelectedCount();
        }
    }

    class ChatManager {
        constructor(uiManager) { this.ui = uiManager; }
        async getAccessToken() { /* ...código omitido para brevidade... */ }
        getChatId(element) { /* ...código omitido para brevidade... */ }
        hasPriorityEmoji(chatItem) { /* ...código omitido para brevidade... */ }
        selectChatsWithoutPriorityEmoji() { /* ...código omitido para brevidade... */ }
        async updateChats(body) { /* ...código omitido para brevidade... */ }
        // A lógica interna destas funções permanece a mesma da versão anterior
    }
    // Implementação completa das funções do ChatManager (coladas da versão anterior)
    ChatManager.prototype.getAccessToken = async function() { try { const r = await fetch(`${PLATFORM.api.base}${PLATFORM.api.tokenEndpoint}`); if (!r.ok) throw new Error(`${r.statusText}`); return PLATFORM.api.tokenExtractor(await r.json()); } catch (e) { console.error('Erro token:', e); this.ui.showStatus(`Erro token: ${e.message}`, 'error'); return null; }};
    ChatManager.prototype.getChatId = function(element) { const link = element.closest(SELECTOR.chatLink); return link ? new URL(link.href).pathname.split('/').pop() : null; };
    ChatManager.prototype.hasPriorityEmoji = function(chatItem) { const title = chatItem.querySelector(SELECTOR.chatTitle); return title && title.textContent.includes(PRIORITY_EMOJI); };
    ChatManager.prototype.selectChatsWithoutPriorityEmoji = function() { document.querySelectorAll(SELECTOR.chatItems).forEach(item => { const cb = item.querySelector('.dialog-checkbox'); if (cb) cb.checked = !this.hasPriorityEmoji(item); }); this.ui.updateSelectedCount(); };
    ChatManager.prototype.updateChats = async function(body) { const items = Array.from(document.querySelectorAll('.dialog-checkbox:checked')); if (items.length === 0) { this.ui.showStatus('Nenhuma conversa selecionada', 'error'); return; } const action = body.is_archived ? 'arquivando' : 'excluindo'; const statusEl = this.ui.showStatus(`${action} ${items.length} conversas...`); const token = await this.getAccessToken(); if (!token) return; const results = await Promise.allSettled(items.map(async cb => { const item = cb.closest(SELECTOR.chatItems); const id = this.getChatId(item); if (!id) return Promise.reject('ID não encontrado'); const r = await fetch(`${PLATFORM.api.base}${PLATFORM.api.conversationEndpoint}${id}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) return Promise.reject(`HTTP ${r.status}`); if (item) item.style.opacity = '0.5'; return Promise.resolve(); })); const processed = results.filter(r => r.status === 'fulfilled').length; if (processed > 0) { this.ui.showStatus(`${processed} conversas ${action.slice(0, -1)}as com sucesso!`, 'success'); setTimeout(() => window.location.reload(), 1500); } else { this.ui.showStatus(`Erro ao processar conversas.`, 'error'); }};


    class ChatManagerApp {
        constructor() {
            this.uiManager = new UIManager();
            this.chatManager = new ChatManager(this.uiManager);
            window.chatManager = this.chatManager;
            console.log('[ChatManager] App construído.');
        }

        run() {
            this.uiManager.setupControlPanel();
            const items = document.querySelectorAll(SELECTOR.chatItems);
            if (items.length === 0) {
                console.warn(`[ChatManager] ⚠️ Nenhum item de chat encontrado.`);
            }
            items.forEach(item => this.uiManager.createCheckbox(item));
        }

        setupObserver() {
            const observer = new MutationObserver(() => {
                if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => {
                    this.run();
                }, 500);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            console.log('[ChatManager] Observador do DOM está ativo.');
        }
    }

    function waitForElement(selector, callback) {
        console.log(`[ChatManager] Aguardando por: "${selector}"`);
        const interval = setInterval(() => {
            if (document.querySelector(selector)) {
                console.log(`[ChatManager] ✅ Elemento "${selector}" encontrado!`);
                clearInterval(interval);
                callback();
            }
        }, 1000);
    }

    waitForElement(SELECTOR.entryPoint, () => {
        const app = new ChatManagerApp();
        app.run();
        app.setupObserver();
    });
})();
