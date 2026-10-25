import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AdminStatsRepository,
  OrgActivityParams,
  StatsParams,
} from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.repository';
import {
  estimateXSpend,
  registerXSpendSource,
  xSpendMonthRange,
} from '@gitroom/nestjs-libraries/integrations/social/x.spend';

@Injectable()
export class AdminStatsService implements OnModuleInit {
  constructor(private _adminStatsRepository: AdminStatsRepository) {}

  // The X provider checks the month's spend before it posts but has no
  // database access, so it asks through this registration.
  onModuleInit() {
    registerXSpendSource(() => this.getXSpend());
  }

  // This calendar month's (UTC) estimate of what X bills us for the posts
  // published through the X API.
  async getXSpend() {
    const now = new Date();
    const { from, to } = xSpendMonthRange(now);
    return estimateXSpend(
      await this._adminStatsRepository.getPublishedXPostContents(from, to),
      now
    );
  }

  getStats(params: StatsParams) {
    return this._adminStatsRepository.getStats(params);
  }

  getOrgActivity(params: OrgActivityParams) {
    return this._adminStatsRepository.getOrgActivity(params);
  }
}
