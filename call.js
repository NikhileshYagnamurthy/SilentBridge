// call.js — Fixed version
// Handles WebRTC video calling using PeerJS

const Call = {
  peer: null,
  localStream: null,
  currentCall: null,
  roomId: null,
  isHost: false,
  dataConn: null,
  camEnabled: true,
  micEnabled: true,

  async getLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true
      });
      return this.localStream;
    } catch (e) {
      showToast('❌ Camera/mic access denied. Please allow and refresh.');
      throw e;
    }
  },

  // ── Create a new room (you are the host) ──
  async createRoom() {
    await this.getLocalStream();

    // Show local video right away
    const localVid = document.getElementById('local-video');
    localVid.srcObject = this.localStream;
    localVid.play().catch(() => {});

    return new Promise((resolve, reject) => {
      const roomId = this._generateRoomId();

      this.peer = new Peer(roomId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        this.roomId = id;
        this.isHost = true;
        console.log('[Host] Room ready:', id);

        // Wait for joiner to call us
        this.peer.on('call', (incomingCall) => {
          console.log('[Host] Incoming call');
          incomingCall.answer(this.localStream);
          this._handleCall(incomingCall);
        });

        // Wait for data channel
        this.peer.on('connection', (conn) => {
          console.log('[Host] Data channel from joiner');
          this._setupDataConn(conn);
        });

        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('[Host] PeerJS error:', err);
        showToast('⚠️ Connection error: ' + err.type);
        reject(err);
      });
    });
  },

  // ── Join a room ──
  async joinRoom(roomId) {
    await this.getLocalStream();

    const localVid = document.getElementById('local-video');
    localVid.srcObject = this.localStream;
    localVid.play().catch(() => {});

    return new Promise((resolve, reject) => {
      this.peer = new Peer(undefined, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (myId) => {
        this.roomId = roomId;
        this.isHost = false;
        console.log('[Joiner] My ID:', myId, '→ Host:', roomId);

        // Open data channel first, then call
        const conn = this.peer.connect(roomId, { reliable: true });
        conn.on('open', () => {
          console.log('[Joiner] Data channel open, now calling host');
          this._setupDataConn(conn);
          const outCall = this.peer.call(roomId, this.localStream);
          this._handleCall(outCall);
        });
        conn.on('error', (e) => {
          console.error('[Joiner] Data conn error:', e);
          showToast('⚠️ Could not connect to host');
        });

        // Timeout fallback — if host doesn't respond in 10s
        setTimeout(() => {
          if (!this.currentCall) {
            showToast('❌ Room not found or host offline. Check Room ID.');
          }
        }, 10000);

        resolve(myId);
      });

      this.peer.on('error', (err) => {
        console.error('[Joiner] PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
          showToast('❌ Room not found. Check the Room ID.');
        } else {
          showToast('⚠️ Error: ' + err.type);
        }
        reject(err);
      });
    });
  },

  _setupDataConn(conn) {
    this.dataConn = conn;
    conn.on('data', (data) => {
      if (data && data.type === 'gesture') {
        this._onRemoteGesture(data.label);
      }
    });
    conn.on('close', () => { this.dataConn = null; });
  },

  sendGesture(label) {
    if (this.dataConn && this.dataConn.open) {
      this.dataConn.send({ type: 'gesture', label });
    }
  },

  _handleCall(call) {
    if (!call) {
      showToast('❌ Could not connect. Check Room ID.');
      return;
    }
    this.currentCall = call;

    call.on('stream', (remoteStream) => {
      console.log('[Call] Got remote stream');
      const rv = document.getElementById('remote-video');
      rv.srcObject = remoteStream;
      rv.play().catch(() => {});
      document.getElementById('remote-placeholder').style.display = 'none';
      showToast('✅ Connected! Turn on Gestures to start.');
    });

    call.on('close', () => {
      showToast('📵 Other person disconnected');
      document.getElementById('remote-placeholder').style.display = 'flex';
    });

    call.on('error', (e) => {
      console.error('[Call] Error:', e);
      showToast('⚠️ Call error — try refreshing');
    });
  },

  _onRemoteGesture(label) {
    const display = document.getElementById('detected-text');
    if (display) {
      display.textContent = label;
      display.style.transform = 'scale(1.1)';
      setTimeout(() => display.style.transform = '', 300);

      const history = document.getElementById('text-history');
      if (history) {
        const chip = document.createElement('div');
        chip.className = 'history-chip';
        chip.textContent = label;
        history.prepend(chip);
        while (history.children.length > 10) history.removeChild(history.lastChild);
      }
    }
  },

  toggleCamera() {
    if (this.localStream) {
      const track = this.localStream.getVideoTracks()[0];
      if (track) {
        this.camEnabled = !this.camEnabled;
        track.enabled = this.camEnabled;
        return this.camEnabled;
      }
    }
    return this.camEnabled;
  },

  toggleMic() {
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        this.micEnabled = !this.micEnabled;
        track.enabled = this.micEnabled;
        return this.micEnabled;
      }
    }
    return this.micEnabled;
  },

  end() {
    try { if (this.currentCall) this.currentCall.close(); } catch(e) {}
    try { if (this.dataConn) this.dataConn.close(); } catch(e) {}
    try { if (this.peer) this.peer.destroy(); } catch(e) {}
    if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
    this.peer = null; this.localStream = null;
    this.currentCall = null; this.dataConn = null;
    this.roomId = null; this.camEnabled = true; this.micEnabled = true;
  },

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
};
