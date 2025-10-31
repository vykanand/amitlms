/**
 * Database Handshake Manager
 * Handles serverless database wake-up with session management
 */
class DatabaseHandshake {
  constructor(options = {}) {
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 2000;
    this.handshakeEndpoint = options.handshakeEndpoint || '/api/handshake';
    this.heartbeatEndpoint = options.heartbeatEndpoint || '/api/heartbeat';
    this.sessionCloseEndpoint = options.sessionCloseEndpoint || '/api/session/close';
    this.onReady = options.onReady || (() => {});
    this.onError = options.onError || ((error) => console.error('Database handshake error:', error));
    this.showOverlay = options.showOverlay !== false;
    this.overlayOptions = options.overlayOptions || {};
    
    this.isReady = false;
    this.currentAttempt = 0;
    this.loadingOverlay = null;
    this.sessionId = null;
    this.heartbeatInterval = null;
    this.heartbeatFrequency = 4 * 60 * 1000; // Send heartbeat every 4 minutes
    
    if (this.showOverlay) {
      this.createLoadingOverlay();
    }

    // Setup page unload handler to close session
    this.setupPageUnloadHandler();
  }

  /**
   * Creates the loading overlay using the modular LoadingOverlay class
   */
  createLoadingOverlay() {
    const defaultOptions = {
      id: 'db-handshake-overlay',
      title: 'Loading...',
      message: 'Please wait a moment...',
      showProgress: false,
      showAttempts: false,
      maxAttempts: this.retryAttempts
    };

    this.loadingOverlay = new LoadingOverlay({
      ...defaultOptions,
      ...this.overlayOptions
    });
  }

  /**
   * Updates the loading message and progress
   */
  updateLoadingState(message, progress = null, attempt = null) {
    if (!this.loadingOverlay) return;

    if (message) {
      this.loadingOverlay.updateMessage(message);
    }

    if (progress !== null) {
      this.loadingOverlay.updateProgress(progress);
    }

    if (attempt !== null) {
      this.loadingOverlay.updateAttempt(attempt);
    }
  }

  /**
   * Performs database handshake with retry logic
   */
  async performHandshake() {
    this.currentAttempt++;
    
    try {
      this.updateLoadingState('Loading...');

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
        // Store session ID for future heartbeats
        this.sessionId = data.sessionId;
        
        this.updateLoadingState('Ready!');
        
        // Set success state
        if (this.loadingOverlay) {
          this.loadingOverlay.setSuccessState('Ready!');
        }

        // Start heartbeat to keep session alive
        this.startHeartbeat();

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
        this.updateLoadingState('Retrying...');

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.performHandshake();
      } else {
        // All attempts failed
        this.updateLoadingState('Unable to load. Please refresh the page.');
        
        // Set error state
        if (this.loadingOverlay) {
          this.loadingOverlay.setErrorState('Unable to load. Please refresh the page.');
        }

        this.onError(error);
        return false;
      }
    }
  }

  /**
   * Hides the loading overlay
   */
  hideOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.hide();
    }
  }

  /**
   * Starts sending periodic heartbeats to keep the session alive
   */
  startHeartbeat() {
    if (!this.sessionId || this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      try {
        const response = await fetch(this.heartbeatEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId: this.sessionId })
        });

        const data = await response.json();
        if (!data.success) {
          this.stopHeartbeat();
        }
      } catch {
        // Silently handle heartbeat errors
      }
    }, this.heartbeatFrequency);
  }

  /**
   * Stops the heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Closes the session on the server
   */
  async closeSession() {
    if (!this.sessionId) return;

    try {
      await fetch(this.sessionCloseEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: this.sessionId })
      });
    } catch {
      // Silently handle session close errors
    }

    this.sessionId = null;
    this.stopHeartbeat();
  }

  /**
   * Setup handlers for page unload to clean up session
   */
  setupPageUnloadHandler() {
    // Handle page unload/close
    globalThis.addEventListener('beforeunload', () => {
      this.closeSession();
    });

    // Handle page visibility change (tab switching)
    globalThis.addEventListener('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible' && this.sessionId) {
        // User returned - resume heartbeat if needed
        if (!this.heartbeatInterval) {
          this.startHeartbeat();
        }
      }
    });
  }

  /**
   * Initiates the handshake process
   */
  async start() {
    if (this.showOverlay && this.loadingOverlay) {
      this.loadingOverlay.show();
    }
    
    return await this.performHandshake();
  }

  /**
   * Gets current session status
   */
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      isReady: this.isReady,
      hasHeartbeat: !!this.heartbeatInterval
    };
  }

  /**
   * Static method to initialize and start handshake
   */
  static async initialize(options = {}) {
    const handshake = new DatabaseHandshake(options);
    await handshake.start();
    
    // Store globally for session tracking
    globalThis.currentDatabaseHandshake = handshake;
    
    return handshake;
  }
}

// Global function to start database handshake with default options
globalThis.initializeDatabaseHandshake = function(options = {}) {
  return DatabaseHandshake.initialize(options);
};

// Global utility function to add session ID to API requests
globalThis.addSessionToRequest = function(url, options = {}) {
  const dbHandshake = globalThis.currentDatabaseHandshake;
  if (dbHandshake?.sessionId) {
    // Add session ID to headers
    options.headers = options.headers || {};
    options.headers['X-Session-ID'] = dbHandshake.sessionId;
  }
  return fetch(url, options);
};

// Store reference to current handshake instance
globalThis.currentDatabaseHandshake = null;

// Auto-export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DatabaseHandshake;
}