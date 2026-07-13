const Flash = ({ flash }) => {
  if (!flash) return null;
  return (
    <div className={`flash-message ${flash.type === 'success' ? 'flash-success' : 'flash-error'}`}>
      <span>{flash.msg}</span>
    </div>
  );
};

export default Flash;
