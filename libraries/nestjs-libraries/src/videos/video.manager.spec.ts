import 'reflect-metadata';
import { VideoManager } from './video.manager';

describe('VideoManager.getVideoByName', () => {
  it('returns undefined for an unknown video type instead of throwing', () => {
    const manager = new VideoManager({ get: jest.fn() } as any);
    expect(manager.getVideoByName('no-such-video')).toBeUndefined();
  });
});
