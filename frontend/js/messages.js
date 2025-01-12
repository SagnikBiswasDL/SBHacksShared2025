document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');

    let chatHistory = [];

    function addMessage(message, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'sent' : 'received'}`;
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message;
        
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleString();
        
        messageDiv.appendChild(messageText);
        messageDiv.appendChild(timestamp);
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Add to chat history
        chatHistory.push({
            role: isUser ? 'user' : 'assistant',
            content: message
        });
    }

    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        // Add user message to chat
        addMessage(message, true);
        messageInput.value = '';

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    history: chatHistory
                })
            });

            const data = await response.json();
            if (data.success) {
                addMessage(data.reply);
            } else {
                addMessage('Sorry, I encountered an error. Please try again.');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            addMessage('Sorry, I encountered an error. Please try again.');
        }
    }

    // Send message handlers
    sendMessageBtn.onclick = sendMessage;
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});
