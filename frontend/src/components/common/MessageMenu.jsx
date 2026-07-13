import { useState } from 'react';

const MessageMenu = ({ onReply, onDelete, isOwnMessage }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = () => setShowMenu(!showMenu);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          color: 'var(--text-muted)',
          padding: '2px 4px',
          borderRadius: '4px',
          lineHeight: 1,
        }}
      >
        ⋮
      </button>
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '4px 0',
            minWidth: '100px',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          onMouseLeave={() => setShowMenu(false)}
        >
          <button
            onClick={() => {
              onReply();
              setShowMenu(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-color)',
            }}
          >
            Reply
          </button>

          {isOwnMessage && (
            <button
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#e74c3c',
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageMenu;
