// ==UserScript==
// @name         Gerenciador de chats ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Gerenciamento em massa de conversas em plataformas de IA
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

    /**
     * Configuração específica para cada plataforma
     * Facilita a adaptação para outras plataformas de IA no futuro
     */
    const PLATFORMS = {
        'chat.openai.com': {
            name: 'ChatGPT',
            selectors: {
                chatList: 'nav[aria-label="Chat history"]',
                chatItems: 'nav[aria-label="Chat history"] ol > li',
                chatLink: 'a[href^="/c/"]',
                chatTitle: 'a > div > div'
            },
            api: {
                base: window.location.origin,
                tokenEndpoint: '/api/auth/session',
                conversationEndpoint: '/backend-api/conversation/',
                tokenExtractor: (data) => data.accessToken
            },
            priorityEmoji: '❗'
        },
        // Modelo para adicionar outras plataformas
        /*
        'exemplo.com': {
            name: 'Nome da Plataforma',
            selectors: {
                chatList: '.seletor-lista-chats',
                chatItems: '.seletor-item-chat',
                chatLink: '.seletor-link-chat',
                chatTitle: '.seletor-titulo-chat'
            },
            api: {
                base: 'https://api.exemplo.com',
                tokenEndpoint: '/auth/token',
                conversationEndpoint: '/api/conversations/',
                tokenExtractor: (data) => data.token
            },
            priorityEmoji: '⭐'
        }
        */
    };

    // Detecta a plataforma atual
    const getCurrentPlatform = () => {
        const hostname = window.location.hostname;
        return PLATFORMS[hostname] || PLATFORMS['chat.openai.com']; // Padrão para ChatGPT
    };

    const PLATFORM = getCurrentPlatform();
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
              .mass-actions {
                background-color: var(--surface-primary);
                padding: 10px;
                border-radius: 8px;
                margin-bottom: 16px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
              }

              .mass-actions-title {
                font-weight: bold;
                margin-bottom: 10px;
                font-size: 14px;
                color: var(--text-primary);
              }

              .mass-actions-btn {
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid var(--border-primary);
                margin-bottom: 5px;
              }

              .mass-actions-btn:hover {
                opacity: 0.9;
              }

              .btn-select-all {
                background-color: var(--surface-secondary);
              }

              .btn-deselect-all {
                background-color: var(--surface-secondary);
              }

              .btn-select-without-emoji {
                background-color: var(--surface-secondary);
              }

              .btn-archive {
                background-color: var(--surface-tertiary);
              }

              .btn-delete {
                background-color: rgba(255, 76, 76, 0.1);
                color: #ff4c4c;
              }

              .checkbox-container {
                position: absolute;
                left: 8px;
                top: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                z-index: 10;
              }

              .dialog-checkbox {
                cursor: pointer;
                width: 16px;
                height: 16px;
              }

              .chat-item-container {
                position: relative;
              }

              .chat-link-padded {
                padding-left: 30px !important;
              }

              .chat-action-status {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                background: var(--surface-primary);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                display: flex;
                align-items: center;
                font-size: 14px;
              }

              .status-icon {
                margin-right: 8px;
                font-size: 18px;
              }

              .status-success {
                color: #4caf50;
              }

              .status-error {
                color: #f44336;
              }

              .status-loading {
                color: #2196f3;
              }

              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }

              .loading-spinner {
                animation: spin 1s linear infinite;
                display: inline-block;
              }

              .select-count {
                margin-left: 8px;
                font-size: 13px;
                color: var(--text-secondary);
              }
            `;
            document.head.appendChild(styleEl);
        }

        showStatus(message, type = 'loading') {
            // Remove qualquer status existente
            const existingStatus = document.querySelector('.chat-action-status');
            if (existingStatus) existingStatus.remove();

            const statusEl = document.createElement('div');
            statusEl.className = 'chat-action-status';

            let icon = '';
            if (type === 'loading') {
                icon = '<span class="status-icon status-loading"><span class="loading-spinner">⟳</span></span>';
            } else if (type === 'success') {
                icon = '<span class="status-icon status-success">✓</span>';
            } else if (type === 'error') {
                icon = '<span class="status-icon status-error">✕</span>';
            }

            statusEl.innerHTML = `${icon}${message}`;
            document.body.appendChild(statusEl);

            if (type !== 'loading') {
                setTimeout(() => {
                    statusEl.remove();
                }, 3000);
            }

            return statusEl;
        }

        updateSelectedCount() {
            const selectedCount = document.querySelectorAll('.dialog-checkbox:checked').length;
            const countElement = document.querySelector('.selected-count');
            if (countElement) {
                countElement.textContent = selectedCount > 0 ? `${selectedCount} selecionado${selectedCount > 1 ? 's' : ''}` : '';
            }
        }

        createCheckbox(chatItem) {
            // Verifica se já existe um checkbox
            if (chatItem.querySelector('.checkbox-container')) return;

            // Adiciona classe ao container do chat
            chatItem.classList.add('chat-item-container');

            // Encontra o link de chat
            const chatLink = chatItem.querySelector(SELECTOR.chatLink);
            if (!chatLink) return;

            // Adiciona classe ao link para dar espaço ao checkbox
            chatLink.classList.add('chat-link-padded');

            // Cria container do checkbox
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';

            // Cria o checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'dialog-checkbox';
            checkbox.addEventListener('change', () => this.updateSelectedCount());
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique no checkbox navegue para o chat
            });

            // Adiciona checkbox ao container
            checkboxContainer.appendChild(checkbox);

            // Adiciona o container ao item de chat
            chatItem.appendChild(checkboxContainer);
        }

        ensureCorrectCheckboxes() {
            document.querySelectorAll(SELECTOR.chatItems).forEach(chatItem => {
                // Remove qualquer checkbox antigo que possa estar dentro do link
                const oldCheckbox = chatItem.querySelector('a .dialog-checkbox');
                if (oldCheckbox) {
                    oldCheckbox.remove();
                }

                // Cria um novo checkbox corretamente posicionado
                this.createCheckbox(chatItem);
            });
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

            // Configura os eventos dos botões
            this.setupButtonHandlers(controls);

            chatList.prepend(controls);

            // Adiciona checkboxes a todos os itens de chat existentes
            document.querySelectorAll(SELECTOR.chatItems).forEach(chatItem => this.createCheckbox(chatItem));
            this.updateSelectedCount();
        }

        setupButtonHandlers(controls) {
            controls.querySelector('.btn-select-all').addEventListener('click', () => {
                document.querySelectorAll('.dialog-checkbox').forEach(cb => cb.checked = true);
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
            const chatItem = element.closest('li');
            const link = chatItem.querySelector(SELECTOR.chatLink);
            return link ? new URL(link.href).pathname.split('/').pop() : null;
        }

        hasPriorityEmoji(chatItem) {
            const link = chatItem.querySelector(SELECTOR.chatLink);
            if (!link) return false;

            const titleDiv = link.querySelector(SELECTOR.chatTitle);
            return titleDiv && titleDiv.textContent.includes(PRIORITY_EMOJI);
        }

        selectChatsWithoutPriorityEmoji() {
            const chatItems = document.querySelectorAll(SELECTOR.chatItems);

            chatItems.forEach(chatItem => {
                const checkbox = chatItem.querySelector('.dialog-checkbox');
                if (checkbox) {
                    // Marca o checkbox apenas se NÃO tiver o emoji de prioridade
                    checkbox.checked = !this.hasPriorityEmoji(chatItem);
                }
            });
        }

        async updateChats(body) {
            const checkboxes = document.querySelectorAll('.dialog-checkbox:checked');
            if (checkboxes.length === 0) {
                this.ui.showStatus('Nenhuma conversa selecionada', 'error');
                return;
            }

            const action = body.is_archived ? 'arquivando' : 'excluindo';
            const statusEl = this.ui.showStatus(`${action.charAt(0).toUpperCase() + action.slice(1)} ${checkboxes.length} conversas...`);

            const accessToken = await this.getAccessToken();
            if (!accessToken) {
                this.ui.showStatus('Token de acesso não encontrado', 'error');
                return;
            }

            try {
                let processed = 0;
                await Promise.all(Array.from(checkboxes).map(async (checkbox) => {
                    const chatId = this.getChatId(checkbox);
                    if (!chatId) return;

                    const response = await fetch(`${API_BASE}${PLATFORM.api.conversationEndpoint}${chatId}`, {
                        method: 'PATCH',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    checkbox.closest('li').style.opacity = '0.5';
                    processed++;

                    // Atualizar status com progresso
                    statusEl.innerHTML = `<span class="status-icon status-loading"><span class="loading-spinner">⟳</span></span>${action.charAt(0).toUpperCase() + action.slice(1)} conversas... (${processed}/${checkboxes.length})`;
                }));

                this.ui.showStatus(`${processed} conversas ${body.is_archived ? 'arquivadas' : 'excluídas'} com sucesso!`, 'success');

                // Recarregar a página após um breve atraso para mostrar o status
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
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

            // Expõe o chatManager para uso nos event handlers
            window.chatManager = this.chatManager;
        }

        init() {
            // Inicialização com delay para garantir que a página carregou completamente
            setTimeout(() => {
                this.uiManager.setupControlPanel();
                this.uiManager.ensureCorrectCheckboxes();
                this.setupObserver();
            }, 1000);
        }

        setupObserver() {
            // Observador para detectar mudanças na lista de chats
            const observer = new MutationObserver((mutations) => {
                const chatList = document.querySelector(SELECTOR.chatList);
                if (chatList) {
                    this.uiManager.setupControlPanel();
                    this.uiManager.ensureCorrectCheckboxes();

                    // Adiciona checkboxes a novos itens
                    mutations.forEach(mutation => {
                        if (mutation.addedNodes.length) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === 1 && node.matches(SELECTOR.chatItems)) {
                                    this.uiManager.createCheckbox(node);
                                } else if (node.nodeType === 1) {
                                    node.querySelectorAll(SELECTOR.chatItems).forEach(item =>
                                        this.uiManager.createCheckbox(item)
                                    );
                                }
                            });
                        }
                    });
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Inicializa a aplicação
    const app = new ChatManagerApp();
    app.init();
})();
