document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('id');

    if (!postId) {
        window.location.href = '/home.html';
        return;
    }

    fetch(`/api/posts/${postId}`, {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(post => {
        const container = document.querySelector('.single-post-container');
        container.innerHTML = `
            <div class="post-card">
                <div class="post-header">
                    <img src="/api/profile-pic/${post.author_username}" 
                         onerror="this.src='default-profile-pic.png'" 
                         alt="Profile Picture">
                    <span class="post-author">${post.author_username}</span>
                    <span class="post-timestamp">${new Date(post.timestamp).toLocaleString()}</span>
                </div>
                <h3 class="post-title">${post.title}</h3>
                <div class="post-content">${post.content}</div>
                ${post.media_url ? `<img src="${post.media_url}" class="post-media" alt="Post media">` : ''}
                <div class="post-actions">
                    <button class="like-button ${post.user_liked ? 'liked' : ''}" 
                            onclick="toggleLike(${post.id})">
                        ❤️ ${post.likes_count}
                    </button>
                </div>
                <div class="comments-section">
                    <!-- Comments will be loaded here -->
                </div>
            </div>
        `;
        loadComments(post.id);
    })
    .catch(error => {
        console.error('Error loading post:', error);
        alert('Error loading post');
    });
}); 