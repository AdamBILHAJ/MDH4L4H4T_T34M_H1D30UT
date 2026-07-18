import { useState, useEffect, useCallback, useRef } from 'react';
import { axios, API_BASE, WS_PRESENCE } from './api/client';
import './index.css';
import { initializeKeys } from './crypto';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenManager';
import { useFlash } from './hooks/useFlash';
import { DECORATIONS } from './constants/decorations';
import Avatar from './components/common/Avatar';
import Flash from './components/common/Flash';
import AuthScreen from './components/auth/AuthScreen';
import ProfileSetupPage from './components/profile/ProfileSetupPage';
import ProfileSettingsPage from './components/profile/ProfileSettingsPage';
import PrivateChat from './components/chat/PrivateChat';
import GroupChat from './components/chat/GroupChat';
import PostForm from './components/posts/PostForm';
import PostCard from './components/posts/PostCard';

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
  const [presenceReconnecting, setPresenceReconnecting] = useState(false);

  const connectPresence = useCallback((userId) => {
    const token = getAccessToken();
    let reconnectTimer = null;
    let retries = 0;
    let closed = false;

    const connect = () => {
      closed = false;
      const socket = new WebSocket(`${WS_PRESENCE}/?token=${token}`);
      presenceSocketRef.current = socket;

      socket.onopen = () => {
        retries = 0;
        setPresenceReconnecting(false);
        socket.send(JSON.stringify({ type: 'online', user_id: userId }));
      };

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

      socket.onclose = () => {
        if (closed) return;
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        setPresenceReconnecting(true);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      presenceSocketRef.current?.close();
      presenceSocketRef.current = null;
    };
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
    if (otherUser === user || otherUser?.id === user?.id) return;
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
        .self-entry:hover { background: transparent !important; cursor: default !important; }
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
            src="/mdhala.jpg"
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
        {presenceReconnecting && (
          <div style={{ fontSize: '0.7rem', color: '#f59e0b', textAlign: 'center', padding: '0.15rem 0' }}>
            ⟳ Reconnecting...
          </div>
        )}
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
                className={`channel-item ${activeChat?.id === u.id ? 'active' : ''} ${u.id === user.id ? 'self-entry' : ''}`}
                onClick={() => { if (u.id !== user.id) handleUserClick(u); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', cursor: u.id === user.id ? 'default' : 'pointer' }}
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

export default App;
