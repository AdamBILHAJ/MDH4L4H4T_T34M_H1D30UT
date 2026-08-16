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
    <div className="chat-layout-container">
      <div className="chat-layout-header">
        {header}
        {unreadCount > 0 && (
          <span className="chat-header-unread">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="chat-messages-scroll">
        {messages.length === 0 && (
          <div className="chat-empty-message">No messages yet. Say hello!</div>
        )}
        {messages.map((msg, i) => {
          const isMe = (msg.sender_id ?? msg.sender) === user.id;
          const senderName = msg.sender_username ?? (isMe ? (user.display_name || user.username) : '');
          const senderUser = allUsers.find(u => u.id === (msg.sender_id ?? msg.sender)) || (isMe ? user : null);
          const msgId = msg.id ?? `local-${i}`;
          const seenUsers = seenBy[msgId] || [];

          return (
            <div key={msgId} className={`chat-message-row ${isMe ? 'me' : 'other'}`}>
              <div className={`chat-message-bubble-wrapper ${isMe ? 'me' : 'other'}`}>
                {(!isMe || isGroup) && senderUser && (
                  <Avatar user={senderUser} size={26} />
                )}
                <div className={`chat-message-content-box ${isMe ? 'me' : 'other'}`}>
                  {isGroup && !isMe && (
                    <span className="chat-sender-username">
                      {senderUser?.display_name || senderName}
                    </span>
                  )}
                  <div className={`chat-message-bubble ${isMe ? 'me' : 'other'}`}>
                    {/* Show quoted message if any */}
                    {msg.replied_message && (
                      <div className="chat-quote-container">
                        <div className="chat-quote-sender">
                          @{msg.replied_message.sender_username}
                        </div>

                        {msg.replied_message.file_url ? (
                          <div className="chat-quote-file-wrapper">
                            <FileMessage
                              fileUrl={msg.replied_message.file_url}
                              fileName={msg.replied_message.file_name}
                              fileType={msg.replied_message.file_type}
                            />
                          </div>
                        ) : (
                          <div className="chat-quote-text">
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
              <div className={`chat-message-meta ${isMe ? 'me' : 'other'}`}>
                <span className="chat-message-time">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                {isMe && seenUsers.length > 0 && (
                  <div className="chat-seen-list">
                    <span className="chat-seen-label">
                      {seenUsers.length === 1 ? 'Seen' : `Seen by ${seenUsers.length}`}
                    </span>
                    {seenUsers.slice(0, 3).map((su, si) => (
                      <MiniAvatar key={su.id ?? si} user={su} size={14} />
                    ))}
                    {seenUsers.length > 3 && (
                      <span className="chat-seen-plus">
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

      <div className="chat-composer">
        {/* "Replying to" banner */}
        {replyTo && (
          <div className="chat-reply-banner">
            <span>
              Replying to <strong>@{replyTo.sender_username}</strong>
              {replyTo.file_url ? (
                <> — 📎 {replyTo.file_name || 'file'}</>
              ) : (
                <>: {(replyTo.decrypted || replyTo.content || '').substring(0, 55)}</>
              )}
            </span>
            <button onClick={cancelReply} className="chat-reply-cancel">✕</button>
          </div>
        )}
        <div className="chat-composer-row">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file (max 100MB)"
            className="chat-attach-btn"
          >📎</button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />

          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="chat-input"
          />
          <button className="btn" onClick={sendMessage} disabled={!input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default ChatLayout;
