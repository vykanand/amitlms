/**
 * Modular Loading Overlay System
 * A reusable loading overlay that can be used across the application
 */
class LoadingOverlay {
  constructor(options = {}) {
    this.id = options.id || 'loading-overlay';
    this.title = options.title || 'Loading...';
    this.message = options.message || 'Please wait...';
    this.showProgress = options.showProgress !== false;
    this.showAttempts = options.showAttempts || false;
    this.maxAttempts = options.maxAttempts || 3;
    this.currentAttempt = 0;
    this.theme = options.theme || 'default'; // default, dark, light
    this.size = options.size || 'medium'; // small, medium, large
    
    this.overlay = null;
    this.isVisible = false;
  }

  /**
   * Creates and shows the loading overlay
   */
  show() {
    if (this.isVisible) return;

    this.overlay = document.createElement('div');
    this.overlay.id = this.id;
    this.overlay.className = `loading-overlay theme-${this.theme} size-${this.size}`;
    
    this.overlay.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-content">
          <h3 class="loading-title">${this.title}</h3>
          <p class="loading-message" id="${this.id}-message">${this.message}</p>
          ${this.showProgress ? `
            <div class="loading-progress">
              <div class="progress-bar" id="${this.id}-progress"></div>
            </div>
          ` : ''}
          ${this.showAttempts ? `
            <p class="loading-attempts" id="${this.id}-attempts">
              Attempt <span id="${this.id}-current-attempt">1</span> of ${this.maxAttempts}
            </p>
          ` : ''}
        </div>
      </div>
    `;

    // Add styles if not already added
    if (!document.querySelector('#loading-overlay-styles')) {
      this.addStyles();
    }

    document.body.appendChild(this.overlay);
    this.isVisible = true;

    // Trigger animation
    requestAnimationFrame(() => {
      this.overlay.classList.add('visible');
    });
  }

  /**
   * Hides and removes the loading overlay
   */
  hide() {
    if (!this.isVisible || !this.overlay) return;

    this.overlay.classList.add('hiding');
    
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      this.isVisible = false;
    }, 300);
  }

  /**
   * Updates the loading message
   */
  updateMessage(message) {
    if (!this.isVisible) return;
    const messageEl = document.getElementById(`${this.id}-message`);
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  /**
   * Updates the progress bar (0-100)
   */
  updateProgress(percent) {
    if (!this.isVisible || !this.showProgress) return;
    const progressEl = document.getElementById(`${this.id}-progress`);
    if (progressEl) {
      progressEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  }

  /**
   * Updates the attempt counter
   */
  updateAttempt(current) {
    if (!this.isVisible || !this.showAttempts) return;
    this.currentAttempt = current;
    const attemptEl = document.getElementById(`${this.id}-current-attempt`);
    if (attemptEl) {
      attemptEl.textContent = current;
    }
  }

  /**
   * Sets the overlay to error state
   */
  setErrorState(errorMessage) {
    if (!this.isVisible) return;
    this.overlay.classList.add('error-state');
    if (errorMessage) {
      this.updateMessage(errorMessage);
    }
  }

  /**
   * Sets the overlay to success state
   */
  setSuccessState(successMessage) {
    if (!this.isVisible) return;
    this.overlay.classList.add('success-state');
    if (successMessage) {
      this.updateMessage(successMessage);
    }
  }

  /**
   * Adds CSS styles to the document
   */
  addStyles() {
    const style = document.createElement('style');
    style.id = 'loading-overlay-styles';
    style.textContent = `
      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .loading-overlay.visible {
        opacity: 1;
      }

      .loading-overlay.hiding {
        opacity: 0;
      }

      .loading-container {
        background: white;
        border-radius: 16px;
        padding: 40px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        min-width: 320px;
        transform: scale(0.9);
        transition: transform 0.3s ease;
      }

      .loading-overlay.visible .loading-container {
        transform: scale(1);
      }

      .loading-spinner {
        width: 60px;
        height: 60px;
        border: 4px solid #f3f4f6;
        border-top: 4px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .loading-content h3 {
        margin: 0 0 10px 0;
        color: #1f2937;
        font-size: 20px;
        font-weight: 600;
      }

      .loading-content p {
        margin: 0 0 15px 0;
        color: #6b7280;
        font-size: 14px;
        line-height: 1.4;
      }

      .loading-progress {
        width: 100%;
        height: 6px;
        background: #f3f4f6;
        border-radius: 3px;
        overflow: hidden;
        margin: 15px 0;
      }

      .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #8b5cf6);
        border-radius: 3px;
        width: 0%;
        transition: width 0.3s ease;
        animation: pulse 2s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .loading-attempts {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 10px;
      }

      /* Error State */
      .loading-overlay.error-state .loading-spinner {
        border-top-color: #dc2626;
      }

      .loading-overlay.error-state .loading-content h3,
      .loading-overlay.error-state .loading-message {
        color: #dc2626;
      }

      .loading-overlay.error-state .progress-bar {
        background: linear-gradient(90deg, #dc2626, #ef4444);
      }

      /* Success State */
      .loading-overlay.success-state .loading-spinner {
        border-top-color: #059669;
      }

      .loading-overlay.success-state .loading-content h3,
      .loading-overlay.success-state .loading-message {
        color: #059669;
      }

      .loading-overlay.success-state .progress-bar {
        background: linear-gradient(90deg, #059669, #10b981);
      }

      /* Theme Variations */
      .loading-overlay.theme-dark {
        background: rgba(0, 0, 0, 0.9);
      }

      .loading-overlay.theme-dark .loading-container {
        background: #1f2937;
        color: white;
      }

      .loading-overlay.theme-dark .loading-content h3 {
        color: white;
      }

      .loading-overlay.theme-dark .loading-content p {
        color: #d1d5db;
      }

      .loading-overlay.theme-light {
        background: rgba(255, 255, 255, 0.9);
      }

      /* Size Variations */
      .loading-overlay.size-small .loading-container {
        padding: 20px;
        min-width: 200px;
      }

      .loading-overlay.size-small .loading-spinner {
        width: 40px;
        height: 40px;
      }

      .loading-overlay.size-small .loading-content h3 {
        font-size: 16px;
      }

      .loading-overlay.size-large .loading-container {
        padding: 60px;
        min-width: 500px;
      }

      .loading-overlay.size-large .loading-spinner {
        width: 80px;
        height: 80px;
      }

      .loading-overlay.size-large .loading-content h3 {
        font-size: 24px;
      }

      @media (max-width: 480px) {
        .loading-container {
          margin: 20px;
          padding: 30px 20px;
          min-width: auto;
        }
        
        .loading-overlay.size-large .loading-container {
          padding: 40px 20px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Static method to create and show a simple loading overlay
   */
  static show(options = {}) {
    const overlay = new LoadingOverlay(options);
    overlay.show();
    return overlay;
  }

  /**
   * Static method to create a quick loading overlay for async operations
   */
  static async withLoading(asyncFunction, options = {}) {
    const overlay = LoadingOverlay.show(options);
    
    try {
      const result = await asyncFunction(overlay);
      overlay.setSuccessState(options.successMessage || 'Complete!');
      
      // Auto-hide after showing success
      setTimeout(() => overlay.hide(), 1000);
      
      return result;
    } catch (error) {
      overlay.setErrorState(options.errorMessage || 'An error occurred');
      
      // Auto-hide after showing error
      setTimeout(() => overlay.hide(), 3000);
      
      throw error;
    }
  }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoadingOverlay;
}

// Utility functions for common scenarios
LoadingOverlay.showForApiCall = function(apiFunction, options = {}) {
  return LoadingOverlay.withLoading(apiFunction, {
    title: 'Loading...',
    message: 'Please wait...',
    showProgress: false,
    successMessage: 'Ready!',
    errorMessage: 'Unable to load. Please try again.',
    ...options
  });
};

LoadingOverlay.showForFormSubmission = function(submitFunction, options = {}) {
  return LoadingOverlay.withLoading(submitFunction, {
    title: 'Processing...',
    message: 'Please wait...',
    showProgress: false,
    successMessage: 'Complete!',
    errorMessage: 'Unable to process. Please try again.',
    ...options
  });
};

LoadingOverlay.showForFileUpload = function(uploadFunction, options = {}) {
  return LoadingOverlay.withLoading(uploadFunction, {
    title: 'Uploading...',
    message: 'Please wait...',
    showProgress: true,
    successMessage: 'Upload complete!',
    errorMessage: 'Upload failed. Please try again.',
    ...options
  });
};

// Global access
globalThis.LoadingOverlay = LoadingOverlay;