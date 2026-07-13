import { useState, useEffect, useCallback, useRef } from 'react';
import ChatLayout from './ChatLayout';
import { axios, API_BASE, WS_GROUP } from '../../api/client';
import { importPublicKey, decryptMessage, encryptMessage, generateAESKey, exportAESKey, importAESKey, decryptAES, encryptAES } from '../../crypto';
import { getAccessToken } from '../../tokenManager';

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
  const messagesRef = useRef([]);

  useEffect(() => {
    usersRef.current = allUsers;
  }, [allUsers]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        const normalized = normalizeRepliedMessages(decrypted);
        setMessages(normalized);
        const sb = {};
        res.data.forEach(msg => { if (msg.seen_by?.length) sb[msg.id] = msg.seen_by; });
        setSeenBy(sb);
      } catch { }
    };
    fetchHistory();
  }, [privateKey]);

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

      if (data.type === 'file') {
        if (data.sender_id === user.id) {
          setMessages(prev => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (!prev[i].id && prev[i].sender_id === user.id) {
                const updated = [...prev];
                const optimistic = { ...updated[i] };

                updated[i] = {
                  ...optimistic,
                  id: data.message_id,
                };

                if (data.reply_to) {
                  updated[i].reply_to = data.reply_to;
                  updated[i].replied_message = {
                    id: data.reply_to,
                    sender_id: data.reply_to_sender_id,
                    sender_username: data.reply_to_sender_username || data.sender_username,
                    content: data.reply_to_content || '',
                    decrypted: data.reply_to_content || '',
                    file_url: data.reply_to_file_url || null,
                    file_name: data.reply_to_file_name || null,
                    file_type: data.reply_to_file_type || null,
                  };
                }

                return updated;
              }
            }
            return prev;
          });
          return;
        }

        let fileMsg = { ...data, id: data.message_id, decrypted: '' };

        if (data.reply_to) {
          fileMsg.replied_message = {
            id: data.reply_to,
            sender_id: data.reply_to_sender_id,
            sender_username: data.reply_to_sender_username,
            content: data.reply_to_content || '',
            decrypted: data.reply_to_content || '',
            file_url: data.reply_to_file_url || null,
            file_name: data.reply_to_file_name || null,
            file_type: data.reply_to_file_type || null,
          };
        }

        setMessages(prev => normalizeRepliedMessages([...prev, fileMsg]));
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
              return normalizeRepliedMessages(updated);
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
        const newMsg = { ...data, id: data.message_id, decrypted: decryptedText };
        if (data.reply_to) {
          newMsg.replied_message = {
            id: data.reply_to,
            sender_id: data.reply_to_sender_id,
            sender_username: data.reply_to_sender_username,
            content: data.reply_to_content || '',
            decrypted: data.reply_to_content || '',
            file_url: data.reply_to_file_url || null,
            file_name: data.reply_to_file_name || null,
            file_type: data.reply_to_file_type || null,
          };
        }
        setMessages(prev => normalizeRepliedMessages([...prev, newMsg]));
      } catch {
        const fallback = { ...data, id: data.message_id, decrypted: '[encrypted message]' };
        if (data.reply_to) {
          fallback.replied_message = {
            id: data.reply_to,
            sender_id: data.reply_to_sender_id,
            sender_username: data.reply_to_sender_username,
            content: data.reply_to_content || '',
            decrypted: data.reply_to_content || '',
            file_url: data.reply_to_file_url || null,
            file_name: data.reply_to_file_name || null,
            file_type: data.reply_to_file_type || null,
          };
        }
        setMessages(prev => normalizeRepliedMessages([...prev, fallback]));
      }
    };

    socket.onerror = (err) => console.error('WebSocket error', err);
    return () => { socket.close(); clearTimeout(typingTimerRef.current); };
  }, [user.id, privateKey]);

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
      payload.reply_to_content = replyTo.decrypted || replyTo.content || '';
    }
    socketRef.current.send(JSON.stringify(payload));
    isTypingRef.current = false;
    socketRef.current.send(JSON.stringify({ type: 'typing_stop' }));

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
    const text = input.trim();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('group', 'true');
    try {
      const res = await axios.post(`${API_BASE}/chat/upload/`, formData);
      const { file_url, file_name, file_type } = res.data;

      const payload = {
        type: 'file',
        file_url,
        file_name,
        file_type,
        file_path: res.data.file_path,
        text: text || undefined,
      };
      if (replyTo) {
        payload.reply_to = replyTo.id;
        payload.reply_to_content = replyTo.decrypted || replyTo.content || '';
      }

      socketRef.current?.send(JSON.stringify(payload));

      setMessages(prev => [...prev, {
        sender_id: user.id,
        sender_username: user.display_name || user.username,
        decrypted: text,
        file_url,
        file_name,
        file_type,
        timestamp: new Date().toISOString(),
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

export default GroupChat;
