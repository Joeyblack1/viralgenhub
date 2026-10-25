import 'reflect-metadata';

// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import {
  HashnodeProvider,
  HASHNODE_PRO_REQUIRED_MESSAGE,
} from './hashnode.provider';

describe('HashnodeProvider.handleErrors', () => {
  const provider = new HashnodeProvider();

  it('maps a 403 to a non-retrying Pro-required bad-body', () => {
    expect(provider.handleErrors('{}', 403)).toEqual({
      type: 'bad-body',
      value: HASHNODE_PRO_REQUIRED_MESSAGE,
    });
  });

  it('maps a 402 payment error', () => {
    expect(provider.handleErrors('{}', 402)?.type).toBe('bad-body');
  });

  it('maps a GraphQL "requires Pro" error returned with status 200', () => {
    const body = JSON.stringify({
      errors: [{ message: 'API access requires a Pro plan on this publication' }],
    });
    expect(provider.handleErrors(body, 200)).toEqual({
      type: 'bad-body',
      value: HASHNODE_PRO_REQUIRED_MESSAGE,
    });
  });

  it('says what to do in the message', () => {
    expect(HASHNODE_PRO_REQUIRED_MESSAGE).toContain('Hashnode Pro plan');
    expect(HASHNODE_PRO_REQUIRED_MESSAGE).toContain('Billing');
  });

  it('leaves unrelated errors alone', () => {
    expect(provider.handleErrors('{"errors":[{"message":"Bad tag"}]}', 200)).toBeUndefined();
    expect(provider.handleErrors('{}', 500)).toBeUndefined();
  });
});
