import { useState } from 'react';
import { axios, API_BASE } from '../../api/client';

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

export default PostCard;
