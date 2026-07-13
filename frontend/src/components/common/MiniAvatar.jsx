const MiniAvatar = ({ user, size = 18 }) => {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.username}
        title={`Seen by ${user.display_name || user.username}`}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '1.5px solid var(--bg-color)',
          marginLeft: -4,
        }}
      />
    );
  }
  return (
    <div
      title={`Seen by ${user?.display_name || user?.username}`}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--primary-color)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45, fontWeight: 'bold',
        border: '1.5px solid var(--bg-color)',
        marginLeft: -4,
      }}
    >
      {(user?.display_name || user?.username || '?')[0].toUpperCase()}
    </div>
  );
};

export default MiniAvatar;
