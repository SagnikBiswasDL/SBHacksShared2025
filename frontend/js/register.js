document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
  
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      const formData = new FormData(registerForm);
      const data = Object.fromEntries(formData);
  
      if (data.password !== data.confirmPassword) {
        alert("Passwords don't match!");
        return;
      }
  
      const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
  
      const messageBox = document.createElement('div');
      messageBox.className = 'notification';
  
      if (response.ok) {
        messageBox.textContent = 'Account Created! Please Log In';
        messageBox.style.backgroundColor = 'green';
      } else {
        messageBox.textContent = 'Error: Could not create account';
        messageBox.style.backgroundColor = 'red';
      }
  
      document.body.appendChild(messageBox);
      setTimeout(() => messageBox.remove(), 3000);
    });
  });
  