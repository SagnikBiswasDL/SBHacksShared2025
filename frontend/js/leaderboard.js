document.addEventListener('DOMContentLoaded', function() {
    loadLeaderboard();
});

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        
        // Sort users alphabetically by username
        const sortedData = data.sort((a, b) => a.username.localeCompare(b.username));
        
        const leaderboardList = document.getElementById('leaderboard-list');
        leaderboardList.innerHTML = ''; // Clear existing entries
        
        if (sortedData.length === 0) {
            leaderboardList.innerHTML = `
                <div class="no-connections">
                    <p>No connections found. Connect with other users to see their rankings!</p>
                    <button onclick="location.href='home.html'" class="find-users-btn">
                        Find Users
                    </button>
                </div>
            `;
            return;
        }
        
        sortedData.forEach((user, index) => {
            const entry = createLeaderboardEntry(user, index + 1);
            leaderboardList.appendChild(entry);
        });
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

function createLeaderboardEntry(user, rank) {
    const entry = document.createElement('div');
    entry.className = `leaderboard-entry ${rank <= 3 ? `top-3 rank-${rank}` : ''}`;
    
    entry.innerHTML = `
        <div class="rank">#${rank}</div>
        <div class="user-info">
            <img src="${user.avatar || 'images/default-avatar.png'}" alt="User avatar" class="user-avatar">
            <div class="user-details">
                <span class="username">${user.username}</span>
                <span class="stats">Connected User</span>
            </div>
        </div>
    `;

    // Make the entry clickable to view user's profile
    entry.addEventListener('click', () => {
        location.href = `view-profile.html?username=${user.username}`;
    });
    
    return entry;
} 