let authToken = null;

async function login(e) {
  e.preventDefault();
  const [email, password] = e.target.querySelectorAll('input');
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    });
    
    const data = await response.json();
    if (response.ok) {
      authToken = data.token;
      localStorage.setItem('authToken', data.token);
      showScannerUI(data.email, data.credits);
    }
  } catch (error) {
    showResult('Login failed', 'error');
  }
}

function showForm(formType) {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById(formType + 'Form').style.display = 'block';
  }
  
async function register(e) {
  e.preventDefault();
  const [email, pass, confirmPass] = e.target.querySelectorAll('input');
  
  if (pass.value !== confirmPass.value) {
    return showResult('Passwords mismatch', 'error');
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        password: pass.value
      })
    });
    
    if (response.ok) {
      showForm('login');
      showResult('Registration successful!', 'success');
    }
  } catch (error) {
    showResult('Registration failed', 'error');
  }
}

async function uploadDocument() {
  const fileInput = document.getElementById('documentInput');
  if (!fileInput.files.length) return;
  
  const file = fileInput.files[0];
  const content = await readFile(file);
  
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({
        name: file.name,
        content: content
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      document.getElementById('creditsCount').textContent = data.credits;
      showResult('Document scanned!', 'success');
    }
  } catch (error) {
    showResult('Upload failed', 'error');
  }
}

// Helper functions
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function showScannerUI(email, credits) {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('scannerContainer').style.display = 'block';
  document.getElementById('userEmail').textContent = email;
  document.getElementById('creditsCount').textContent = credits;
}

function logout() {
  authToken = null;
  localStorage.removeItem('authToken');
  location.reload();
}

// Initialize from localStorage
window.onload = () => {
  const token = localStorage.getItem('authToken');
  if (token) {
    authToken = token;
    fetch('/api/user', {
      headers: { 'Authorization': token }
    })
      .then(res => res.json())
      .then(data => showScannerUI(data.email, data.credits))
      .catch(logout);
  }
};