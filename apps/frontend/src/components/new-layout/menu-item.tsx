'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';
import { LockIcon } from '@gitroom/frontend/components/billing/plan.lock';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  // ViralGenHub: a feature of a higher plan, shown with a small lock
  locked?: boolean;
}> = ({ label, icon, path, onClick, locked }) => {
  const currentPath = usePathname();
  const isActive = currentPath.indexOf(path) === 0;

  const className = clsx(
    'group w-full minCustom:h-[54px] custom:h-[44px] py-[8px] px-[6px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-colors',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  const inner = (
    <>
      <div className="relative custom:scale-90 transition-transform">
        {icon}
        {locked && (
          <span
            className="absolute -bottom-[3px] -end-[7px] w-[13px] h-[13px] rounded-full bg-newBgColorInner flex items-center justify-center"
            data-testid="menu-lock"
          >
            <LockIcon size={9} />
          </span>
        )}
      </div>
      <div className="custom:text-[9px] minCustom:text-[10px] leading-[1.1] text-center">
        {label}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} title={label} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      {inner}
    </Link>
  );
};
