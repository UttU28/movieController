import toast from 'react-hot-toast';

interface ToastOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

const defaultOptions: ToastOptions = {
  duration: 3000,
  position: 'top-center',
};

export const showToast = {
  error: (message: string, options: ToastOptions = {}) => {
    toast.error(message, {
      style: {
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        fontSize: '0.875rem',
      },
      position: options.position || defaultOptions.position,
      duration: options.duration || defaultOptions.duration,
    });
  },

  success: (message: string, options: ToastOptions = {}) => {
    toast.success(message, {
      style: {
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        fontSize: '0.875rem',
      },
      position: options.position || defaultOptions.position,
      duration: options.duration || defaultOptions.duration,
    });
  },
};