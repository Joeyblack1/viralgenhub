import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';

// Lifetime codes are never sold, so the upstream redeem page is gone. Old links land on the billing page.
export default function Page() {
  redirect('/billing');
}
