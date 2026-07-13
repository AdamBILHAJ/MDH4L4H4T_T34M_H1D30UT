import { useState, useEffect, useCallback, useRef } from 'react';

const useFlash = () => {
  const [flash, setFlash] = useState(null);
  const timerRef = useRef(null);

  const showFlash = useCallback((msg, type = 'error') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlash({ msg, type });
    timerRef.current = setTimeout(() => setFlash(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { flash, showFlash };
};

export { useFlash };
