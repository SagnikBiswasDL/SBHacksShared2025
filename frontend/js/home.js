let currentPage = 0;
let loading = false;
let hasMore = true;

// Load posts when page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/current-user');
        const data = await response.json();
        if (data.username) {
            document.querySelector('.app-title').dataset.username = data.username;
        }
    } catch (err) {
        console.error('Error fetching current user:', err);
    }
    
    loadPosts();
    setupInfiniteScroll();
    setupNewPostForm();
    setupCreatePostToggle();
    setupEditForm();
});

function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        if (loading || !hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 5) {
            loadPosts();
        }
    });
}

function setupCreatePostToggle() {
    const toggleButton = document.querySelector('.create-post-toggle');
    const createPostForm = document.querySelector('.create-post-form');
    const cancelButton = document.querySelector('.cancel-button');

    toggleButton.addEventListener('click', () => {
        toggleButton.style.display = 'none';
        createPostForm.style.display = 'block';
    });

    cancelButton.addEventListener('click', () => {
        // Clear form inputs
        document.getElementById('newPostForm').reset();
        
        // Hide form and show toggle button
        createPostForm.style.display = 'none';
        toggleButton.style.display = 'block';
    });
}

function setupNewPostForm() {
    const form = document.getElementById('newPostForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('title', document.getElementById('postTitle').value);
        formData.append('content', document.getElementById('postContent').value);

        const mediaFile = document.getElementById('postMedia').files[0];
        if (mediaFile) {
            formData.append('media', mediaFile);
        }

        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                form.reset();
                currentPage = 0;
                document.getElementById('postsFeed').innerHTML = '';
                loadPosts();
                
                // Hide form and show toggle button after successful post
                document.querySelector('.create-post-form').style.display = 'none';
                document.querySelector('.create-post-toggle').style.display = 'block';
            } else {
                throw new Error('Failed to create post');
            }
        } catch (err) {
            console.error('Error creating post:', err);
            alert('Error creating post');
        }
    });
}

async function loadPosts() {
    if (loading) return;
    loading = true;

    try {
        const response = await fetch(`/api/posts?page=${currentPage}`);
        const posts = await response.json();

        if (posts.length === 0) {
            hasMore = false;
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post);
            document.getElementById('postsFeed').appendChild(postElement);
        });

        currentPage++;
    } catch (err) {
        console.error('Error loading posts:', err);
    } finally {
        loading = false;
    }
}

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-card';
    postDiv.dataset.postId = post.id;
    
    const editedLabel = post.edited_at 
        ? `<span class="edited-label">Edited ${new Date(post.edited_at).toLocaleString()}</span>` 
        : '';

    // Get current username from the app-title data attribute
    const currentUsername = document.querySelector('.app-title').dataset.username;
    const isAuthor = post.author_username === currentUsername;

    postDiv.innerHTML = `
        <div class="post-header">
            <img src="/api/profile-pic/${post.author_username}" 
                 onerror="this.src='default-profile-pic.png'" 
                 alt="Profile Picture">
            <span class="post-author">${post.author_username}</span>
            <span class="post-timestamp">
                ${new Date(post.timestamp).toLocaleString()}
                ${editedLabel}
            </span>
        </div>
        <h3 class="post-title">${post.title}</h3>
        <div class="post-content">${formatContent(post.content)}</div>
        ${post.media ? `<img src="data:image/jpeg;base64,${post.media}" class="post-media" alt="Post media">` : ''}
        <div class="post-actions">
            <button class="like-button ${post.user_liked ? 'liked' : ''}" 
                    onclick="toggleLike(${post.id})">
                ❤️ ${post.likes_count}
            </button>
            ${isAuthor ? `
                <button onclick="openEditModal(${post.id})">Edit</button>
                <button onclick="deletePost(${post.id})">Delete</button>
            ` : ''}
        </div>
        <div class="comments-section">
            <div class="comments-container" id="comments-${post.id}"></div>
            <form class="new-comment-form" onsubmit="addComment(event, ${post.id})">
                <textarea placeholder="Add a comment..." required></textarea>
                <button type="submit">Comment</button>
            </form>
        </div>
    `;

    loadComments(post.id);
    return postDiv;
}

function formatContent(content) {
    if (!content) return '';
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\n/g, '<br>');
}

async function toggleLike(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST'
        });

        if (response.ok) {
            const button = document.querySelector(`button[onclick="toggleLike(${postId})"]`);
            const isLiked = button.classList.toggle('liked');
            const likesCount = parseInt(button.textContent.match(/\d+/)[0]);
            button.textContent = `❤️ ${isLiked ? likesCount + 1 : likesCount - 1}`;
        }
    } catch (err) {
        console.error('Error toggling like:', err);
    }
}

async function loadComments(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/comments`);
        const comments = await response.json();

        const container = document.getElementById(`comments-${postId}`);
        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <img src="/api/profile-pic/${comment.author_username}" 
                     onerror="this.src='default-profile-pic.png'" 
                     alt="Profile Picture">
                <div class="comment-content">
                    <div class="comment-author">${comment.author_username}</div>
                    <div class="comment-text">${comment.content}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading comments:', err);
    }
}

async function addComment(event, postId) {
    event.preventDefault();
    const form = event.target;
    const content = form.querySelector('textarea').value;

    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            form.reset();
            loadComments(postId);
        }
    } catch (err) {
        console.error('Error adding comment:', err);
        alert('Error adding comment');
    }
}

function getCurrentUsername() {
    // This should be set when the user logs in
    return document.querySelector('.app-title').dataset.username;
}

let currentEditingPostId = null;

function openEditModal(postId) {
    currentEditingPostId = postId;
    const postDiv = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const title = postDiv.querySelector('.post-title').textContent;
    const content = postDiv.querySelector('.post-content').innerHTML
        .replace(/<br>/g, '\n')
        .replace(/<[^>]+>/g, '');

    document.getElementById('editPostTitle').value = title;
    document.getElementById('editPostContent').value = content;
    document.getElementById('editPostModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editPostModal').classList.add('hidden');
    document.getElementById('editPostForm').reset();
    currentEditingPostId = null;
}

function setupEditForm() {
    const editForm = document.getElementById('editPostForm');
    if (!editForm) {
        console.error('Edit form not found in DOM');
        return;
    }

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('editPostTitle').value;
        const content = document.getElementById('editPostContent').value;

        try {
            console.log('Sending update for post:', currentEditingPostId);
            console.log('New title:', title);
            console.log('New content:', content);

            const response = await fetch(`/api/posts/${currentEditingPostId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content })
            });

            const data = await response.json();
            console.log('Server response:', data);

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update post');
            }

            if (!data.success || !data.post) {
                throw new Error('Invalid server response');
            }

            // Update the post in the feed
            const postDiv = document.querySelector(`.post-card[data-post-id="${currentEditingPostId}"]`);
            if (postDiv) {
                postDiv.querySelector('.post-title').textContent = data.post.title;
                postDiv.querySelector('.post-content').innerHTML = formatContent(data.post.content);
                
                // Update edited timestamp
                const timestampSpan = postDiv.querySelector('.post-timestamp');
                const editedLabel = `<span class="edited-label">Edited ${new Date(data.post.edited_at).toLocaleString()}</span>`;
                timestampSpan.innerHTML = `${new Date(data.post.timestamp).toLocaleString()} ${editedLabel}`;
            } else {
                console.error('Could not find post element in DOM');
            }

            closeEditModal();
        } catch (err) {
            console.error('Error updating post:', err);
            alert('Error updating post: ' + err.message);
        }
    });

    // Add event listener for the cancel button
    const cancelButton = document.querySelector('#editPostModal .cancel-button');
    if (cancelButton) {
        cancelButton.addEventListener('click', closeEditModal);
    }
}

function updatePostInFeed(post) {
    const postDiv = document.querySelector(`.post-card[data-post-id="${post.id}"]`);
    if (postDiv) {
        postDiv.querySelector('.post-title').textContent = post.title;
        postDiv.querySelector('.post-content').innerHTML = formatContent(post.content);
        
        // Update edited timestamp
        const timestampSpan = postDiv.querySelector('.post-timestamp');
        const editedLabel = post.edited_at 
            ? `<span class="edited-label">Edited ${new Date(post.edited_at).toLocaleString()}</span>`
            : '';
        timestampSpan.innerHTML = `${new Date(post.timestamp).toLocaleString()} ${editedLabel}`;
    }
}

// Add delete post function
async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) {
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete post');
        }

        // Remove the post from the feed
        const postDiv = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        if (postDiv) {
            postDiv.remove();
        }
    } catch (err) {
        console.error('Error deleting post:', err);
        alert('Error deleting post');
    }
}