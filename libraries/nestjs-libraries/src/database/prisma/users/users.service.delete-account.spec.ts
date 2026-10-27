import 'reflect-metadata';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.repository',
  () => ({ UsersRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository',
  () => ({ OrganizationRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository',
  () => ({ IntegrationRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import { UsersService } from './users.service';

// Account deletion (#393): the owned workspaces are marked for the 30-day
// hard deletion; a workspace the user was only a member of is left alone.
describe('UsersService.deleteAccount schedules the content purge', () => {
  afterEach(() => jest.useRealTimers());

  it('marks only the owned workspaces with purgeAfter = now + 30 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T12:00:00Z'));

    const orgs = [
      { id: 'owned', users: [{ role: 'SUPERADMIN' }] },
      { id: 'member-of', users: [{ role: 'USER' }] },
    ];
    const organizationRepository = {
      getOrgsByUserId: jest.fn().mockResolvedValue(orgs),
      getTeam: jest.fn(async (id: string) => ({
        users:
          id === 'owned'
            ? [{ user: { id: 'u1' }, role: 'SUPERADMIN' }]
            : [
                { user: { id: 'u1' }, role: 'USER' },
                { user: { id: 'boss' }, role: 'SUPERADMIN' },
              ],
      })),
      deleteTeamMember: jest.fn(),
      deleteOrganization: jest.fn(),
    };
    const integrationRepository = {
      deleteIntegrationsForAccount: jest.fn(),
    };
    const usersRepository = { deleteAccount: jest.fn() };

    const service = new UsersService(
      usersRepository as any,
      organizationRepository as any,
      integrationRepository as any,
      {} as any
    );

    await service.deleteAccount('u1');

    expect(organizationRepository.deleteOrganization).toHaveBeenCalledTimes(1);
    const [orgId, purgeAfter] =
      organizationRepository.deleteOrganization.mock.calls[0];
    expect(orgId).toBe('owned');
    expect(purgeAfter.toISOString()).toBe('2026-11-26T12:00:00.000Z');

    // the immediate removal stays as it was
    expect(
      integrationRepository.deleteIntegrationsForAccount
    ).toHaveBeenCalledWith('owned');
    expect(usersRepository.deleteAccount).toHaveBeenCalledWith('u1');
    // the shared workspace only loses this member
    expect(organizationRepository.deleteTeamMember).toHaveBeenCalledWith(
      'member-of',
      'u1'
    );
  });
});
