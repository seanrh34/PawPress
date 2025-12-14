'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Don't render header for admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }
  
  return <Header />;
}
