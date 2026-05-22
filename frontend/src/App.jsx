import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './index.css';
import {
  initializeKeys, importPublicKey, encryptMessage, decryptMessage,
  getOwnPublicKey, generateAESKey, exportAESKey, importAESKey, encryptAES, decryptAES
} from './crypto';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenManager';

axios.defaults.withCredentials = true;

// Get the hostname that the user typed in the browser (e.g., 'localhost' or '192.168.100.15')
const hostname = window.location.hostname;

// If hostname is 'localhost' or '127.0.0.1', use localhost; otherwise use the same hostname
const backendHost = (hostname === 'localhost' || hostname === '127.0.0.1') 
  ? 'localhost' 
  : hostname;

const API_BASE = import.meta.env.VITE_API_BASE || `http://${backendHost}:8000/api`;
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${backendHost}:8000/ws/dm`;
const WS_GROUP = import.meta.env.VITE_WS_GROUP || `ws://${backendHost}:8000/ws/group`;
const WS_PRESENCE = import.meta.env.VITE_WS_PRESENCE || `ws://${backendHost}:8000/ws/presence`;
const FILE_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

// ─── Axios JWT Interceptor ────────────────────────────────────────────────────
axios.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.includes('/token/refresh/')) {
      original._retry = true;
      try {
        const res = await axios.post(`${API_BASE}/token/refresh/`);
        const newAccessToken = res.data.access;
        setAccessToken(newAccessToken);
        original.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return axios(original);
      } catch {
        clearAccessToken();
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

const DECORATIONS = {
  general: "ls -la\nsudo apt update\nchmod +x script.sh\ncat /etc/passwd\ngrep -r 'securinets'\nwhoami\nps aux\nnetstat -tuln\nCyber security is not a product but a process.",
  crypto: "openssl genrsa\nbase64 -d\nAES-256-CBC\nRSA-4096\nsha256sum\nROT13 decryption\nElliptic Curve Cryptography\nIn cryptography we trust.",
  web_exp: "sqlmap -u target.com\nxss payload <script>\ndirb http://target\nburp suite professional\nLFI /etc/passwd\nCSRF token bypass\nIDOR vulnerability",
  forensics: "strings memory.dmp\nvolatility -f mem.raw\nexiftool image.jpg\nbinwalk -e firmware.bin\nautopsy digital investigation\nwireshark pcap analysis\nFTK Imager",
  reverse: "objdump -d binary\nchmod +x crackme\nbinary ninja\ngdb -q ./exec\nIDA Pro static analysis\nghidra decompiler\nradare2 command line\nStatic analysis vs Dynamic analysis",
  pwn: "checksec ./binary\ncyclic 100\npattern offset\nROP chain gadget\nstack canary bypass\nASLR disabled\nshellcode injected\nHeap exploitation",
  mobile: "adb shell\nfrida-ps -Uai\nobjection explore\ndex2jar classes.dex\njadx-gui decompilation\nruntime instrumentation\nipa injection",
  linux: "ls -R /\nfind / -perm -4000\nchown root:root\necho $PATH\numask 022\nsystemctl status ssh\ntop -i\nvi /etc/shadow",
  networking: "nmap -sV -sC\ntraceroute 8.8.8.8\nip addr show\nssh-keygen -t rsa\ntcpdump -i eth0\narp -a\ndnsenum example.com",
  web_dev: "npm install react\nvite build\nconst [data, setData] = useState([]);\nconsole.log(error);\nflex-direction: column;\nmedia queries\nrest api endpoint",
  threat_intel: "IOC list updated\nMISP synchronization\nMITRE ATT&CK framework\nAPT groups tracking\nTTP analysis\nthreat actor profiling\nOSINT data gathering"
};

// Updated MessageMenu (removed emojis)
const MessageMenu = ({ onReply, onDelete, isOwnMessage }) => { // Removed onReact prop
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = () => setShowMenu(!showMenu);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          color: 'var(--text-muted)',
          padding: '2px 4px',
          borderRadius: '4px',
          lineHeight: 1,
        }}
      >
        ⋮
      </button>
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '4px 0',
            minWidth: '100px',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          onMouseLeave={() => setShowMenu(false)}
        >
          <button
            onClick={() => {
              onReply();
              setShowMenu(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-color)',
            }}
          >
            Reply {/* Removed 💬 */}
          </button>

          {/* REMOVED THE "REACT" BUTTON FROM HERE */}

          {isOwnMessage && (
            <button
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#e74c3c',
              }}
            >
              Delete {/* Removed 🗑️ */}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
// ─── Presence Context ─────────────────────────────────────────────────────────
const PresenceContext = React.createContext({}); //

// ─── Avatar with online indicator ────────────────────────────────────────────
const Avatar = ({ user, size = 32, showPresence = false, onlineUsers = {} }) => {
  const isOnline = showPresence && onlineUsers[user?.id];
  const dotSize = Math.max(8, size * 0.28);
  const img = user?.avatar_url ? (
    <img
      src={user.avatar_url}
      alt={user.username}
      style={{
        width: size, height: size, borderRadius: '50%',
        objectFit: 'cover', flexShrink: 0,
        border: '2px solid var(--border-color)',
        display: 'block',
      }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--primary-color)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 'bold', flexShrink: 0,
      border: '2px solid var(--border-color)',
    }}>
      {(user?.display_name || user?.username || '?')[0].toUpperCase()}
    </div>
  );

  if (!showPresence) return img;

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      {img}
      <span style={{
        position: 'absolute',
        bottom: 0, right: 0,
        width: dotSize, height: dotSize,
        borderRadius: '50%',
        background: isOnline ? '#22c55e' : '#6b7280',
        border: '2px solid var(--sidebar-bg)',
        display: 'block',
        transition: 'background 0.3s',
      }} title={isOnline ? 'Online' : 'Offline'} />
    </div>
  );
};

// ─── Mini avatar for "seen by" indicators ────────────────────────────────────
const MiniAvatar = ({ user, size = 18 }) => {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.username}
        title={`Seen by ${user.display_name || user.username}`}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '1.5px solid var(--bg-color)',
          marginLeft: -4,
        }}
      />
    );
  }
  return (
    <div
      title={`Seen by ${user?.display_name || user?.username}`}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--primary-color)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45, fontWeight: 'bold',
        border: '1.5px solid var(--bg-color)',
        marginLeft: -4,
      }}
    >
      {(user?.display_name || user?.username || '?')[0].toUpperCase()}
    </div>
  );
};

// ─── Flash Component ──────────────────────────────────────────────────────────
const Flash = ({ flash }) => {
  if (!flash) return null;
  return (
    <div className={`flash-message ${flash.type === 'success' ? 'flash-success' : 'flash-error'}`}>
      <span>{flash.msg}</span>
    </div>
  );
};

// ─── useFlash hook ────────────────────────────────────────────────────────────
const useFlash = () => {
  const [flash, setFlash] = useState(null);
  const timerRef = useRef(null);

  const showFlash = useCallback((msg, type = 'error') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlash({ msg, type });
    timerRef.current = setTimeout(() => setFlash(null), 3500);
  }, []);

  // Cleanup timeout if component unmounts before timer finishes
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { flash, showFlash };
};

// Renamed and simplified
const MessageActionsBar = ({ messageId, onReply, onDelete, isOwnMessage }) => {
  return (
    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
      {/* Three-dot menu ONLY */}
      <MessageMenu
        onReply={() => onReply?.(messageId)}
        onDelete={() => onDelete?.(messageId)}
        isOwnMessage={isOwnMessage}
      />
    </div>
  );
};

// ─── FileMessage ──────────────────────────────────────────────────────────────
const FileMessage = ({ fileUrl, fileName, fileType }) => {
  const fullUrl = fileUrl?.startsWith('http') ? fileUrl : `${window.location.origin}${fileUrl}`;
  if (!fileUrl) return null;

  const isImage = fileType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName || '');
  const isVideo = fileType?.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(fileName || '');

  if (isImage) {
    return (
      <a href={fullUrl} target="_blank" rel="noreferrer">
        <img src={fullUrl} alt={fileName} style={{
          maxWidth: '220px', maxHeight: '200px', borderRadius: '8px',
          marginTop: '6px', display: 'block', objectFit: 'cover',
          border: '1px solid var(--border-color)',
        }} />
      </a>
    );
  }
  if (isVideo) {
    return (
      <video controls style={{ maxWidth: '280px', marginTop: '6px', borderRadius: '8px', display: 'block' }}>
        <source src={fullUrl} />
      </video>
    );
  }
  return (
    <a href={fullUrl} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: 'var(--input-bg)', border: '1px solid var(--border-color)',
      borderRadius: '8px', padding: '6px 12px', marginTop: '6px',
      color: 'var(--primary-color)', fontSize: '0.82rem', textDecoration: 'none',
    }}>
      📎 {fileName || 'Download file'}
    </a>
  );
};

// ─── TypingIndicator ──────────────────────────────────────────────────────────
const TypingIndicator = ({ typingUsers, allUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;
  const names = typingUsers
    .map(id => {
      const u = allUsers?.find(u => u.id === id);
      return u ? (u.display_name || u.username) : 'Someone';
    })
    .join(', ');
  const label = typingUsers.length === 1 ? `${names} is typing` : `${names} are typing`;
  return (
    <div style={{
      padding: '4px 1.5rem 2px',
      fontSize: '0.75rem',
      color: 'var(--text-muted)',
      fontStyle: 'italic',
      display: 'flex', alignItems: 'center', gap: '6px',
      minHeight: '20px',
    }}>
      <span style={{ display: 'inline-flex', gap: '2px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: `typingBounce 1s ease-in-out ${i * 0.15}s infinite`,
            display: 'inline-block',
          }} />
        ))}
      </span>
      {label}...
    </div>
  );
};

// ─── ProfileSetupPage ─────────────────────────────────────────────────────────
const ProfileSetupPage = ({ user, onComplete }) => {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || null);
  const [submitting, setSubmitting] = useState(false);
  const { flash, showFlash } = useFlash();

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('display_name', displayName);
      formData.append('bio', bio);
      if (avatarFile) formData.append('avatar', avatarFile);
      const res = await axios.put(`${API_BASE}/profile/`, formData);
      onComplete(res.data);
    } catch (err) {
      showFlash(err.response?.data?.error || 'Failed to save profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-color)',
        borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '420px',
        display: 'flex', flexDirection: 'column', gap: '1.5rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.4rem' }}>Set up your profile</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>You can always change this later in settings</p>
        </div>
        <Flash flash={flash} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('avatar-upload-setup').click()}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)' }} />
            ) : (
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                background: 'var(--input-bg)', border: '2px dashed var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center',
              }}>Upload photo</div>
            )}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              background: 'var(--primary-color)', borderRadius: '50%',
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
            }}>✏️</div>
          </div>
          <input id="avatar-upload-setup" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How should others see you?" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell the team a little about yourself..."
            style={{ width: '100%', minHeight: '80px', padding: '0.6rem 1rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        <button className="btn" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>{submitting ? 'Saving...' : 'Continue to app →'}</button>
        <button onClick={() => onComplete(user)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', textAlign: 'center' }}>Skip for now</button>
      </div>
    </div>
  );
};

// ─── ProfileSettingsPage ──────────────────────────────────────────────────────
const ProfileSettingsPage = ({ user, onClose, onUserUpdated }) => {
  const [tab, setTab] = useState('profile');
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [username, setUsername] = useState(user.username || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { flash, showFlash } = useFlash();

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleProfileSave = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('display_name', displayName);
      formData.append('bio', bio);
      formData.append('username', username);
      if (avatarFile) formData.append('avatar', avatarFile);
      const res = await axios.put(`${API_BASE}/profile/`, formData);
      onUserUpdated(res.data);
      showFlash('Profile updated!', 'success');
    } catch (err) {
      showFlash(err.response?.data?.error || 'Failed to update profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) { showFlash('New passwords do not match.', 'error'); return; }
    if (newPassword.length < 8) { showFlash('Password must be at least 8 characters.', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/profile/change-password/`, { old_password: oldPassword, new_password: newPassword });
      setAccessToken(res.data.access);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      showFlash('Password changed successfully!', 'success');
    } catch (err) {
      showFlash(err.response?.data?.error || 'Failed to change password.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-color)' }}>Account Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1.5rem' }}>
          {['profile', 'password'].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: tab === t ? 'bold' : 'normal', color: tab === t ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--primary-color)' : '2px solid transparent', textTransform: 'capitalize' }}>
              {t === 'profile' ? 'Profile' : 'Password'}
            </button>
          ))}
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Flash flash={flash} />
          {tab === 'profile' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('avatar-upload-settings').click()}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)' }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {(user.display_name || user.username)[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--primary-color)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>✏️</div>
                </div>
                <input id="avatar-upload-settings" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--text-color)', fontSize: '0.9rem' }}>{user.display_name || user.username}</p>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>@{user.username}</p>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}><label>Username</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Display Name</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell the team about yourself..."
                  style={{ width: '100%', minHeight: '80px', padding: '0.6rem 1rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <button className="btn" onClick={handleProfileSave} disabled={submitting} style={{ width: '100%' }}>{submitting ? 'Saving...' : 'Save Profile'}</button>
            </>
          )}
          {tab === 'password' && (
            <>
              <div className="form-group" style={{ margin: 0 }}><label>Current Password</label><input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>New Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Confirm New Password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
              <button className="btn" onClick={handlePasswordChange} disabled={submitting || !oldPassword || !newPassword || !confirmPassword} style={{ width: '100%' }}>{submitting ? 'Updating...' : 'Change Password'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── ChatLayout ───────────────────────────────────────────────────────────────
const ChatLayout = ({
  header,
  messages,
  user,
  input,
  setInput,
  sendMessage,
  isGroup,
  typingUsers = [],
  allUsers = [],
  onReact,
  onSendFile,
  seenBy = {},
  unreadCount = 0,
  onReply,
  onDelete,
  replyTo,
  cancelReply,
}) => {
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) {
      alert('File exceeds 100 MB limit.');
      e.target.value = '';
      return;
    }
    onSendFile && onSendFile(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold', fontSize: '1rem', color: 'var(--accent-color)', background: 'var(--sidebar-bg)', flexShrink: 0 }}>
        {header}
        {unreadCount > 0 && (
          <span style={{ marginLeft: 8, background: 'var(--primary-color)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem', verticalAlign: 'middle' }}>
            {unreadCount} unread
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '3rem' }}>No messages yet. Say hello!</div>
        )}
        {messages.map((msg, i) => {
          const isMe = (msg.sender_id ?? msg.sender) === user.id;
          const senderName = msg.sender_username ?? (isMe ? (user.display_name || user.username) : '');
          const senderUser = allUsers.find(u => u.id === (msg.sender_id ?? msg.sender)) || (isMe ? user : null);
          const msgId = msg.id ?? `local-${i}`;
          const seenUsers = seenBy[msgId] || [];

          return (
            <div key={msgId} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '80%' }}>
                {(!isMe || isGroup) && senderUser && (
                  <Avatar user={senderUser} size={26} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                  {isGroup && !isMe && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px', paddingLeft: '4px' }}>
                      {senderUser?.display_name || senderName}
                    </span>
                  )}
                  <div style={{
                    background: isMe ? 'var(--primary-color)' : 'var(--card-bg)',
                    color: isMe ? '#fff' : 'var(--text-color)',
                    padding: '8px 12px',
                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    maxWidth: '100%',
                    fontSize: '0.9rem',
                    border: '1px solid var(--border-color)',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {/* Show quoted message if any */}
                    {msg.replied_message && (
                      <div style={{
                        background: 'rgba(0,0,0,0.1)',
                        borderLeft: '3px solid var(--primary-color)',
                        padding: '4px 8px',
                        marginBottom: '4px',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                      }}>
                        <strong>@{msg.replied_message.sender_username}</strong> {msg.replied_message.content}
                      </div>
                    )}
                    {/* Main message content */}
                    {(msg.decrypted ?? msg.content ?? msg.message) && (
                      <span>{msg.decrypted ?? msg.content ?? msg.message}</span>
                    )}
                    {msg.file_url && (
                      <FileMessage fileUrl={msg.file_url} fileName={msg.file_name} fileType={msg.file_type} />
                    )}
                  </div>
                  {onReact && (
                    <MessageActionsBar
                      messageId={msgId}
                      onReply={onReply}
                      onDelete={onDelete}
                      isOwnMessage={isMe}
                    />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', paddingLeft: '4px', paddingRight: '4px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                {isMe && seenUsers.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {seenUsers.length === 1 ? 'Seen' : `Seen by ${seenUsers.length}`}
                    </span>
                    {seenUsers.slice(0, 3).map((su, si) => (
                      <MiniAvatar key={su.id ?? si} user={su} size={14} />
                    ))}
                    {seenUsers.length > 3 && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '2px' }}>
                        +{seenUsers.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <TypingIndicator typingUsers={typingUsers} allUsers={allUsers} />

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--sidebar-bg)', flexShrink: 0 }}>
        {/* "Replying to" banner */}
        {replyTo && (
          <div style={{
            background: 'var(--input-bg)',
            borderLeft: '3px solid var(--primary-color)',
            padding: '4px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            borderRadius: '4px',
          }}>
            <span>Replying to <strong>@{replyTo.sender_username}</strong>: {replyTo.decrypted || replyTo.content?.substring(0, 50)}</span>
            <button onClick={cancelReply} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file (max 100MB)"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', padding: '4px', borderRadius: '6px', flexShrink: 0, transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-color)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >📎</button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />

          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{ flex: 1, padding: '0.6rem 1rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', fontSize: '0.9rem' }}
          />
          <button className="btn" onClick={sendMessage} disabled={!input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
};

// ─── PrivateChat Component ────────────────────────────────────────────────────
const PrivateChat = ({ user, otherUser, privateKey, allUsers, onlineUsers }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [seenBy, setSeenBy] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef(null);
  const receiverPublicKeyRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const [replyTo, setReplyTo] = useState(null);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState(null);
  const usersRef = useRef(allUsers);

  // Keep the ref updated with latest allUsers
  useEffect(() => {
    usersRef.current = allUsers;
  }, [allUsers]);

  const decryptMessages = async (msgs) => {
    return Promise.all(msgs.map(async (msg) => {
      const isMe = msg.sender_id === user.id;
      const encryptedContent = isMe ? msg.sender_encrypted_content : msg.content;
      if (!encryptedContent) return { ...msg, decrypted: msg.file_url ? '' : '[old message]' };
      if (encryptedContent.length < 50) return { ...msg, decrypted: encryptedContent };
      try {
        const decrypted = await decryptMessage(privateKey, encryptedContent);
        return { ...msg, decrypted };
      } catch {
        return { ...msg, decrypted: '[decryption failed]' };
      }
    }));
  };

  const handleReply = (messageId) => {
    const originalMsg = messages.find(m => m.id === messageId);
    if (originalMsg) {
      setReplyTo(originalMsg);
      document.querySelector('input[type="text"]')?.focus();
    }
  };

  const handleDelete = (messageId) => {
    setDeleteConfirmMessageId(messageId);
  };

  const confirmDelete = async () => {
    const messageId = deleteConfirmMessageId;
    setDeleteConfirmMessageId(null);
    if (!messageId) return;
    if (String(messageId).startsWith('local-')) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'delete', message_id: messageId }));
    } else {
      try {
        await axios.delete(`${API_BASE}/chat/messages/${messageId}/`);
      } catch (err) {
        console.error('Delete failed', err);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmMessageId(null);
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_BASE}/chat/history/${otherUser.id}/`);
        const decrypted = await decryptMessages(res.data);
        setMessages(decrypted);
        try { await axios.post(`${API_BASE}/chat/seen/${otherUser.id}/`); } catch { }
        const sb = {};
        res.data.forEach(msg => { if (msg.seen_by?.length) sb[msg.id] = msg.seen_by; });
        setSeenBy(sb);
        setUnreadCount(0);
      } catch (err) { console.error('Failed to fetch history', err); }
    };
    fetchHistory();
  }, [otherUser.id, user.id, privateKey]);

  useEffect(() => {
    const fetchReceiverPublicKey = async () => {
      try {
        const res = await axios.get(`${API_BASE}/public-key/${otherUser.id}/`);
        if (res.data.public_key) receiverPublicKeyRef.current = await importPublicKey(res.data.public_key);
      } catch (err) { console.error('Failed to fetch receiver public key', err); }
    };
    fetchReceiverPublicKey();
  }, [otherUser.id]);

  // WebSocket connection (fixed dependencies)
  useEffect(() => {
    const token = getAccessToken();
    const socket = new WebSocket(`${WS_BASE}/${otherUser.id}/?token=${token}`);
    socketRef.current = socket;

    socket.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      console.log('📨 WebSocket message received:', data);

      // Typing events
      if (data.type === 'typing_start') {
        if (data.sender_id !== user.id) {
          setTypingUsers(prev => prev.includes(data.sender_id) ? prev : [...prev, data.sender_id]);
        }
        return;
      }
      if (data.type === 'typing_stop') {
        if (data.sender_id !== user.id) {
          setTypingUsers(prev => prev.filter(id => id !== data.sender_id));
        }
        return;
      }

      // Seen event
      if (data.type === 'seen') {
        const seenUser = (usersRef.current.find(u => u.id === data.user_id)) || { id: data.user_id, username: data.username };
        setSeenBy(prev => {
          const updated = { ...prev };
          if (!updated[data.message_id]) updated[data.message_id] = [];
          if (!updated[data.message_id].find(u => u.id === data.user_id)) {
            updated[data.message_id] = [...updated[data.message_id], seenUser];
          }
          return updated;
        });
        return;
      }

      // Reaction event
      if (data.type === 'reaction') {
        console.log('🔔 Reaction WebSocket received:', data);
        setMessages(prev => {
          const updated = prev.map(m => {
            if (m.id !== data.message_id) return m;
            // Deep clone reactions
            const reactions = {};
            for (const [emoji, reactionData] of Object.entries(m.reactions || {})) {
              reactions[emoji] = {
                count: reactionData.count,
                users: [...reactionData.users],
                reacted: reactionData.reacted
              };
            }
            const emoji = data.emoji;
            const reactingUser = usersRef.current.find(u => u.id === data.user_id) || {
              id: data.user_id,
              username: data.username || data.display_name || 'Unknown',
              display_name: data.display_name
            };
            if (data.action === 'add') {
              // Remove any existing reaction from this user
              let existingEmoji = null;
              for (const [e, r] of Object.entries(reactions)) {
                if (r.users.some(u => u.id === data.user_id)) {
                  existingEmoji = e;
                  break;
                }
              }
              if (existingEmoji && existingEmoji !== emoji) {
                reactions[existingEmoji] = {
                  ...reactions[existingEmoji],
                  count: reactions[existingEmoji].count - 1,
                  users: reactions[existingEmoji].users.filter(u => u.id !== data.user_id),
                  reacted: reactions[existingEmoji].reacted && data.user_id === user.id ? false : reactions[existingEmoji].reacted
                };
                if (reactions[existingEmoji].count === 0) delete reactions[existingEmoji];
              }
              // Add new reaction
              if (!reactions[emoji]) reactions[emoji] = { count: 0, users: [], reacted: false };
              reactions[emoji] = {
                count: reactions[emoji].count + 1,
                users: [...reactions[emoji].users, reactingUser],
                reacted: reactions[emoji].reacted || (reactingUser.id === user.id)
              };
            } else {
              // Remove specific emoji reaction
              if (reactions[emoji]) {
                reactions[emoji] = {
                  ...reactions[emoji],
                  count: reactions[emoji].count - 1,
                  users: reactions[emoji].users.filter(u => u.id !== data.user_id),
                  reacted: reactions[emoji].reacted && data.user_id === user.id ? false : reactions[emoji].reacted
                };
                if (reactions[emoji].count === 0) delete reactions[emoji];
              }
            }
            return { ...m, reactions };
          });
          return updated;
        });
        return;
      }

      // Delete event
      if (data.type === 'delete') {
        setMessages(prev => prev.filter(m => (m.id !== data.message_id && m.message_id !== data.message_id)));
        setDeleteConfirmMessageId(null);
        return;
      }

      // Regular message
      if (data.sender_id === user.id) {
        setMessages(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (!prev[i].id && prev[i].sender_id === user.id) {
              const updated = [...prev];
              updated[i] = { ...updated[i], id: data.message_id };
              return updated;
            }
          }
          return prev;
        });
        return;
      }
      let decryptedText = '';
      if (data.message) {
        try {
          decryptedText = await decryptMessage(privateKey, data.message);
        } catch {
          decryptedText = '[decryption failed]';
        }
      }
      setMessages(prev => [...prev, { ...data, id: data.message_id, decrypted: decryptedText }]);

      try {
        await axios.post(`${API_BASE}/chat/seen/${otherUser.id}/`);
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'seen', message_id: data.message_id || data.id }));
        }
      } catch { }
    };

    socket.onerror = (err) => console.error('WebSocket error', err);
    return () => { socket.close(); clearTimeout(typingTimerRef.current); };
  }, [otherUser.id, user.id, privateKey]); // removed allUsers

  const emitTyping = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.send(JSON.stringify({ type: 'typing_start' }));
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketRef.current?.send(JSON.stringify({ type: 'typing_stop' }));
    }, 2000);
  }, []);

  const handleSetInput = (val) => {
    setInput(val);
    emitTyping();
  };

  // Fixed handleReact – finds existing reaction and removes it before adding new
  const handleReact = useCallback(async (messageId, emoji) => {
    if (!messageId || messageId.toString().startsWith('local-')) return;
    const currentMsg = messages.find(m => m.id === messageId);
    if (!currentMsg) return;

    // Check if user already reacted with a different emoji
    let existingEmoji = null;
    for (const [e, r] of Object.entries(currentMsg.reactions || {})) {
      if (r.users.some(u => u.id === user.id)) {
        existingEmoji = e;
        break;
      }
    }

    // If the clicked emoji is the same as the existing, we toggle it (remove)
    const isSame = (existingEmoji === emoji);
    let action = isSame ? 'remove' : 'add';

    // For "add", if there is a different existing emoji, remove it first (HTTP)
    if (action === 'add' && existingEmoji && existingEmoji !== emoji) {
      try {
        await axios.post(`${API_BASE}/chat/messages/${messageId}/react/`, { emoji: existingEmoji, action: 'remove' });
      } catch (err) {
        console.error('Failed to remove old reaction', err);
      }
    }

    // Now send the main request
    try {
      await axios.post(`${API_BASE}/chat/messages/${messageId}/react/`, { emoji, action });
      // No state update – WebSocket broadcast will handle it
    } catch (err) {
      console.error('Reaction failed', err);
    }
  }, [messages, user.id]);

  const sendMessage = async () => {
    if (!input.trim() || !socketRef.current) return;
    if (!receiverPublicKeyRef.current) { console.error('Receiver public key not loaded'); return; }
    const plainText = input.trim();
    const encryptedForReceiver = await encryptMessage(receiverPublicKeyRef.current, plainText);
    const ownPublicKey = await getOwnPublicKey(user.id);
    const encryptedForSender = ownPublicKey ? await encryptMessage(ownPublicKey, plainText) : '';

    const payload = {
      message: encryptedForReceiver,
      sender_encrypted: encryptedForSender,
      type: 'message',
    };
    if (replyTo) {
      payload.reply_to = replyTo.id;
    }

    socketRef.current.send(JSON.stringify(payload));
    isTypingRef.current = false;
    socketRef.current.send(JSON.stringify({ type: 'typing_stop' }));

    // Optimistic update
    const newMsg = {
      sender_id: user.id,
      sender_username: user.username,
      decrypted: plainText,
      timestamp: new Date().toISOString(),
      sender_encrypted_content: encryptedForSender,
      reply_to: replyTo ? replyTo.id : null,
      replied_message: replyTo ? {
        id: replyTo.id,
        sender_username: replyTo.sender_username,
        content: replyTo.decrypted || replyTo.content,
      } : null,
    };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setReplyTo(null);
  };

  const sendFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiver_id', otherUser.id);
    formData.append('group', 'false');
    try {
      const res = await axios.post(`${API_BASE}/chat/upload/`, formData);
      const { file_url, file_name, file_type, message_id } = res.data;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'file',
          file_url: file_url,
          file_name,
          file_type,
          message_id,
          file_path: res.data.file_path,
        }));
      }
      setMessages(prev => [...prev, {
        sender_id: user.id,
        sender_username: user.username,
        decrypted: '',
        file_url,
        file_name,
        file_type,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      console.error('File upload failed:', err);
      alert('File upload failed.');
    }
  };

  return (
    <>
      {deleteConfirmMessageId && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={cancelDelete}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.5rem',
            minWidth: '300px',
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Delete message?</h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={confirmDelete} style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}>Delete</button>
              <button onClick={cancelDelete} style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-color)',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <ChatLayout
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Avatar user={otherUser} size={28} showPresence onlineUsers={onlineUsers} />
            <span>@ {otherUser.display_name || otherUser.username}</span>
            <span style={{ fontSize: '0.72rem', color: onlineUsers[otherUser.id] ? '#22c55e' : 'var(--text-muted)', fontWeight: 'normal' }}>
              {onlineUsers[otherUser.id] ? '● Online' : '○ Offline'}
            </span>
          </div>
        }
        messages={messages}
        user={user}
        input={input}
        setInput={handleSetInput}
        sendMessage={sendMessage}
        isGroup={false}
        typingUsers={typingUsers}
        allUsers={allUsers}
        onReact={handleReact}
        onSendFile={sendFile}
        seenBy={seenBy}
        unreadCount={unreadCount}
        onReply={handleReply}
        onDelete={handleDelete}
        replyTo={replyTo}
        cancelReply={() => setReplyTo(null)}
      />
    </>
  );
};

// ─── GroupChat Component ──────────────────────────────────────────────────────
const GroupChat = ({ user, privateKey, allUsers, onlineUsers }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [keysReady, setKeysReady] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [seenBy, setSeenBy] = useState({});
  const socketRef = useRef(null);
  const publicKeysRef = useRef({});
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const [replyTo, setReplyTo] = useState(null);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState(null);
  const usersRef = useRef(allUsers);

  useEffect(() => {
    usersRef.current = allUsers;
  }, [allUsers]);

  const handleReply = (messageId) => {
    const originalMsg = messages.find(m => m.id === messageId);
    if (originalMsg) {
      setReplyTo(originalMsg);
      document.querySelector('input[type="text"]')?.focus();
    }
  };

  const handleDelete = (messageId) => {
    setDeleteConfirmMessageId(messageId);
  };

  const confirmDelete = async () => {
    const messageId = deleteConfirmMessageId;
    setDeleteConfirmMessageId(null);
    if (!messageId) return;
    if (String(messageId).startsWith('local-')) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'delete', message_id: messageId }));
    } else {
      try {
        await axios.delete(`${API_BASE}/chat/group/messages/${messageId}/`);
      } catch (err) {
        console.error('Delete failed', err);
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmMessageId(null);
  };

  useEffect(() => {
    if (allUsers.length === 0) return;
    const preloadPublicKeys = async () => {
      await Promise.all(allUsers.map(async (u) => {
        try {
          const res = await axios.get(`${API_BASE}/public-key/${u.id}/`);
          if (res.data.public_key) publicKeysRef.current[u.id] = await importPublicKey(res.data.public_key);
        } catch { }
      }));
      try {
        const res = await axios.get(`${API_BASE}/public-key/${user.id}/`);
        if (res.data.public_key) publicKeysRef.current[user.id] = await importPublicKey(res.data.public_key);
      } catch { }
      setKeysReady(true);
    };
    preloadPublicKeys();
  }, [allUsers, user.id]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_BASE}/chat/group/history/`);
        const decrypted = await Promise.all(res.data.map(async (msg) => {
          try {
            const keyRes = await axios.get(`${API_BASE}/chat/group/key/${msg.id}/`);
            const aesKeyBase64 = await decryptMessage(privateKey, keyRes.data.encrypted_key);
            const aesKey = await importAESKey(aesKeyBase64);
            const decryptedText = await decryptAES(aesKey, msg.content);
            return { ...msg, decrypted: decryptedText };
          } catch { return { ...msg, decrypted: msg.file_url ? '' : '[encrypted message]' }; }
        }));
        setMessages(decrypted);
        const sb = {};
        res.data.forEach(msg => { if (msg.seen_by?.length) sb[msg.id] = msg.seen_by; });
        setSeenBy(sb);
      } catch { }
    };
    fetchHistory();
  }, [privateKey]);

  // WebSocket connection for group
  useEffect(() => {
    const token = getAccessToken();
    const socket = new WebSocket(`${WS_GROUP}/?token=${token}`);
    socketRef.current = socket;

    socket.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      console.log('📨 Group WebSocket message received:', data);

      if (data.type === 'typing_start') {
        if (data.sender_id !== user.id) setTypingUsers(prev => prev.includes(data.sender_id) ? prev : [...prev, data.sender_id]);
        return;
      }
      if (data.type === 'typing_stop') {
        setTypingUsers(prev => prev.filter(id => id !== data.sender_id));
        return;
      }
      if (data.type === 'seen') {
        const seenUser = usersRef.current.find(u => u.id === data.user_id) || { id: data.user_id, username: data.username };
        setSeenBy(prev => {
          const updated = { ...prev };
          if (!updated[data.message_id]) updated[data.message_id] = [];
          if (!updated[data.message_id].find(u => u.id === data.user_id)) updated[data.message_id] = [...updated[data.message_id], seenUser];
          return updated;
        });
        return;
      }

      // Reaction event
      if (data.type === 'reaction') {
        console.log('🔔 Group Reaction WebSocket received:', data);
        setMessages(prev => {
          const updated = prev.map(m => {
            if (m.id !== data.message_id) return m;
            const reactions = {};
            for (const [emoji, reactionData] of Object.entries(m.reactions || {})) {
              reactions[emoji] = {
                count: reactionData.count,
                users: [...reactionData.users],
                reacted: reactionData.reacted
              };
            }
            const emoji = data.emoji;
            const reactingUser = usersRef.current.find(u => u.id === data.user_id) || {
              id: data.user_id,
              username: data.username || data.display_name || 'Unknown',
              display_name: data.display_name
            };
            if (data.action === 'add') {
              // Remove existing reaction from this user
              let existingEmoji = null;
              for (const [e, r] of Object.entries(reactions)) {
                if (r.users.some(u => u.id === data.user_id)) {
                  existingEmoji = e;
                  break;
                }
              }
              if (existingEmoji && existingEmoji !== emoji) {
                reactions[existingEmoji] = {
                  ...reactions[existingEmoji],
                  count: reactions[existingEmoji].count - 1,
                  users: reactions[existingEmoji].users.filter(u => u.id !== data.user_id),
                  reacted: reactions[existingEmoji].reacted && data.user_id === user.id ? false : reactions[existingEmoji].reacted
                };
                if (reactions[existingEmoji].count === 0) delete reactions[existingEmoji];
              }
              // Add new reaction
              if (!reactions[emoji]) reactions[emoji] = { count: 0, users: [], reacted: false };
              reactions[emoji] = {
                count: reactions[emoji].count + 1,
                users: [...reactions[emoji].users, reactingUser],
                reacted: reactions[emoji].reacted || (reactingUser.id === user.id)
              };
            } else {
              if (reactions[emoji]) {
                reactions[emoji] = {
                  ...reactions[emoji],
                  count: reactions[emoji].count - 1,
                  users: reactions[emoji].users.filter(u => u.id !== data.user_id),
                  reacted: reactions[emoji].reacted && data.user_id === user.id ? false : reactions[emoji].reacted
                };
                if (reactions[emoji].count === 0) delete reactions[emoji];
              }
            }
            return { ...m, reactions };
          });
          return updated;
        });
        return;
      }

      if (data.type === 'file') {
        if (data.sender_id === user.id) {
          setMessages(prev => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (!prev[i].id && prev[i].sender_id === user.id) {
                const updated = [...prev];
                updated[i] = { ...updated[i], id: data.message_id };
                return updated;
              }
            }
            return prev;
          });
          return;
        }
        setMessages(prev => [...prev, { ...data, id: data.message_id, decrypted: '' }]);
        return;
      }
      if (data.type === 'delete') {
        setMessages(prev => prev.filter(m => (m.id !== data.message_id && m.message_id !== data.message_id)));
        setDeleteConfirmMessageId(null);
        return;
      }

      if (data.sender_id === user.id) {
        setMessages(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (!prev[i].id && prev[i].sender_id === user.id) {
              const updated = [...prev];
              updated[i] = { ...updated[i], id: data.message_id };
              return updated;
            }
          }
          return prev;
        });
        return;
      }
      try {
        const keyRes = await axios.get(`${API_BASE}/chat/group/key/${data.message_id}/`);
        const aesKeyBase64 = await decryptMessage(privateKey, keyRes.data.encrypted_key);
        const aesKey = await importAESKey(aesKeyBase64);
        const decryptedText = await decryptAES(aesKey, data.message);
        setMessages(prev => [...prev, { ...data, id: data.message_id, decrypted: decryptedText }]);
      } catch {
        setMessages(prev => [...prev, { ...data, id: data.message_id, decrypted: '[encrypted message]' }]);
      }
    };

    socket.onerror = (err) => console.error('WebSocket error', err);
    return () => { socket.close(); clearTimeout(typingTimerRef.current); };
  }, [user.id, privateKey]); // removed allUsers

  const emitTyping = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.send(JSON.stringify({ type: 'typing_start' }));
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketRef.current?.send(JSON.stringify({ type: 'typing_stop' }));
    }, 2000);
  }, []);

  const handleSetInput = (val) => { setInput(val); emitTyping(); };

  // handleReact for group (same logic as private)
  const handleReact = useCallback(async (messageId, emoji) => {
    if (!messageId || messageId.toString().startsWith('local-')) return;
    const currentMsg = messages.find(m => m.id === messageId);
    if (!currentMsg) return;

    let existingEmoji = null;
    for (const [e, r] of Object.entries(currentMsg.reactions || {})) {
      if (r.users.some(u => u.id === user.id)) {
        existingEmoji = e;
        break;
      }
    }

    const isSame = (existingEmoji === emoji);
    let action = isSame ? 'remove' : 'add';

    if (action === 'add' && existingEmoji && existingEmoji !== emoji) {
      try {
        await axios.post(`${API_BASE}/chat/messages/${messageId}/react/`, { emoji: existingEmoji, action: 'remove' });
      } catch (err) {
        console.error('Failed to remove old reaction', err);
      }
    }

    try {
      await axios.post(`${API_BASE}/chat/messages/${messageId}/react/`, { emoji, action });
    } catch (err) {
      console.error('Reaction failed', err);
    }
  }, [messages, user.id]);

  const sendMessage = async () => {
    if (!input.trim() || !socketRef.current) return;
    if (!keysReady || Object.keys(publicKeysRef.current).length === 0) return;
    const plainText = input.trim();
    const aesKey = await generateAESKey();
    const aesKeyBase64 = await exportAESKey(aesKey);
    const encryptedMessage = await encryptAES(aesKey, plainText);
    const encryptedKeys = {};
    await Promise.all(Object.entries(publicKeysRef.current).map(async ([userId, pubKey]) => {
      try { encryptedKeys[userId] = await encryptMessage(pubKey, aesKeyBase64); } catch { }
    }));
    const payload = { type: 'message', message: encryptedMessage, encrypted_keys: encryptedKeys };
    if (replyTo) {
      payload.reply_to = replyTo.id;
    }
    socketRef.current.send(JSON.stringify(payload));
    isTypingRef.current = false;
    socketRef.current.send(JSON.stringify({ type: 'typing_stop' }));

    // Optimistic update
    const newMsg = {
      sender_id: user.id,
      sender_username: user.display_name || user.username,
      decrypted: plainText,
      timestamp: new Date().toISOString(),
      reply_to: replyTo ? replyTo.id : null,
      replied_message: replyTo ? {
        id: replyTo.id,
        sender_username: replyTo.sender_username,
        content: replyTo.decrypted || replyTo.content,
      } : null,
    };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setReplyTo(null);
  };

  const sendFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('group', 'true');
    try {
      const res = await axios.post(`${API_BASE}/chat/upload/`, formData);
      const { file_url, file_name, file_type, message_id } = res.data;
      socketRef.current?.send(JSON.stringify({
        type: 'file',
        file_url,
        file_name,
        file_type,
        message_id,
        file_path: res.data.file_path,
      }));
      setMessages(prev => [...prev, { sender_id: user.id, sender_username: user.display_name || user.username, decrypted: '', file_url, file_name, file_type, timestamp: new Date().toISOString() }]);
    } catch { alert('File upload failed.'); }
  };

  return (
    <>
      {deleteConfirmMessageId && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={cancelDelete}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.5rem',
            minWidth: '300px',
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Delete message?</h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={confirmDelete} style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}>Delete</button>
              <button onClick={cancelDelete} style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-color)',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <ChatLayout
        header={keysReady ? '# everyone' : '# everyone (loading keys...)'}
        messages={messages}
        user={user}
        input={input}
        setInput={handleSetInput}
        sendMessage={sendMessage}
        isGroup={true}
        typingUsers={typingUsers}
        allUsers={[...allUsers, user]}
        onReact={handleReact}
        onSendFile={sendFile}
        seenBy={seenBy}
        unreadCount={0}
        onReply={handleReply}
        onDelete={handleDelete}
        replyTo={replyTo}
        cancelReply={() => setReplyTo(null)}
      />
    </>
  );
};

// ─── App ─────────────────────────────────────────────────────────────────────
const App = () => {
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [appState, setAppState] = useState('loading');
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [activeGroupChat, setActiveGroupChat] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const { flash, showFlash } = useFlash();
  const presenceSocketRef = useRef(null);

  const connectPresence = useCallback((userId) => {
    const token = getAccessToken();
    const socket = new WebSocket(`${WS_PRESENCE}/?token=${token}`);
    presenceSocketRef.current = socket;

    socket.onopen = () => socket.send(JSON.stringify({ type: 'online', user_id: userId }));

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'presence') {
        setOnlineUsers(prev => ({ ...prev, [data.user_id]: data.status === 'online' }));
      }
      if (data.type === 'presence_bulk') {
        const bulk = {};
        data.users?.forEach(u => { bulk[u.id] = u.is_online; });
        setOnlineUsers(bulk);
      }
      if (data.type === 'unread_update') {
        setUnreadCounts(prev => ({ ...prev, [data.from_user_id]: data.count }));
      }
    };

    socket.onerror = () => { };
    return () => socket.close();
  }, []);

  const uploadPublicKey = useCallback(async (publicKeyStr) => {
    try { await axios.post(`${API_BASE}/update-public-key/`, { public_key: publicKeyStr }); } catch { }
  }, []);

  const initKeys = useCallback(async (userId) => {
    try {
      const fetchOwnPublicKey = async () => {
        const res = await axios.get(`${API_BASE}/public-key/${userId}/`);
        return res.data.public_key || null;
      };
      const { privateKey: pk } = await initializeKeys(userId, uploadPublicKey, fetchOwnPublicKey);
      setPrivateKey(pk);
    } catch { }
  }, [uploadPublicKey]);

  useEffect(() => {
    const validateSession = async () => {
      try {
        const res = await axios.post(`${API_BASE}/token/refresh/`);
        setAccessToken(res.data.access);
        const me = await axios.get(`${API_BASE}/me/`);
        setUser(me.data);
        await initKeys(me.data.id);
        setAppState('app');
      } catch {
        clearAccessToken();
        setAppState('auth');
      } finally { setSessionChecked(true); }
    };
    validateSession();
  }, []);

  useEffect(() => {
    if (appState === 'app' && user) {
      const cleanup = connectPresence(user.id);
      return cleanup;
    }
  }, [appState, user]);

  const handleLoginSuccess = async (userData) => {
    setUser(userData);
    await initKeys(userData.id);
    setAppState('app');
  };

  const handleSignupSuccess = async (userData) => {
    setUser(userData);
    await initKeys(userData.id);
    setAppState('profile-setup');
  };

  const handleProfileSetupComplete = (updatedUser) => { setUser(updatedUser); setAppState('app'); };
  const handleUserUpdated = (updatedUser) => setUser(updatedUser);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/channels/`);
      setChannels(res.data);
      if (res.data.length > 0) setCurrentChannel((prev) => prev ?? res.data[0]);
    } catch { }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/users/`);
      setUsers(res.data);
    } catch { }
  }, []);

  useEffect(() => {
    if (appState === 'app') { fetchChannels(); fetchUsers(); }
  }, [appState]);

  useEffect(() => {
    if (currentChannel) fetchPosts(currentChannel.slug);
  }, [currentChannel]);

  const fetchPosts = async (slug) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/channels/${slug}/posts/`);
      setPosts(res.data);
    } catch { } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    presenceSocketRef.current?.close();
    try {
      await axios.post(`${API_BASE}/logout/`);
    } finally {
      clearAccessToken();
      setUser(null); setChannels([]); setCurrentChannel(null); setPosts([]);
      setUsers([]); setActiveChat(null); setActiveGroupChat(false); setPrivateKey(null);
      setOnlineUsers({}); setUnreadCounts({});
      setAppState('auth');
    }
  };

  const handleUserClick = (otherUser) => {
    setActiveChat(otherUser);
    setCurrentChannel(null);
    setActiveGroupChat(false);
    setUnreadCounts(prev => ({ ...prev, [otherUser.id]: 0 }));
  };

  const handleChannelClick = (ch) => { setCurrentChannel(ch); setActiveChat(null); setActiveGroupChat(false); };
  const handleGroupChatClick = () => { setActiveGroupChat(true); setActiveChat(null); setCurrentChannel(null); };

  if (!sessionChecked || appState === 'loading') {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Verifying session...</div>
      </div>
    );
  }
  if (appState === 'auth') return <AuthScreen onLoginSuccess={handleLoginSuccess} onSignupSuccess={handleSignupSuccess} />;
  if (appState === 'profile-setup') return <ProfileSetupPage user={user} onComplete={handleProfileSetupComplete} />;

  return (
    <div className="app-container">
      <style>{`
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      {flash && (
        <div style={{ position: 'fixed', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, minWidth: '300px' }}>
          <Flash flash={flash} />
        </div>
      )}

      {showSettings && (
        <ProfileSettingsPage user={user} onClose={() => setShowSettings(false)} onUserUpdated={handleUserUpdated} />
      )}

      <div className="sidebar">
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 0 1rem 0',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '0.75rem',
        }}>
          <img
            src="/madhalahat-logo.png"
            alt="MDH4L4H4T logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              objectFit: 'cover', flexShrink: 0,
              border: '2px solid var(--primary-color)',
            }}
          />
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--primary-color)', color: '#fff',
            display: 'none', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0,
            border: '2px solid var(--primary-color)',
          }}>M</div>
          <span style={{
            fontWeight: 'bold', fontSize: '0.8rem',
            color: 'var(--accent-color)',
            letterSpacing: '0.04em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>MDH4L4H4T_T34M</span>
        </div>

        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Channels</p>
        <ul className="channel-list">
          {channels.map((ch) => (
            <li key={ch.id} className={`channel-item ${currentChannel?.id === ch.id && !activeGroupChat ? 'active' : ''}`} onClick={() => handleChannelClick(ch)}>
              # {ch.name}
            </li>
          ))}
        </ul>

        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 0.4rem' }}>Group Chat</p>
        <ul className="channel-list">
          <li className={`channel-item ${activeGroupChat ? 'active' : ''}`} onClick={handleGroupChatClick}>
            # everyone
          </li>
        </ul>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Avatar user={user} size={36} showPresence onlineUsers={{ [user.id]: true }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.display_name || user.username}
            </p>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{user.username}</p>
          </div>
          <button onClick={() => setShowSettings(true)} title="Settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', padding: '4px', borderRadius: '6px', flexShrink: 0, transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >⚙️</button>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', flexShrink: 0 }}>Logout</button>
        </div>
      </div>

      <main className="main-content">
        {activeChat && privateKey ? (
          <PrivateChat user={user} otherUser={activeChat} privateKey={privateKey} allUsers={users} onlineUsers={onlineUsers} />
        ) : activeGroupChat && privateKey ? (
          <GroupChat user={user} privateKey={privateKey} allUsers={users} onlineUsers={onlineUsers} />
        ) : (
          <>
            <div className="bg-decor">
              {DECORATIONS[currentChannel?.slug] || DECORATIONS.general}
              {'\n' + (DECORATIONS[currentChannel?.slug] || DECORATIONS.general).repeat(5)}
            </div>
            <div className="content-wrapper">
              <PostForm user={user} channel={currentChannel} onPostCreated={() => fetchPosts(currentChannel.slug)} showFlash={showFlash} />
              {loading ? (
                <div className="post-card" style={{ textAlign: 'center' }}>Initializing channel...</div>
              ) : posts.length > 0 ? (
                posts.map((post) => (
                  <PostCard key={post.id} post={post} onReplyCreated={() => fetchPosts(currentChannel.slug)} showFlash={showFlash} />
                ))
              ) : (
                <div className="post-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No traffic found in this channel.</div>
              )}
            </div>
          </>
        )}
      </main>

      <div className="sidebar" style={{ borderLeft: '1px solid var(--border-color)', borderRight: 'none' }}>
        <h2 style={{ fontSize: '1rem' }}>Members</h2>
        <ul className="channel-list">
          {users.map((u) => {
            const unread = unreadCounts[u.id] || 0;
            return (
              <li
                key={u.id}
                className={`channel-item ${activeChat?.id === u.id ? 'active' : ''}`}
                onClick={() => handleUserClick(u)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}
              >
                <Avatar user={u} size={28} showPresence onlineUsers={onlineUsers} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.display_name || u.username}
                </span>
                {unread > 0 && (
                  <span style={{
                    background: 'var(--primary-color)', color: '#fff',
                    borderRadius: '50%', minWidth: '18px', height: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0,
                    padding: '0 3px',
                  }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                {u.is_admin && !unread && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--primary-color)', marginLeft: 'auto', flexShrink: 0 }}>admin</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// ─── AuthScreen ───────────────────────────────────────────────────────────────
const AuthScreen = ({ onLoginSuccess, onSignupSuccess }) => {
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { flash, showFlash } = useFlash();

  const validate = () => {
    const errs = {};
    const trimmedUser = username.trim();
    if (!trimmedUser) errs.username = 'Username is required.';
    else if (trimmedUser.length < 3) errs.username = 'Username must be at least 3 characters.';
    if (!password) errs.password = 'Password is required.';
    else if (authMode === 'signup' && password.length < 8) errs.password = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { showFlash(Object.values(errs)[0], 'error'); return; }
    setSubmitting(true);
    try {
      if (authMode === 'login') {
        const res = await axios.post(`${API_BASE}/login/`, { username: username.trim(), password });
        setAccessToken(res.data.access);
        onLoginSuccess(res.data.user);
      } else {
        await axios.post(`${API_BASE}/register/`, { username: username.trim(), password });
        const loginRes = await axios.post(`${API_BASE}/login/`, { username: username.trim(), password });
        setAccessToken(loginRes.data.access);
        onSignupSuccess(loginRes.data.user);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const firstVal = Object.values(data)[0];
        showFlash(Array.isArray(firstVal) ? firstVal.join(' ') : String(firstVal), 'error');
      } else {
        showFlash(`${authMode === 'login' ? 'Login' : 'Signup'} failed. Please try again.`, 'error');
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Securinets ISET'R</h1>
        <Flash flash={flash} />
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} autoComplete="username" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Sign Up'}
          </button>
        </form>
        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setUsername(''); setPassword(''); }}>
            {authMode === 'login' ? 'Sign Up' : 'Login'}
          </span>
        </p>
      </div>
    </div>
  );
};

// ─── PostForm ─────────────────────────────────────────────────────────────────
const PostForm = ({ user, channel, onPostCreated, showFlash }) => {
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const canPost = user.is_admin || channel?.slug === 'general';

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > FILE_MAX_BYTES) { showFlash('File exceeds 100 MB limit.', 'error'); e.target.value = ''; return; }
    setFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('content', content);
    formData.append('channel_id', channel.id);
    if (file) formData.append('file', file);
    try {
      await axios.post(`${API_BASE}/posts/`, formData);
      setContent(''); setFile(null);
      onPostCreated();
    } catch (err) {
      showFlash(err.response?.data?.error || 'Failed to create post.', 'error');
    } finally { setSubmitting(false); }
  };

  if (!canPost) {
    return <div className="post-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Only admins can post in this channel.</div>;
  }

  return (
    <div className="post-form">
      <form onSubmit={handleSubmit}>
        <textarea placeholder={`What's on your mind? (Posting in #${channel?.name})`} value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="post-form-footer">
          <input type="file" onChange={handleFileChange} style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 100 MB</span>
          <button className="btn" disabled={submitting || (!content && !file)}>{submitting ? 'Posting...' : 'Post'}</button>
        </div>
      </form>
    </div>
  );
};

// ─── PostCard ─────────────────────────────────────────────────────────────────
const PostCard = ({ post, onReplyCreated, showFlash }) => {
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (submittingReply || !replyContent.trim()) return;
    setSubmittingReply(true);
    try {
      await axios.post(`${API_BASE}/replies/`, { post_id: post.id, content: replyContent });
      setReplyContent('');
      onReplyCreated();
    } catch (err) {
      showFlash(err.response?.data?.error || 'Failed to send reply.', 'error');
    } finally { setSubmittingReply(false); }
  };

  return (
    <div className="post-card">
      <div className="post-header">
        <span className="post-author">@{post.poster}</span>
        <span className="post-time">{new Date(post.timestamp).toLocaleString()}</span>
      </div>
      <div className="post-content">{post.content}</div>
      {post.media_url && (
        <div className="post-media">
          {post.media_type === 'image' && <img src={post.media_url} alt="Post media" />}
          {post.media_type === 'video' && <video controls src={post.media_url} />}
          {post.media_type === 'file' && (
            <a href={post.media_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)' }}>
              Download File: {post.media_url.split('/').pop()}
            </a>
          )}
        </div>
      )}
      <div style={{ marginTop: '1rem' }}>
        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }} onClick={() => setShowReplies(!showReplies)}>
          {showReplies ? 'Hide' : 'Show'} Replies ({post.replies?.length || 0})
        </button>
      </div>
      {showReplies && (
        <div className="replies-section">
          {post.replies?.map((reply) => (
            <div key={reply.id} className="reply-item">
              <div className="reply-header">
                <span className="reply-author">@{reply.poster}</span>
                <span className="post-time" style={{ marginLeft: '10px' }}>{new Date(reply.timestamp).toLocaleString()}</span>
              </div>
              <div className="reply-content">{reply.content}</div>
            </div>
          ))}
          <form onSubmit={handleReplySubmit} className="reply-form">
            <input type="text" placeholder="Write a reply..." value={replyContent} onChange={(e) => setReplyContent(e.target.value)} />
            <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} disabled={submittingReply || !replyContent.trim()}>
              {submittingReply ? '...' : 'Reply'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;