import { useState } from 'react';
import Flash from '../common/Flash';
import { useFlash } from '../../hooks/useFlash';
import { axios, API_BASE } from '../../api/client';
import { setAccessToken } from '../../tokenManager';

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

export default ProfileSettingsPage;
