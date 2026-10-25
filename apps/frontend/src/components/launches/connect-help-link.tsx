'use client';

// ViralGenHub: small "Where do I get this?" link under bring-your-own-key forms.
import React, { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { connectHelpUrl } from '@gitroom/frontend/components/launches/custom-field-placeholders';

export const ConnectHelpLink: FC<{ identifier: string }> = ({ identifier }) => {
  const t = useT();
  const url = connectHelpUrl(identifier);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[13px] underline hover:font-bold"
    >
      {t('vgh_connect_help', 'Where do I get this?')}
    </a>
  );
};
