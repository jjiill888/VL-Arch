import React, { forwardRef } from 'react';

interface IMEInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCompositionStateChange?: (isComposing: boolean) => void;
}

const IMEInput = forwardRef<HTMLInputElement, IMEInputProps>(
  ({ onCompositionStateChange, onCompositionStart, onCompositionEnd, style, ...props }, ref) => {

    const handleCompositionStart = (e: React.CompositionEvent<HTMLInputElement>) => {
      e.currentTarget.setAttribute('data-composing', 'true');
      onCompositionStateChange?.(true);
      onCompositionStart?.(e);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
      e.currentTarget.removeAttribute('data-composing');
      onCompositionStateChange?.(false);
      onCompositionEnd?.(e);
    };

    return (
      <input
        ref={ref}
        {...props}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        style={style}
      />
    );
  }
);

IMEInput.displayName = 'IMEInput';

export default IMEInput;