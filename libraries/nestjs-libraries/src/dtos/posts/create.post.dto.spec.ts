import { ValidationPipe } from '@nestjs/common';
import { CreatePostDto } from './create.post.dto';

// The global pipe in apps/backend/src/main.ts runs with whitelist: true.
// POST /posts takes `any` and validates in PostsService.mapTypeToPost with a
// pipe of its own that does not whitelist, so today nothing here is stripped;
// these specs make sure the DTO is ready for the day that pipe does, pinning
// what must survive: the tags (nested via @Type), the settings discriminator
// that the publishing code reads, the per-post type marker and the media
// thumbnail offset; and that an undeclared field really is dropped.
const pipe = new ValidationPipe({ transform: true, whitelist: true });

const body = (settings: object, extra: object = {}) => ({
  type: 'schedule',
  shortLink: false,
  date: '2030-01-01T10:00:00.000Z',
  tags: [{ value: 'tag-1', label: 'Tag 1', colour: 'red' }],
  posts: [
    {
      type: 'normal',
      integration: { id: 'int-1', unknownField: true },
      value: [
        {
          content: 'hello',
          image: [
            {
              id: 'm1',
              path: 'https://cdn.example.com/a.png',
              alt: 'a',
              thumbnailTimestamp: 3,
            },
          ],
        },
      ],
      settings,
    },
  ],
  ...extra,
});

describe('CreatePostDto under whitelist: true', () => {
  const run = (plain: object) =>
    pipe.transform(plain, { type: 'body', metatype: CreatePostDto }) as Promise<CreatePostDto>;

  it('keeps tags with their value and label', async () => {
    const out = await run(body({ __type: 'bluesky' }));
    expect(out.tags).toEqual([{ value: 'tag-1', label: 'Tag 1' }]);
  });

  it('keeps the settings discriminator for a provider with no settings of its own', async () => {
    const out = await run(body({ __type: 'bluesky' }));
    expect((out.posts[0].settings as any).__type).toBe('bluesky');
  });

  it('keeps the settings discriminator for a provider with its own settings class', async () => {
    const out = await run(
      body({ __type: 'x', who_can_reply_post: 'everyone', community: '' })
    );
    expect((out.posts[0].settings as any).__type).toBe('x');
    expect((out.posts[0].settings as any).who_can_reply_post).toBe('everyone');
  });

  it('keeps the per-post type and the image fields, drops undeclared fields', async () => {
    const out = await run(body({ __type: 'bluesky' }, { somethingNew: 1 }));
    expect(out.posts[0].type).toBe('normal');
    expect(out.posts[0].integration).toEqual({ id: 'int-1' });
    expect(out.posts[0].value[0].image[0]).toEqual({
      id: 'm1',
      path: 'https://cdn.example.com/a.png',
      alt: 'a',
      thumbnailTimestamp: 3,
    });
    expect((out as any).somethingNew).toBeUndefined();
  });

  it('still rejects an unknown settings type', async () => {
    await expect(run(body({ __type: 'not-a-provider' }))).rejects.toBeDefined();
  });
});
