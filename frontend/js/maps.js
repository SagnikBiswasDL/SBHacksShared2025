let map;
let userMarkers = {};
let currentUserPosition = null;
let watchId = null;
let currentUserMarker = null;

// Initialize the map
async function initMap() {
    map = L.map('map').setView([0, 0], 2);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    console.log('Map initialized'); // Debug log

    try {
        await loadLocationPreferences();
        console.log('Location preferences loaded'); // Debug log

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    console.log('Initial position received:', position); // Debug log
                    currentUserPosition = position;
                    map.setView([position.coords.latitude, position.coords.longitude], 13);
                    updateUserLocation(position);
                    createCurrentUserMarker(position);
                },
                error => {
                    console.error('Geolocation error:', error);
                    alert('Error getting your location. Please ensure location services are enabled.');
                },
                { 
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            console.error('Geolocation is not supported by this browser');
            alert('Geolocation is not supported by your browser');
        }
    } catch (error) {
        console.error('Error in initMap:', error);
    }

    // Start periodic updates of connected users
    setInterval(fetchConnectedUsersLocations, 30000);
}

// Load saved location preferences
async function loadLocationPreferences() {
    try {
        const response = await fetch('/api/location-settings/current');
        const settings = await response.json();
        
        if (settings.success) {
            const toggleElement = document.getElementById('location-sharing-toggle');
            const modeElement = document.getElementById('sharing-mode-select');
            
            toggleElement.checked = settings.isEnabled;
            modeElement.value = settings.sharingMode;
            
            if (settings.isEnabled) {
                startLocationTracking();
            }
        }
    } catch (error) {
        console.error('Error loading location preferences:', error);
    }
}

// Create custom marker icon
function createCustomMarker(profilePic, isCurrentUser = false) {
    const markerHtml = `
        <div class="custom-marker">
            <img src="data:image/jpeg;base64,${profilePic}" alt="User location">
            <div class="marker-point"></div>
        </div>
    `;

    return L.divIcon({
        html: markerHtml,
        className: isCurrentUser ? 'custom-marker-container current-user' : 'custom-marker-container',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -45]
    });
}

// Create or update current user's marker
function createCurrentUserMarker(position) {
    if (!position) return;

    const updateMarker = (profilePic) => {
        const latlng = [position.coords.latitude, position.coords.longitude];
        // Use default icon if no profile picture is available
        const customIcon = profilePic ? 
            createCustomMarker(profilePic, true) : 
            L.divIcon({
                html: `<div class="custom-marker">
                    <img src="/images/default-profile.png" alt="Default profile">
                    <div class="marker-point"></div>
                </div>`,
                className: 'custom-marker-container current-user',
                iconSize: [40, 40],
                iconAnchor: [20, 40],
                popupAnchor: [0, -45]
            });

        if (currentUserMarker) {
            currentUserMarker.setLatLng(latlng);
            currentUserMarker.setIcon(customIcon);
        } else {
            currentUserMarker = L.marker(latlng, { icon: customIcon })
                .bindPopup('<div class="user-popup"><h3>Your Location</h3></div>')
                .addTo(map);
        }
    };

    // Add error handling and logging
    fetch('/api/current-user-profile')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Profile data:', data); // Debug log
            updateMarker(data.profile_pic);
        })
        .catch(error => {
            console.error('Error fetching user profile:', error);
            // Still create marker even if profile fetch fails
            updateMarker(null);
        });
}

// Handle location sharing toggle
document.getElementById('location-sharing-toggle').addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    const sharingMode = document.getElementById('sharing-mode-select').value;
    
    try {
        const response = await fetch('/api/location-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isEnabled, sharingMode })
        });

        if (response.ok) {
            if (isEnabled) {
                startLocationTracking();
            } else {
                stopLocationTracking();
                if (currentUserMarker) {
                    map.removeLayer(currentUserMarker);
                    currentUserMarker = null;
                }
            }
        } else {
            // Revert toggle if update fails
            e.target.checked = !isEnabled;
        }
    } catch (error) {
        console.error('Error updating location settings:', error);
        e.target.checked = !isEnabled;
    }
});

// Handle sharing mode changes
document.getElementById('sharing-mode-select').addEventListener('change', async (e) => {
    const sharingMode = e.target.value;
    const isEnabled = document.getElementById('location-sharing-toggle').checked;
    
    try {
        const response = await fetch('/api/location-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isEnabled, sharingMode })
        });

        if (!response.ok) {
            e.target.value = e.target.dataset.previousValue;
        } else {
            e.target.dataset.previousValue = sharingMode;
        }
    } catch (error) {
        console.error('Error updating sharing mode:', error);
        e.target.value = e.target.dataset.previousValue;
    }
});

// Start location tracking
function startLocationTracking() {
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            updateUserLocation,
            error => console.error('Error tracking location:', error),
            { enableHighAccuracy: true }
        );
    }
}

// Stop location tracking
function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// Update user's location
async function updateUserLocation(position) {
    console.log('Updating location:', position); // Debug log
    try {
        const response = await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        createCurrentUserMarker(position);
    } catch (error) {
        console.error('Error updating location:', error);
    }
}

// Fetch and update connected users' locations
async function fetchConnectedUsersLocations() {
    try {
        const response = await fetch('/api/connected-users-locations');
        const locations = await response.json();

        // Update connected users list in sidebar
        updateConnectedUsersList(locations);

        // Update markers on the map
        for (const location of locations) {
            updateUserMarker(location);
        }
    } catch (error) {
        console.error('Error fetching locations:', error);
    }
}

// Update connected users list in sidebar
function updateConnectedUsersList(locations) {
    const container = document.getElementById('connected-users-list');
    container.innerHTML = locations.length ? '' : '<p>No connected users sharing location</p>';

    locations.forEach(user => {
        const lastUpdate = new Date(user.timestamp).toLocaleString();
        container.innerHTML += `
            <div class="user-location">
                <img src="data:image/jpeg;base64,${user.profile_pic}" alt="${user.username}" 
                    style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
                <strong>${user.username}</strong>
                <br>
                <small>Last seen: ${lastUpdate}</small>
            </div>
        `;
    });
}

// Update or create marker for a connected user
function updateUserMarker(userData) {
    const { username, latitude, longitude, profile_pic } = userData;

    if (userMarkers[username]) {
        userMarkers[username].setLatLng([latitude, longitude]);
    } else {
        const customIcon = createCustomMarker(profile_pic);
        const marker = L.marker([latitude, longitude], { icon: customIcon })
            .bindPopup(createPopupContent(userData))
            .addTo(map);
        userMarkers[username] = marker;
    }
}

// Create popup content for markers
function createPopupContent(userData) {
    const { username, timestamp, profile_pic } = userData;
    const lastUpdate = new Date(timestamp).toLocaleString();

    return `
        <div class="user-popup">
            <img src="data:image/jpeg;base64,${profile_pic}" alt="${username}">
            <h3>${username}</h3>
            <p>Last updated: ${lastUpdate}</p>
        </div>
    `;
}

// Initialize map when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Store initial sharing mode value
    const modeSelect = document.getElementById('sharing-mode-select');
    modeSelect.dataset.previousValue = modeSelect.value;
}); 