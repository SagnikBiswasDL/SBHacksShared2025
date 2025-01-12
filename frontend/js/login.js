document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
  
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      const formData = new FormData(loginForm);
      const data = Object.fromEntries(formData);
  
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
  
      const messageBox = document.createElement('div');
      messageBox.className = 'notification';
  
      if (response.ok) {
        const result = await response.json();
        window.location.href = `/home.html?username=${result.username}`;
      } else {
        messageBox.textContent = 'Invalid Username or Password';
        messageBox.style.backgroundColor = 'red';
        document.body.appendChild(messageBox);
        setTimeout(() => messageBox.remove(), 3000);
      }
    });
  });
  