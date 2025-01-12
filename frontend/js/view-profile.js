document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    const connectBtn = document.getElementById('connect-btn');
    const sortDropdown = document.getElementById('post-sort');
    
    console.log('Username from URL:', username);

    if (username) {
        fetch(`/api/get-profile?username=${encodeURIComponent(username)}`, { 
            method: 'GET', 
            credentials: 'include' 
        })
            .then(response => {
                console.log('Response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Profile data:', data);
                if (data.success) {
                    document.getElementById('profile-pic').src = `/api/profile-pic/${encodeURIComponent(data.username)}`;
                    document.getElementById('username-display').textContent = data.username;
                    document.getElementById('name-display').textContent = data.name || '';
                    document.getElementById('connections-display').textContent = `Connections: ${data.connections}`;
                    document.getElementById('posts-display').textContent = `Posts: ${data.posts}`;
                    document.getElementById('intro-display').textContent = data.intro || '';
                } else {
                    alert(data.message || 'User not found.');
                    window.location.href = '/home.html';
                }
            })
            .catch(error => {
                console.error('Error loading profile:', error);
                alert('Error loading profile. Please try again.');
            });
    } else {
        alert('No user specified.');
        window.location.href = '/home.html';
    }

    // Check connection status and update button
    function updateConnectionButton() {
        fetch(`/api/connection-status/${encodeURIComponent(username)}`, {
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            switch(data.status) {
                case 'connected':
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Remove Connection';
                    connectBtn.classList.add('disconnect-btn');
                    break;
                case 'requested':
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Cancel Request';
                    connectBtn.classList.add('cancel-btn');
                    break;
                case 'none':
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Connect';
                    connectBtn.classList.remove('disconnect-btn', 'cancel-btn');
                    break;
                default:
                    console.error('Unknown connection status:', data.status);
            }
        })
        .catch(error => {
            console.error('Error checking connection status:', error);
        });
    }

    // Initial check of connection status
    updateConnectionButton();

    // Connect button click handler
    connectBtn.addEventListener('click', () => {
        const action = connectBtn.textContent;
        
        if (action === 'Connect') {
            // Existing connect functionality
            fetch('/api/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    targetUsername: username
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateConnectionButton();
                } else {
                    alert(data.error || 'Failed to send connection request');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error sending connection request');
            });
        } else {
            // Handle disconnect/cancel request
            const confirmMessage = action === 'Remove Connection' 
                ? `Are you sure you want to remove ${username} from your connections?`
                : `Are you sure you want to cancel your connection request to ${username}?`;

            if (confirm(confirmMessage)) {
                fetch('/api/disconnect', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        targetUsername: username
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateConnectionButton();
                    } else {
                        alert(data.error || 'Failed to remove connection');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error removing connection');
                });
            }
        }
    });

    const messageBtn = document.getElementById('message-btn');
    messageBtn.addEventListener('click', () => {
        fetch(`/api/connection-status/${encodeURIComponent(username)}`, {
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'connected') {
                window.location.href = `/messages.html?chat=${encodeURIComponent(username)}`;
            } else {
                // Create and show popup
                const popup = document.createElement('div');
                popup.className = 'popup';
                popup.textContent = `You are not connected with ${username}`;
                document.body.appendChild(popup);
                
                // Remove popup after 3 seconds
                setTimeout(() => {
                    popup.remove();
                }, 3000);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error checking connection status');
        });
    });

    // Load mini feed
    function loadMiniFeed(sortBy = 'recent') {
        fetch(`/api/user-posts/${username}?sort=${sortBy}`, {
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            const miniFeed = document.getElementById('mini-feed');
            const noPostsMessage = document.querySelector('.no-posts-message');

            if (data.posts && data.posts.length > 0) {
                miniFeed.innerHTML = data.posts.map(post => `
                    <div class="mini-post-card" onclick="location.href='/home.html?id=${post.id}'">
                        <div class="mini-post-header">
                            <h3 class="mini-post-title">${post.title}</h3>
                            <span class="mini-post-timestamp">${new Date(post.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="mini-post-content">${post.content}</div>
                        <div class="mini-post-stats">
                            <span>❤️ ${post.likes_count}</span>
                            <span>💬 ${post.comments_count}</span>
                        </div>
                    </div>
                `).join('');
                noPostsMessage.style.display = 'none';
            } else {
                miniFeed.innerHTML = '';
                noPostsMessage.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading posts:', error);
        });
    }

    // Sort dropdown handler
    sortDropdown.addEventListener('change', (e) => {
        loadMiniFeed(e.target.value);
    });

    // Check if user can view posts
    fetch(`/api/can-view-posts/${username}`, {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        const miniFeedContainer = document.querySelector('.mini-feed-container');
        miniFeedContainer.style.display = data.canView ? 'block' : 'none';
        if (data.canView) {
            loadMiniFeed('recent');
        }
    })
    .catch(error => {
        console.error('Error checking post visibility:', error);
    });
});
  