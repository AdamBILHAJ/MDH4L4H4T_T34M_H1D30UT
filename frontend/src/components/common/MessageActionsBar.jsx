import MessageMenu from './MessageMenu';

const MessageActionsBar = ({ messageId, onReply, onDelete, isOwnMessage }) => {
  return (
    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
      <MessageMenu
        onReply={() => onReply?.(messageId)}
        onDelete={() => onDelete?.(messageId)}
        isOwnMessage={isOwnMessage}
      />
    </div>
  );
};

export default MessageActionsBar;
