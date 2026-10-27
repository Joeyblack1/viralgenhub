import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { EarlyAccessService } from '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.service';
import { AdminSettingsService } from '@gitroom/nestjs-libraries/database/prisma/admin-settings/admin-settings.service';
import dayjs from 'dayjs';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { AdminSetUserDisabledDto } from '@gitroom/nestjs-libraries/dtos/users/admin.set.user.disabled.dto';

@ApiTags('Admin')
@Controller('/admin')
export class AdminController {
  constructor(
    private _errorsService: ErrorsService,
    private _adminStatsService: AdminStatsService,
    private _usersService: UsersService,
    private _earlyAccessService: EarlyAccessService,
    private _adminSettingsService: AdminSettingsService
  ) {}

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
  }

  @Get('/errors')
  async listErrors(
    @GetUserFromRequest() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('email') email?: string,
    @Query('unknownFirst') unknownFirst?: string
  ) {
    this.assertSuperAdmin(user);
    return this._errorsService.listErrors({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      platform: platform || undefined,
      email: email || undefined,
      unknownFirst: unknownFirst === 'true' || unknownFirst === '1',
    });
  }

  @Get('/errors/platforms')
  async listPlatforms(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._errorsService.listPlatforms();
  }

  @Get('/users')
  async listUsers(
    @GetUserFromRequest() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string
  ) {
    this.assertSuperAdmin(user);
    return this._usersService.listUsers({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      search: search?.trim() || undefined,
    });
  }

  // Disabling refuses the user's cookie/header sessions and new logins at
  // once (the auth middleware checks the flag on every request); enabling
  // lifts it. It does not touch the organisation's public API key or OAuth
  // app tokens, which belong to the workspace. A super admin cannot disable
  // themselves or another super admin.
  @Post('/users/:id/disabled')
  async setUserDisabled(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: AdminSetUserDisabledDto
  ) {
    this.assertSuperAdmin(user);
    if (id === user.id) {
      throw new HttpException('You cannot disable your own account', 400);
    }
    const target = await this._usersService.getUserById(id);
    if (!target) {
      throw new HttpException('User not found', 404);
    }
    if (target.isSuperAdmin && body.disabled) {
      throw new HttpException('A platform admin cannot be disabled', 400);
    }
    return this._usersService.setDisabled(id, body.disabled);
  }

  @Get('/early-access')
  async listEarlyAccess(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._earlyAccessService.adminList();
  }

  @Post('/early-access/:id/approve')
  async approveEarlyAccess(
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    this.assertSuperAdmin(user);
    return this._earlyAccessService.approve(id);
  }

  @Post('/early-access/notify/:provider')
  async notifyEarlyAccess(
    @GetUserFromRequest() user: User,
    @Param('provider') provider: string
  ) {
    this.assertSuperAdmin(user);
    return this._earlyAccessService.notifyWaitlist(provider);
  }

  // Which security and provider settings are in place; flags only, never values.
  @Get('/settings-check')
  async getSettingsCheck(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._adminSettingsService.check();
  }

  @Get('/x-spend')
  async getXSpend(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._adminStatsService.getXSpend();
  }

  @Get('/stats')
  async getStats(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unknownOnly') unknownOnly?: string
  ) {
    this.assertSuperAdmin(user);

    const fromDate = from ? dayjs(from) : dayjs().subtract(30, 'day');
    const toDate = to ? dayjs(to) : dayjs();

    return this._adminStatsService.getStats({
      from: fromDate.startOf('day').toDate(),
      to: toDate.endOf('day').toDate(),
      unknownOnly: unknownOnly === 'true' || unknownOnly === '1',
    });
  }
}
