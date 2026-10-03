document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  document.querySelectorAll('[data-nav]').forEach((link) => {
    const href = link.getAttribute('href');
    const current = window.location.pathname.split('/').pop() || 'index.html';
    if (href === current) {
      link.classList.add('is-active');
    }
  });

  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mainNavigation = document.getElementById('main-navigation');
  if (menuToggle && mainNavigation) {
    const closeMenu = () => {
      mainNavigation.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation menu');
      menuToggle.innerHTML = '<i data-lucide="menu" class="w-5 h-5" aria-hidden="true"></i>';
      if (window.lucide) lucide.createIcons();
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = mainNavigation.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      menuToggle.innerHTML = `<i data-lucide="${isOpen ? 'x' : 'menu'}" class="w-5 h-5" aria-hidden="true"></i>`;
      if (window.lucide) lucide.createIcons();
    });

    mainNavigation.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  const lengthInput = document.getElementById('passwordLength');
  const lengthValue = document.getElementById('passwordLengthValue');
  const passwordOutput = document.getElementById('generatedPassword');
  const uppercaseToggle = document.getElementById('includeUppercase');
  const numbersToggle = document.getElementById('includeNumbers');
  const symbolsToggle = document.getElementById('includeSymbols');
  const generateBtn = document.getElementById('generatePasswordBtn');
  const copyBtn = document.getElementById('copyPasswordBtn');

  const generatePassword = () => {
    const length = Number(lengthInput?.value || 16);
    const uppercase = uppercaseToggle ? uppercaseToggle.checked : true;
    const numbers = numbersToggle ? numbersToggle.checked : true;
    const symbols = symbolsToggle ? symbolsToggle.checked : true;

    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const syms = '!@#$%^&*()-_=+[]{};:,.?';

    let pool = letters;
    if (uppercase) pool += upper;
    if (numbers) pool += nums;
    if (symbols) pool += syms;

    let result = '';
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      result += pool.charAt(index);
    }

    if (passwordOutput) {
      passwordOutput.textContent = result;
    }

    return result;
  };

  if (lengthInput && lengthValue) {
    const syncLength = () => {
      const value = lengthInput.value;
      lengthValue.textContent = value;
    };

    lengthInput.addEventListener('input', syncLength);
    syncLength();
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', generatePassword);
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const password = passwordOutput ? passwordOutput.textContent : '';
      if (!password) return;
      try {
        await navigator.clipboard.writeText(password);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy password';
        }, 1200);
      } catch (error) {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }

  generatePassword();
});
