import { useState, useEffect, useCallback, useRef } from 'react';
import ChatLayout from './ChatLayout';
import Avatar from '../common/Avatar';
import { axios, API_BASE, WS_BASE } from '../../api/client';
import { importPublicKey, encryptMessage, decryptMessage, getOwnPublicKey } from '../../crypto';
import { getAccessToken } from '../../tokenManager';

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
  const [reconnecting, setReconnecting] = useState(false);
  const usersRef = useRef(allUsers);
  const messagesRef = useRef([]);

  useEffect(() => {
    usersRef.current = allUsers;
  }, [allUsers]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const decryptMessages = async (msgs) => {
    return Promise.all(msgs.map(async (msg) => {
      const isMe = msg.sender_id === user.id;
      const encryptedContent = isMe ? msg.sender_encrypted_content : msg.content;
      if (!encryptedContent) return { ...msg, decrypted: msg.file_url ? '' : '[old message]' };
      if (encryptedContent.length < 50) return { ...msg, decrypted: encryptedContent };
      try {
        const decrypted = await decryptMessage(privateKey, encryptedContent);

        let repliedDecrypted = '';
        if (msg.replied_message) {
          const rm = msg.replied_message;
          const rmCipher = (rm.sender_id === user.id) ? rm.sender_encrypted_content : rm.content;
          if (rmCipher) {
            try {
              repliedDecrypted = await decryptMessage(privateKey, rmCipher);
            } catch { repliedDecrypted = ''; }
          }
        }

        return {
          ...msg,
          decrypted,
          replied_message: msg.replied_message ? { ...msg.replied_message, decrypted: repliedDecrypted } : null,
        };
      } catch {
        return { ...msg, decrypted: '[decryption failed]' };
      }
    }));
  };

  const normalizeRepliedMessages = (msgs) => {
    const idMap = new Map(msgs.map(m => [m.id, m]));
    return msgs.map(msg => {
      const replyId = msg.replied_message?.id || msg.reply_to || msg.reply_to_id;
      if (!replyId) return msg;
      const parent = idMap.get(Number(replyId) || replyId);
      if (!parent) return msg;
      const baseReplied = msg.replied_message || {};
      return {
        ...msg,
        replied_message: {
          ...baseReplied,
          id: replyId,
          sender_id: baseReplied.sender_id ?? parent.sender_id ?? parent.sender,
          sender_username: baseReplied.sender_username || parent.sender_username || parent.sender_display_name,
          content: parent.decrypted ?? baseReplied.decrypted ?? baseReplied.content ?? parent.content ?? '',
          decrypted: parent.decrypted ?? baseReplied.decrypted ?? baseReplied.content ?? '',
          file_url: baseReplied.file_url ?? parent.file_url ?? null,
          file_name: baseReplied.file_name ?? parent.file_name ?? null,
          file_type: baseReplied.file_type ?? parent.file_type ?? null,
        }
      };
    });
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
        const normalized = normalizeRepliedMessages(decrypted);
        setMessages(normalized);
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

  useEffect(() => {
    const token = getAccessToken();
    let reconnectTimer = null;
    let retries = 0;
    let closed = false;

    const connect = () => {
      closed = false;
      const socket = new WebSocket(`${WS_BASE}/${otherUser.id}/?token=${token}`);
      socketRef.current = socket;

      socket.onopen = async () => {
        const wasReconnected = retries > 0;
        retries = 0;
        setReconnecting(false);
        if (wasReconnected) {
          try {
            const res = await axios.get(`${API_BASE}/chat/history/${otherUser.id}/`);
            const decrypted = await decryptMessages(res.data);
            const normalized = normalizeRepliedMessages(decrypted);
            setMessages(normalized);
            try { await axios.post(`${API_BASE}/chat/seen/${otherUser.id}/`); } catch { }
            const sb = {};
            res.data.forEach(msg => { if (msg.seen_by?.length) sb[msg.id] = msg.seen_by; });
            setSeenBy(sb);
          } catch (err) { console.error('Failed to re-fetch history on reconnect', err); }
        }
      };

      socket.onmessage = async (e) => {
        const data = JSON.parse(e.data);
        console.log('📨 WebSocket message received:', data);

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

        if (data.type === 'reaction') {
          console.log('🔔 Reaction WebSocket received:', data);
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

        if (data.type === 'delete') {
          setMessages(prev => prev.filter(m => (m.id !== data.message_id && m.message_id !== data.message_id)));
          setDeleteConfirmMessageId(null);
          return;
        }

        if (data.file_url) {
          if (data.sender_id === user.id) {
            setMessages(prev => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if ((prev[i].temp || !prev[i].id) && prev[i].sender_id === user.id) {
                  const updated = [...prev];
                  updated[i] = {
                    ...updated[i],
                    id: data.message_id,
                    temp: false,
                    content: data.message || updated[i].content,
                    sender_encrypted_content: data.sender_encrypted || updated[i].sender_encrypted_content,
                  };
                  return normalizeRepliedMessages(updated);
                }
              }
              return prev;
            });
            return;
          }

          let fileMsg = { ...data, id: data.message_id, decrypted: '' };

          if (data.message) fileMsg.content = data.message;
          if (data.sender_encrypted) fileMsg.sender_encrypted_content = data.sender_encrypted;

          if (data.message) {
            try {
              fileMsg.decrypted = await decryptMessage(privateKey, data.message);
            } catch {
              fileMsg.decrypted = '[decryption failed]';
            }
          }

          if (data.reply_to) {
            const parentInState = messagesRef.current.find(m => m.id === data.reply_to);
            const quotedContent = parentInState?.decrypted || parentInState?.content || '';

            fileMsg.replied_message = {
              id: data.reply_to,
              sender_id: data.reply_to_sender_id,
              sender_username: data.reply_to_sender_username,
              content: quotedContent,
              sender_encrypted_content: data.sender_encrypted,
              file_url: data.reply_to_file_url,
              file_name: data.reply_to_file_name,
              file_type: data.reply_to_file_type,
            };
            try {
              const rm = fileMsg.replied_message;
              const rmCipher = (rm.sender_id === user.id) ? rm.sender_encrypted_content : rm.content;
              if (rmCipher) fileMsg.replied_message.decrypted = await decryptMessage(privateKey, rmCipher);
            } catch { fileMsg.replied_message.decrypted = ''; }
          }

          setMessages(prev => normalizeRepliedMessages([...prev, fileMsg]));

          try {
            await axios.post(`${API_BASE}/chat/seen/${otherUser.id}/`);
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'seen', message_id: data.message_id || data.id }));
            }
          } catch { }

          return;
        }

        if (data.sender_id === user.id) {
          setMessages(prev => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (!prev[i].id && prev[i].sender_id === user.id) {
                const updated = [...prev];
                updated[i] = { ...updated[i], id: data.message_id };
                return normalizeRepliedMessages(updated);
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
        const newMsg = { ...data, id: data.message_id, decrypted: decryptedText };
        setMessages(prev => normalizeRepliedMessages([...prev, newMsg]));

        try {
          await axios.post(`${API_BASE}/chat/seen/${otherUser.id}/`);
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'seen', message_id: data.message_id || data.id }));
          }
        } catch { }
      };

      socket.onerror = (err) => console.error('WebSocket error', err);

      socket.onclose = () => {
        if (closed) return;
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        setReconnecting(true);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      clearTimeout(typingTimerRef.current);
    };
  }, [otherUser.id, user.id, privateKey]);

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
    const text = input.trim();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiver_id', otherUser.id);
    formData.append('group', 'false');

    let encryptedForReceiver = '';
    let encryptedForSender = '';
    let plainTextForOptimistic = text;

    if (text && receiverPublicKeyRef.current) {
      try {
        encryptedForReceiver = await encryptMessage(receiverPublicKeyRef.current, text);
        const ownPublicKey = await getOwnPublicKey(user.id);
        encryptedForSender = ownPublicKey ? await encryptMessage(ownPublicKey, text) : '';
      } catch (e) {
        console.error('Failed to encrypt text for file message', e);
      }
    }

    try {
      const res = await axios.post(`${API_BASE}/chat/upload/`, formData);
      const { file_url, file_name, file_type } = res.data;

      const payload = {
        type: 'file',
        file_url,
        file_name,
        file_type,
        file_path: res.data.file_path,
        message: encryptedForReceiver || undefined,
        sender_encrypted: encryptedForSender || undefined,
        text: text || undefined,
      };
      if (replyTo) payload.reply_to = replyTo.id;

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(payload));
      }

      const tempId = `temp-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        temp: true,
        sender_id: user.id,
        sender_username: user.username,
        decrypted: plainTextForOptimistic,
        file_url,
        file_name,
        file_type,
        timestamp: new Date().toISOString(),
        sender_encrypted_content: encryptedForSender || undefined,
        content: encryptedForReceiver || undefined,
        reply_to: replyTo ? replyTo.id : null,
        replied_message: replyTo ? {
          id: replyTo.id,
          sender_username: replyTo.sender_username || replyTo.sender_display_name,
          content: replyTo.decrypted || replyTo.content || '',
          file_url: replyTo.file_url || null,
          file_name: replyTo.file_name || null,
          file_type: replyTo.file_type || null,
        } : null,
      }]);

      setInput('');
      setReplyTo(null);
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
            {reconnecting && (
              <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 'normal' }}>
                ⟳ Reconnecting...
              </span>
            )}
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

export default PrivateChat;
