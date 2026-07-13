import { useEffect, useRef } from 'react';
import Avatar from '../common/Avatar';
import MiniAvatar from '../common/MiniAvatar';
import FileMessage from '../common/FileMessage';
import MessageActionsBar from '../common/MessageActionsBar';
import TypingIndicator from '../common/TypingIndicator';
import { FILE_MAX_BYTES } from '../../api/client';

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
                        background: 'rgba(0, 0, 0, 0.08)',
                        borderLeft: '3px solid var(--primary-color)',
                        padding: '4px 8px',
                        marginBottom: '6px',
                        borderRadius: '6px',
                        opacity: 0.85,
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                          @{msg.replied_message.sender_username}
                        </div>

                        {msg.replied_message.file_url ? (
                          <div style={{
                            opacity: 0.65,
                            filter: 'grayscale(20%)',
                            pointerEvents: 'none',
                            transform: 'scale(0.90)',
                            transformOrigin: 'top left',
                            maxWidth: '180px',
                          }}>
                            <FileMessage
                              fileUrl={msg.replied_message.file_url}
                              fileName={msg.replied_message.file_name}
                              fileType={msg.replied_message.file_type}
                            />
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-color)' }}>
                            {(msg.replied_message.decrypted ?? msg.replied_message.content ?? '').substring(0, 80)}
                          </div>
                        )}
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
            <span>
              Replying to <strong>@{replyTo.sender_username}</strong>
              {replyTo.file_url ? (
                <> — 📎 {replyTo.file_name || 'file'}</>
              ) : (
                <>: {(replyTo.decrypted || replyTo.content || '').substring(0, 55)}</>
              )}
            </span>
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

export default ChatLayout;
