export const dynamic = 'force-dynamic';
import { AdminEarlyAccessComponent } from '@gitroom/frontend/components/admin/admin-early-access.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: `${'ViralGenHub'} Admin Early Access`,
  description: '',
};

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <AdminEarlyAccessComponent />
    </div>
  );
}
