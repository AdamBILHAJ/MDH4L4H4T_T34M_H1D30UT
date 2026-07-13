import { useState } from 'react';
import { axios, API_BASE, FILE_MAX_BYTES } from '../../api/client';

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

export default PostForm;
