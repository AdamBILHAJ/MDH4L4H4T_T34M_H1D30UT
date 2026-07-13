const Avatar = ({ user, size = 32, showPresence = false, onlineUsers = {} }) => {
  const isOnline = showPresence && onlineUsers[user?.id];
  const dotSize = Math.max(8, size * 0.28);
  const img = user?.avatar_url ? (
    <img
      src={user.avatar_url}
      alt={user.username}
      style={{
        width: size, height: size, borderRadius: '50%',
        objectFit: 'cover', flexShrink: 0,
        border: '2px solid var(--border-color)',
        display: 'block',
      }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--primary-color)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 'bold', flexShrink: 0,
      border: '2px solid var(--border-color)',
    }}>
      {(user?.display_name || user?.username || '?')[0].toUpperCase()}
    </div>
  );

  if (!showPresence) return img;

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      {img}
      <span style={{
        position: 'absolute',
        bottom: 0, right: 0,
        width: dotSize, height: dotSize,
        borderRadius: '50%',
        background: isOnline ? '#22c55e' : '#6b7280',
        border: '2px solid var(--sidebar-bg)',
        display: 'block',
        transition: 'background 0.3s',
      }} title={isOnline ? 'Online' : 'Offline'} />
    </div>
  );
};

export default Avatar;
