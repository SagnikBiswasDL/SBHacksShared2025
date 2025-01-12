document.addEventListener('DOMContentLoaded', () => {
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const profilePicForm = document.getElementById('profile-pic-form');
    const profilePicUpload = document.getElementById('profile-pic-upload');
    const profilePic = document.getElementById('profile-pic');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
  
    // Fetch current user's profile data
    fetch('/api/get-profile', { method: 'GET', credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        document.getElementById('username-display').textContent = data.username;
        document.getElementById('name-display').textContent = data.name;
        document.getElementById('connections-display').textContent = `Connections: ${data.connections}`;
        document.getElementById('posts-display').textContent = `Posts: ${data.posts}`;
        document.getElementById('intro-display').textContent = data.intro;
        profilePic.src = `/api/profile-pic/${data.username}`;
      })
      .catch((error) => console.error('Error fetching profile:', error));
  
    // Profile picture upload functionality
    profilePicForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData();
      formData.append('profile_pic', profilePicUpload.files[0]);
  
      fetch('/api/edit-profile', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
        .then((response) => {
          if (response.ok) {
            alert('Profile picture updated successfully!');
            location.reload();
          } else {
            alert('Error uploading profile picture.');
          }
        })
        .catch((error) => console.error('Error uploading profile picture:', error));
    });
  
    // Edit profile functionality
    editProfileBtn.addEventListener('click', () => {
      const isEditing = editProfileBtn.textContent === 'Edit Profile';
      editProfileBtn.textContent = isEditing ? 'Cancel' : 'Edit Profile';
  
      const nameDisplay = document.getElementById('name-display');
      const introDisplay = document.getElementById('intro-display');
      const profilePicForm = document.getElementById('profile-pic-form');
  
      if (isEditing) {
        nameDisplay.innerHTML = `<input type="text" id="name-edit" value="${nameDisplay.textContent}" placeholder="Name">`;
        introDisplay.innerHTML = `<textarea id="intro-edit" placeholder="Introduction">${introDisplay.textContent}</textarea>`;
        profilePicForm.style.display = 'block';
  
        const saveChangesBtn = document.createElement('button');
        saveChangesBtn.id = 'save-changes-btn';
        saveChangesBtn.textContent = 'Save Changes';
        introDisplay.parentElement.appendChild(saveChangesBtn);
  
        saveChangesBtn.addEventListener('click', () => {
          const nameInput = document.getElementById('name-edit').value;
          const introInput = document.getElementById('intro-edit').value;
          const profilePicFile = profilePicUpload.files[0];
  
          const formData = new FormData();
          formData.append('name', nameInput);
          formData.append('intro', introInput);
          if (profilePicFile) {
            formData.append('profile_pic', profilePicFile);
          }
  
          fetch('/api/edit-profile', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          })
            .then((response) => {
              if (response.ok) {
                location.reload();
              } else {
                alert('Error saving changes.');
              }
            })
            .catch((error) => console.error('Error editing profile:', error));
        });
      } else {
        nameDisplay.textContent = document.getElementById('name-edit').value || 'Name';
        introDisplay.textContent = document.getElementById('intro-edit').value || 'Introduction';
        profilePicForm.style.display = 'none';
      }
    });
  
    // Log out functionality
    logoutBtn.addEventListener('click', () => {
      fetch('/api/logout', { method: 'POST', credentials: 'include' })
        .then(() => {
          window.location.href = '/login.html';
        })
        .catch((error) => console.error('Error logging out:', error));
    });
  
    // Search functionality
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      console.log('Search query:', query); // Debug log
  
      if (query) {
        const searchUrl = `/api/search-user?username=${encodeURIComponent(query)}`;
        console.log('Search URL:', searchUrl); // Debug log
  
        fetch(searchUrl, { 
          method: 'GET', 
          credentials: 'include' 
        })
          .then(response => {
            console.log('Search response status:', response.status); // Debug log
            return response.json();
          })
          .then(data => {
            console.log('Search response data:', data); // Debug log
            if (data.success) {
              const profileUrl = `/view-profile.html?username=${encodeURIComponent(data.username)}`;
              console.log('Redirecting to:', profileUrl); // Debug log
              window.location.href = profileUrl;
            } else {
              alert(data.message || 'User not found.');
            }
          })
          .catch(error => {
            console.error('Error during search:', error);
            alert('An error occurred while searching for the user.');
          });
      }
    });
  
    // Load mini feed
    loadMiniFeed();
    
    // Sort dropdown handler
    const sortDropdown = document.getElementById('post-sort');
    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            loadMiniFeed(e.target.value);
        });
    }
  });
  
  function loadMiniFeed(sortBy = 'recent') {
    const username = document.getElementById('username-display').textContent;
    fetch(`/api/user-posts/${username}?sort=${sortBy}`, {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        const miniFeed = document.getElementById('mini-feed');
        const noPostsMessage = document.querySelector('.no-posts-message');

        if (data.posts && data.posts.length > 0) {
            miniFeed.innerHTML = data.posts.map(post => `
                <div class="mini-post-card" onclick="location.href='/post.html?id=${post.id}'">
                    <div class="mini-post-content-wrapper">
                        <div class="mini-post-header">
                            <h3 class="mini-post-title">${post.title}</h3>
                            <span class="mini-post-timestamp">${new Date(post.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="mini-post-content">${truncateText(post.content, 100)}</div>
                        <div class="mini-post-stats">
                            <span>❤️ ${post.likes_count}</span>
                            <span>💬 ${post.comments_count}</span>
                        </div>
                    </div>
                    ${post.media_url ? `<img src="${post.media_url}" class="mini-post-media" alt="Post media">` : ''}
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

  function truncateText(text, wordLimit) {
    const words = text.split(' ');
    if (words.length > wordLimit) {
        return words.slice(0, wordLimit).join(' ') + '...';
    }
    return text;
  }
  