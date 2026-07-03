/**
 * Lightweight toast notifications for the game UI.
 * Toasts stack top-center, auto-expire, and never block input.
 */
const CONTAINER_ID = 'toast-container';

const TYPE_COLORS = {
  info: 'rgba(40, 44, 52, 0.92)',
  success: 'rgba(38, 87, 48, 0.92)',
  error: 'rgba(120, 32, 32, 0.94)',
};

const ensureContainer = () => {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      pointerEvents: 'none',
    });
    document.body.appendChild(container);
  }
  return container;
};

/**
 * Show a toast message.
 * @param {string} message
 * @param {object} [options]
 * @param {'info'|'success'|'error'} [options.type]
 * @param {number} [options.duration] - ms before auto-dismiss
 */
const showToast = (message, { type = 'info', duration = 5000 } = {}) => {
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  Object.assign(toast.style, {
    background: TYPE_COLORS[type] || TYPE_COLORS.info,
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '6px',
    font: '15px/1.4 sans-serif',
    maxWidth: '70vw',
    textAlign: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    transition: 'opacity 0.4s',
    opacity: '1',
  });
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 450);
  }, duration);

  return toast;
};

export default showToast;
