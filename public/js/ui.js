// Small UI helpers shared by the other scripts (toasts, field errors, validation).
window.Chat = window.Chat || {};
(function (Chat) {
  function toast(type, message, ms) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type; // error (red), success (green), info
    el.textContent = message; // textContent: never insert server text as HTML
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || 4000);
  }

  function setFieldError(input, message) {
    const slot = document.querySelector('.field-error[data-for="' + input.id + '"]');
    if (slot) slot.textContent = message || '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  // Client-side checks mirror the SRS rules (the server remains the authority).
  const validate = {
    username(v) {
      const s = v.trim();
      if (s.length < 3 || s.length > 20) return 'Username must be 3 to 20 characters';
      return '';
    },
    email(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address';
    },
    password(v) {
      if (v.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Password needs at least one letter and one digit';
      return '';
    },
    required(v, label) {
      return v.trim() ? '' : label + ' is required';
    },
  };

  Chat.ui = { toast, setFieldError, validate };
})(window.Chat);
