// ==UserScript==
// @name         Gerenciador de chats ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.5
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

    /**
     * Configuração específica para cada plataforma
     */
    const PLATFORMS = {
        'chat.openai.com': {
            name: 'ChatGPT',
            selectors: {
                // SELETORES ATUALIZADOS PARA A NOVA ESTRUTURA
                chatList: 'nav', // O painel de navegação principal
                chatItems: 'a[href^="/c/"]', // O item de chat agora é o próprio link <a>
                chatLink: 'a[href^="/c/"]', // Redundante, mas mantém a consistência
                chatTitle: 'div.truncate' // A div que contém o título visível
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

    /**
     * Gerenciador de UI
     */
    class UIManager {
        constructor() {
            this.addStyles();
        }

        addStyles() {
            const styleEl = document.createElement('style');
            styleEl.innerHTML = `
              .mass-actions { padding: 10px; margin-bottom: 16px; border-radius: 8px; }
              .mass-actions-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; }
              .mass-actions-btn { padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-primary); margin-bottom: 5px; }
              .mass-actions-btn:hover { opacity: 0.9; }
              .btn-delete { background-color: rgba(255, 76, 76, 0.1); color: #ff4c4c; }
              .dialog-checkbox { cursor: pointer; }
              .chat-action-status { position: fixed; top: 20px; right: 20px; padding: 12px 16px; background: var(--surface-primary); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: flex; align-items: center; font-size: 14px; }
              .status-icon { margin-right: 8px; font-size: 18px; }
              .status-success { color: #4caf50; }
              .status-error { color: #f44336; }
              .status-loading { color: #2196f3; }
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
            statusEl.innerHTML = `${icon}${message}`;
            document.body.appendChild(statusEl);
            if (type !== 'loading') setTimeout(() => statusEl.remove(), 3000);
            return statusEl;
        }

        updateSelectedCount() {
            const selectedCount = document.querySelectorAll('.dialog-checkbox:checked').length;
            const countElement = document.querySelector('.selected-count');
            if (countElement) {
                countElement.textContent = selectedCount > 0 ? `${selectedCount} selecionado${selectedCount > 1 ? 's' : ''}` : '';
            }
        }

        createCheckbox(chatItem) { // chatItem é agora o elemento <a>
            if (chatItem.querySelector('.dialog-checkbox-container')) return;

            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'dialog-checkbox-container flex items-center pr-2';

            checkboxContainer.addEventListener('click', (e) => {
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
            checkbox.className = 'dialog-checkbox h-4 w-4';
            checkbox.addEventListener('change', () => this.updateSelectedCount());

            checkboxContainer.appendChild(checkbox);
            chatItem.prepend(checkboxContainer);
        }

        setupControlPanel() {
            const chatList = document.querySelector(SELECTOR.chatList);
            if (!chatList || chatList.querySelector('.mass-actions')) return;

            const controls = document.createElement('div');
            controls.className = 'mass-actions';
            controls.innerHTML = `
              <div class="mass-actions-title">Gerenciamento em massa</div>
              <div class="flex gap-2 flex-wrap">
                <button class="mass-actions-btn btn-select-all">Selecionar tudo</button>
                <button class="mass-actions-btn btn-select-without-emoji">Selecionar sem ${PRIORITY_EMOJI}</button>
                <button class="mass-actions-btn btn-deselect-all">Desmarcar tudo</button>
                <button class="mass-actions-btn btn-archive">Arquivar selecionados</button>
                <button class="mass-actions-btn btn-delete">Excluir selecionados</button>
                <span class="selected-count select-count"></span>
              </div>
            `;
            this.setupButtonHandlers(controls);
            chatList.prepend(controls);
            this.updateSelectedCount();
        }

        setupButtonHandlers(controls) {
            controls.querySelector('.btn-select-all').addEventListener('click', () => {
                document.querySelectorAll(SELECTOR.chatItems).forEach(item => {
                    const cb = item.querySelector('.dialog-checkbox');
                    if (cb) cb.checked = true;
                });
                this.updateSelectedCount();
            });

            controls.querySelector('.btn-select-without-emoji').addEventListener('click', () => {
                chatManager.selectChatsWithoutPriorityEmoji();
                this.updateSelectedCount();
            });

            controls.querySelector('.btn-deselect-all').addEventListener('click', () => {
                document.querySelectorAll('.dialog-checkbox').forEach(cb => cb.checked = false);
                this.updateSelectedCount();
            });

            controls.querySelector('.btn-archive').addEventListener('click', () => {
                if (confirm('Deseja arquivar todas as conversas selecionadas?')) {
                    chatManager.updateChats({ is_archived: true });
                }
            });

            controls.querySelector('.btn-delete').addEventListener('click', () => {
                if (confirm('Deseja excluir todas as conversas selecionadas? Esta ação não pode ser desfeita.')) {
                    chatManager.updateChats({ is_visible: false });
                }
            });
        }
    }

    /**
     * Gerenciador de Chats
     */
    class ChatManager {
        constructor(uiManager) {
            this.ui = uiManager;
        }

        async getAccessToken() {
            try {
                const response = await fetch(`${API_BASE}${PLATFORM.api.tokenEndpoint}`);
                const data = await response.json();
                return PLATFORM.api.tokenExtractor(data);
            } catch (error) {
                console.error('Erro ao obter token:', error);
                return null;
            }
        }

        getChatId(element) {
            const chatLink = element.closest(SELECTOR.chatLink);
            return chatLink ? new URL(chatLink.href).pathname.split('/').pop() : null;
        }

        hasPriorityEmoji(chatItem) { // chatItem é o elemento <a>
            const titleDiv = chatItem.querySelector(SELECTOR.chatTitle);
            return titleDiv && titleDiv.textContent.includes(PRIORITY_EMOJI);
        }

        selectChatsWithoutPriorityEmoji() {
            document.querySelectorAll(SELECTOR.chatItems).forEach(chatItem => {
                const checkbox = chatItem.querySelector('.dialog-checkbox');
                if (checkbox) {
                    checkbox.checked = !this.hasPriorityEmoji(chatItem);
                }
            });
        }

        async updateChats(body) {
            const checkedItems = Array.from(document.querySelectorAll('.dialog-checkbox:checked'));
            if (checkedItems.length === 0) {
                this.ui.showStatus('Nenhuma conversa selecionada', 'error');
                return;
            }

            const action = body.is_archived ? 'arquivando' : 'excluindo';
            const statusEl = this.ui.showStatus(`${action.charAt(0).toUpperCase() + action.slice(1)} ${checkedItems.length} conversas...`);
            const accessToken = await this.getAccessToken();
            if (!accessToken) {
                this.ui.showStatus('Token de acesso não encontrado', 'error');
                return;
            }

            try {
                let processed = 0;
                await Promise.all(checkedItems.map(async (checkbox) => {
                    const chatItem = checkbox.closest(SELECTOR.chatItems);
                    const chatId = this.getChatId(chatItem);
                    if (!chatId) return;

                    const response = await fetch(`${API_BASE}${PLATFORM.api.conversationEndpoint}${chatId}`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    if (chatItem) chatItem.style.opacity = '0.5';
                    processed++;
                    statusEl.innerHTML = `<span class="status-icon status-loading"><span class="loading-spinner">⟳</span></span>${action.charAt(0).toUpperCase() + action.slice(1)} conversas... (${processed}/${checkedItems.length})`;
                }));

                this.ui.showStatus(`${processed} conversas ${body.is_archived ? 'arquivadas' : 'excluídas'} com sucesso!`, 'success');
                setTimeout(() => window.location.reload(), 1500);
            } catch (error) {
                console.error('Erro ao processar conversas:', error);
                this.ui.showStatus(`Erro ao processar conversas: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Classe principal que orquestra tudo
     */
    class ChatManagerApp {
        constructor() {
            this.uiManager = new UIManager();
            this.chatManager = new ChatManager(this.uiManager);
            window.chatManager = this.chatManager;
        }

        init() {
            const FADE_IN_DELAY = 2000;
            setTimeout(() => {
                this.run();
                this.setupObserver();
            }, FADE_IN_DELAY);
        }
        
        run() {
            this.uiManager.setupControlPanel();
            document.querySelectorAll(SELECTOR.chatItems).forEach(item => {
                this.uiManager.createCheckbox(item);
            });
        }

        setupObserver() {
            const observer = new MutationObserver((mutations) => {
                // Usamos um debounce para evitar execuções múltiplas em atualizações rápidas do DOM
                if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => {
                    this.run();
                }, 300);
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    const app = new ChatManagerApp();
    app.init();
})();
