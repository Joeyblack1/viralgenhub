// AGPL-3.0 section 13: users who interact with the app over a network must be
// able to get the source of the version they use.
export const SOURCE_URL = 'https://github.com/Joeyblack1/viralgenhub';

export const SourceFooter = () => (
  <div className="text-[12px] text-center opacity-70 py-[8px]">
    Built on{' '}
    <a
      href="https://github.com/gitroomhq/postiz-app"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Postiz
    </a>{' '}
    (AGPL-3.0) ·{' '}
    <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
      Source code
    </a>{' '}
    ·{' '}
    <a
      href="https://viralgenhub.com/privacy"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Privacy
    </a>{' '}
    ·{' '}
    <a
      href="https://viralgenhub.com/terms"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Terms
    </a>
  </div>
);
