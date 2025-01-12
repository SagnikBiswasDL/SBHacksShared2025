document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleTheme');
    const body = document.body;
  
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        body.style.backgroundColor = 'white';
        body.style.color = 'black';
      } else {
        body.style.backgroundColor = 'black';
        body.style.color = 'white';
      }
    });
  });
  