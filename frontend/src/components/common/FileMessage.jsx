const FileMessage = ({ fileUrl, fileName, fileType }) => {
  const fullUrl = fileUrl?.startsWith('http') ? fileUrl : `${window.location.origin}${fileUrl}`;
  if (!fileUrl) return null;

  const isImage = fileType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName || '');
  const isVideo = fileType?.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(fileName || '');

  if (isImage) {
    return (
      <a href={fullUrl} target="_blank" rel="noreferrer">
        <img src={fullUrl} alt={fileName} style={{
          maxWidth: '220px', maxHeight: '200px', borderRadius: '8px',
          marginTop: '6px', display: 'block', objectFit: 'cover',
          border: '1px solid var(--border-color)',
        }} />
      </a>
    );
  }
  if (isVideo) {
    return (
      <video controls style={{ maxWidth: '280px', marginTop: '6px', borderRadius: '8px', display: 'block' }}>
        <source src={fullUrl} />
      </video>
    );
  }
  return (
    <a href={fullUrl} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: 'var(--input-bg)', border: '1px solid var(--border-color)',
      borderRadius: '8px', padding: '6px 12px', marginTop: '6px',
      color: 'var(--primary-color)', fontSize: '0.82rem', textDecoration: 'none',
    }}>
      📎 {fileName || 'Download file'}
    </a>
  );
};

export default FileMessage;
