document.addEventListener('DOMContentLoaded', () => {
    const notificationsContainer = document.getElementById('notifications-container');
    
    fetch('/api/get-profile', { 
        method: 'GET', 
        credentials: 'include' 
    })
    .then(response => {
        console.log('Profile response:', response);
        return response.json();
    })
    .then(profileData => {
        console.log('Profile data:', profileData);
        if (!profileData.username) {
            throw new Error('No username found in profile data');
        }
        
        return fetch(`/api/notifications/${profileData.username}`, { 
            method: 'GET', 
            credentials: 'include' 
        });
    })
    .then(response => {
        console.log('Notifications response:', response);
        return response.json();
    })
    .then(notifications => {
        console.log('Notifications data:', notifications);
        
        if (!Array.isArray(notifications)) {
            throw new Error('Invalid notifications data received');
        }

        if (notifications.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'notification-box';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.textContent = 'No notifications yet';
            notificationsContainer.appendChild(emptyMessage);
            return;
        }

        notifications.forEach(notification => {
            const notificationBox = document.createElement('div');
            notificationBox.className = 'notification-box';

            // Profile picture
            const profilePic = document.createElement('img');
            if (notification.profile_pic) {
                profilePic.src = `data:image/png;base64,${notification.profile_pic}`;
            } else {
                profilePic.src = '/images/default-profile.png';
            }
            profilePic.alt = `${notification.sender_username}'s profile picture`;

            // Rest of the notification box creation...
            const contentDiv = document.createElement('div');
            contentDiv.className = 'notification-content';

            const message = document.createElement('p');
            message.textContent = notification.message;

            const timestamp = document.createElement('p');
            timestamp.className = 'timestamp';
            timestamp.textContent = new Date(notification.timestamp).toLocaleString();

            contentDiv.appendChild(message);
            contentDiv.appendChild(timestamp);

            // Add buttons for connection requests
            if (notification.action_type === 'connection_request') {
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'connection-buttons';

                const acceptButton = document.createElement('button');
                acceptButton.textContent = 'Accept';
                acceptButton.onclick = () => handleConnectionResponse(notification.sender_username, true);

                const declineButton = document.createElement('button');
                declineButton.textContent = 'Decline';
                declineButton.onclick = () => handleConnectionResponse(notification.sender_username, false);

                buttonContainer.appendChild(acceptButton);
                buttonContainer.appendChild(declineButton);
                contentDiv.appendChild(buttonContainer);
            }

            notificationBox.appendChild(profilePic);
            notificationBox.appendChild(contentDiv);
            notificationsContainer.appendChild(notificationBox);
        });
    })
    .catch(error => {
        console.error('Detailed error:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'notification-box';
        errorMessage.style.textAlign = 'center';
        errorMessage.style.color = 'red';
        errorMessage.textContent = `Error loading notifications: ${error.message}`;
        notificationsContainer.appendChild(errorMessage);
    });
});

function handleConnectionResponse(requesterId, accepted) {
    fetch('/api/connect/respond', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            requesterId,
            accepted
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Refresh the notifications list
            location.reload();
        } else {
            alert('Error processing connection response');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error processing connection response');
    });
}
  