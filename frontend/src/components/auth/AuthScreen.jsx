import { useState } from 'react';
import Flash from '../common/Flash';
import { useFlash } from '../../hooks/useFlash';
import { axios, API_BASE } from '../../api/client';
import { setAccessToken } from '../../tokenManager';

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

export default AuthScreen;
