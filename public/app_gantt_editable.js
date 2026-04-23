(function loadMainApp() {
  const script = document.createElement('script');
  script.src = '/app.js';
  script.onload = () => {
    if (document.readyState !== 'loading') {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }
  };
  document.head.appendChild(script);
}());
