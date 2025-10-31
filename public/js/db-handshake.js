/**
 * Database Handshake and Loading Overlay Manager
 * Handles serverless database wake-up and UI loading states
 */
class DatabaseHandshake {
  constructor(options = {}) {
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 2000;
    this.handshakeEndpoint = options.handshakeEndpoint || '/api/handshake';
    this.onReady = options.onReady || (() => {});
    this.onError = options.onError || ((error) => console.error('Database handshake error:', error));
    
    this.isReady = false;
    this.currentAttempt = 0;
    
    this.createLoadingOverlay();
  }

  /**
   * Creates the loading overlay HTML structure
   */
  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'db-loading-overlay';
    overlay.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">
          <h3>Connecting to Database...</h3>
          <p id="loading-message">Waking up serverless database, please wait...</p>
          <div class="loading-progress">
            <div class="progress-bar" id="progress-bar"></div>
          </div>
          <p class="loading-attempts" id="loading-attempts">Attempt <span id="current-attempt">1</span> of ${this.retryAttempts}</p>
        </div>
      </div>
    `;

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
      #db-loading-overlay {
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
      }

      .loading-container {
        background: white;
        border-radius: 16px;
        padding: 40px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        min-width: 320px;
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

      .loading-text h3 {
        margin: 0 0 10px 0;
        color: #1f2937;
        font-size: 20px;
        font-weight: 600;
      }

      .loading-text p {
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

      .error-state {
        color: #dc2626 !important;
      }

      .error-state .loading-spinner {
        border-top-color: #dc2626;
      }

      .success-state {
        color: #059669 !important;
      }

      .success-state .loading-spinner {
        border-top-color: #059669;
      }

      @media (max-width: 480px) {
        .loading-container {
          margin: 20px;
          padding: 30px 20px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);
  }

  /**
   * Updates the loading message and progress
   */
  updateLoadingState(message, progress = null, attempt = null) {
    const messageEl = document.getElementById('loading-message');
    const progressEl = document.getElementById('progress-bar');
    const attemptEl = document.getElementById('current-attempt');

    if (messageEl && message) {
      messageEl.textContent = message;
    }

    if (progressEl && progress !== null) {
      progressEl.style.width = `${progress}%`;
    }

    if (attemptEl && attempt !== null) {
      attemptEl.textContent = attempt;
    }
  }

  /**
   * Performs database handshake with retry logic
   */
  async performHandshake() {
    this.currentAttempt++;
    
    try {
      this.updateLoadingState(
        `Attempting to connect... (${this.currentAttempt}/${this.retryAttempts})`,
        (this.currentAttempt / this.retryAttempts) * 70,
        this.currentAttempt
      );

      const response = await fetch(this.handshakeEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        this.updateLoadingState('Database connected successfully!', 100);
        
        // Add success state
        const container = document.querySelector('.loading-container');
        container.classList.add('success-state');

        // Wait a moment to show success, then hide overlay
        setTimeout(() => {
          this.hideOverlay();
          this.isReady = true;
          this.onReady();
        }, 1000);

        return true;
      } else {
        throw new Error(data.error || 'Handshake failed');
      }

    } catch (error) {
      console.error(`Handshake attempt ${this.currentAttempt} failed:`, error);

      if (this.currentAttempt < this.retryAttempts) {
        this.updateLoadingState(
          `Connection failed. Retrying in ${this.retryDelay / 1000} seconds...`,
          (this.currentAttempt / this.retryAttempts) * 70
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.performHandshake();
      } else {
        // All attempts failed
        this.updateLoadingState('Connection failed. Please refresh the page to try again.', 100);
        
        // Add error state
        const container = document.querySelector('.loading-container');
        container.classList.add('error-state');

        this.onError(error);
        return false;
      }
    }
  }

  /**
   * Hides the loading overlay
   */
  hideOverlay() {
    const overlay = document.getElementById('db-loading-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
  }

  /**
   * Initiates the handshake process
   */
  async start() {
    console.log('Starting database handshake...');
    return await this.performHandshake();
  }

  /**
   * Static method to initialize and start handshake
   */
  static async initialize(options = {}) {
    const handshake = new DatabaseHandshake(options);
    await handshake.start();
    return handshake;
  }
}

// Global function to start database handshake with default options
window.initializeDatabaseHandshake = function(options = {}) {
  return DatabaseHandshake.initialize(options);
};

// Auto-export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DatabaseHandshake;
}