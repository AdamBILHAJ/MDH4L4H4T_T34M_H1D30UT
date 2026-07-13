import { useState } from 'react';
import Flash from '../common/Flash';
import { useFlash } from '../../hooks/useFlash';
import { axios, API_BASE } from '../../api/client';

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

export default ProfileSetupPage;
