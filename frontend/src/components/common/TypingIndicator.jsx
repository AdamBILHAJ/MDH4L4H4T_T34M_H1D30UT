const TypingIndicator = ({ typingUsers, allUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;
  const names = typingUsers
    .map(id => {
      const u = allUsers?.find(u => u.id === id);
      return u ? (u.display_name || u.username) : 'Someone';
    })
    .join(', ');
  const label = typingUsers.length === 1 ? `${names} is typing` : `${names} are typing`;
  return (
    <div style={{
      padding: '4px 1.5rem 2px',
      fontSize: '0.75rem',
      color: 'var(--text-muted)',
      fontStyle: 'italic',
      display: 'flex', alignItems: 'center', gap: '6px',
      minHeight: '20px',
    }}>
      <span style={{ display: 'inline-flex', gap: '2px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: `typingBounce 1s ease-in-out ${i * 0.15}s infinite`,
            display: 'inline-block',
          }} />
        ))}
      </span>
      {label}...
    </div>
  );
};

export default TypingIndicator;
