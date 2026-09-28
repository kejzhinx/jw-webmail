import React from 'react';

interface JWLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  className?: string;
  id?: string;
}

export const JWLogo: React.FC<JWLogoProps> = ({
  size = 'lg',
  showText = true,
  className = '',
  id = 'jw-summit-company-logo',
}) => {
  // Standalone Emblem Icon
  if (!showText) {
    const sizeClasses = {
      sm: 'h-7 w-auto',
      md: 'h-10 w-auto',
      lg: 'h-16 w-auto',
      xl: 'h-24 w-auto',
      '2xl': 'h-32 w-auto',
    };

    const chosenClass = sizeClasses[size] || sizeClasses.md;

    return (
      <div
        id={id}
        className={`inline-flex items-center justify-center select-none ${className}`}
      >
        <img
          src="/assets/company-logo-emblem.png"
          alt="JW Summit Emblem"
          className={`${chosenClass} object-contain drop-shadow-xs`}
          draggable={false}
        />
      </div>
    );
  }

  // Full Brand Logo (Emblem + Vertical Divider + JW SUMMIT GROUP INC.)
  const fullSizeClasses = {
    sm: 'h-8 w-auto max-w-[180px]',
    md: 'h-12 w-auto max-w-[260px]',
    lg: 'h-16 w-auto max-w-[360px]',
    xl: 'h-20 w-auto max-w-[440px]',
    '2xl': 'h-28 w-auto max-w-[560px]',
  };

  const chosenFullClass = fullSizeClasses[size] || fullSizeClasses.lg;

  return (
    <div
      id={id}
      className={`inline-flex items-center justify-center select-none ${className}`}
    >
      <img
        src="/assets/company-logo-full.png"
        alt="JW Summit Group Inc."
        className={`${chosenFullClass} object-contain drop-shadow-xs`}
        draggable={false}
      />
    </div>
  );
};
