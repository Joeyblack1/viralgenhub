import React from 'react';

export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[10px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        width={36}
        height={36}
        className="rounded-[8px]"
      />
      <span className="text-[22px] font-[600]">ViralGenHub</span>
    </div>
  );
};
